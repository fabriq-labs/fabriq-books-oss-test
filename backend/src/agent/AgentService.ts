import { FunctionGenerator } from './FunctionGenerator';
import { ModelService } from '../services/core/ModelService';
import { AuthContext } from '../auth/types';
import { ModelRegistry } from '../services/registry/ModelRegistry';
import logger from '../utils/logger';
import { generateText, streamText } from 'ai';
import { getModel, getModelId } from '../lib/ai/modelProvider';
import { ReadableStream } from 'stream/web';
import { DynamicPromptManager, PromptMetadata } from './prompt/DynamicPromptManager';
import { ToolManager } from './ToolManager';
import { processMessages, type RawMessage, type ProcessedMessage } from './utils/messageProcessor';
import { classifyQuestion, QueryClassification } from './utils/questionClassifier';
import { llmTraceLogger } from '../lib/llm-trace-logger';
import {
  getAgentSession,
  updateAgentSession,
  createAgentMessage,
  listAgentMessages,
} from './services/SessionService';
import { buildSessionContextBlock, shouldAutoContinue } from './prompt/constants';
import { sessionEventBus } from './services/SessionEventBus';
import { sessionTimeoutService } from './services/SessionTimeoutService';
import { getAgentStreamErrorMessage } from './utils/streamErrorMessage';
import prisma from '../lib/prisma';

// Default max steps for the agent loop
// Can be overridden via AGENT_MAX_STEPS environment variable
const DEFAULT_MAX_STEPS = 5;

// When a session targets a specific goal_model, only include these related models
// in the system prompt to reduce noise and improve LLM accuracy
const RELATED_MODELS: Record<string, string[]> = {
  posting: ['posting', 'account', 'payment_receipt', 'invoice'],
  account: ['account', 'posting'],
  invoice: ['invoice', 'supplier', 'purchase_order', 'posting', 'account'],
  trade: ['trade', 'instrument', 'holding', 'posting', 'account'],
};

/**
 * Main service for handling agent interactions
 */
export class AgentService {
  private functionGenerator: FunctionGenerator;
  private modelService: ModelService;

  constructor(/* No longer needs ModelProvider */) {
    this.functionGenerator = new FunctionGenerator();
    this.modelService = ModelService.getInstance();
  }

  /**
   * Common setup for handling requests (both streaming and non-streaming)
   * Processes messages, validates access, and prepares AI SDK configuration
   * 
   * Note: Tools are now selected separately based on question classification
   */
  private async prepareRequestSetup(
    message: string | any,
    auth: AuthContext,
    previousMessages: any[] = [],
    context?: any
  ): Promise<{
    accessibleModels: any[];
    processedMessages: ProcessedMessage[];
    modelName: string;
    systemPrompt: string;
    promptMetadata?: PromptMetadata;
  }> {
    // Get accessible models for the user
    const accessibleModels = ModelRegistry.getInstance().getAccessibleModels(auth.permissions || {});

    if (accessibleModels.length === 0) {
      throw new Error("You don't have access to any data models. Please contact your administrator.");
    }

    // Process messages: convert base64 file data → Uint8Array (required for AI SDK)
    // Routes passes latestMessage.content (array) - we need to reconstruct the message object
    const allMessages: RawMessage[] = [
      ...previousMessages,
      typeof message === 'string'
        ? { role: 'user' as const, content: message }
        : Array.isArray(message)
          ? { role: 'user' as const, content: message } // If message is content array, wrap it
          : message // If message is already a full message object, use it
    ];

    const processedMessages = processMessages(allMessages);

    // Determine the model name from context for prompt selection
    const modelName = context?.modelName || 'default';

    // Create system prompt with available models context and route context
    const { systemPrompt, promptMetadata } = await this.createSystemPrompt(auth.user?.id, accessibleModels, {
      ...context,
      permissions: auth.permissions || {},
      orgId: auth.user?.org_id || 'default'
    });

    return {
      accessibleModels,
      processedMessages,
      modelName,
      systemPrompt,
      promptMetadata
    };
  }

  /**
   * Handle a user request using Vercel AI SDK tools
   * 
   * Uses a unified approach:
   * - All tools (transactional + analytical) are always available
   * - Analytics prompt is always included
   * - maxSteps is configurable via AGENT_MAX_STEPS env (default: 5)
   * - Classification is kept for observability/logging only
   * 
   * This eliminates misclassification issues where analytical questions
   * were routed with too few steps or wrong tools.
   */
  async handleRequest(message: string | any, auth: AuthContext, previousMessages: any[] = [], context?: any, sessionId?: string): Promise<any> {
    try {
      logger.debug('Handling agent request', { userId: auth.user?.id, context, sessionId });

      // Arm (or reset) the session-level timeout watchdog
      if (sessionId) sessionTimeoutService.arm(sessionId);

      // Get configurable max steps from environment
      // Session turns get higher budget
      const maxSteps = sessionId
        ? parseInt(process.env.SESSION_MAX_STEPS || '20', 10)
        : parseInt(process.env.AGENT_MAX_STEPS || '', 10) || DEFAULT_MAX_STEPS;

      // Extract question text for classification
      const questionText = this.extractQuestionText(message);

      // Classify the question for observability only (not for branching)
      const classification = classifyQuestion(questionText);

      logger.info('Question classified (observability)', {
        type: classification.type,
        reasoning: classification.reasoning,
        questionPreview: questionText.substring(0, 100),
        maxSteps,
        sessionId,
      });

      // ── Derive context from session when available ──
      // If caller didn't specify a modelName (or used 'default'), use the session's goal_model
      let effectiveContext = { ...context };
      let sessionForContextHandleRequest: Awaited<ReturnType<typeof getAgentSession>> | null = null;
      let templateForHandleRequest: any = null;
      if (sessionId) {
        sessionForContextHandleRequest = await getAgentSession(sessionId);

        // Load template early — needed for focus_models (system prompt) and allowed_tools (tool filter)
        if (sessionForContextHandleRequest.template_id) {
          templateForHandleRequest = await prisma.agent_template.findUnique({
            where: { id: sessionForContextHandleRequest.template_id },
          });
        }

        if (!context?.modelName || context.modelName === 'default') {
          if (sessionForContextHandleRequest.goal_model) {
            effectiveContext.modelName = sessionForContextHandleRequest.goal_model;

            // focus_models: template declaration takes precedence over RELATED_MODELS fallback
            if (!effectiveContext.focusModels) {
              effectiveContext.focusModels =
                (templateForHandleRequest?.focus_models?.length > 0
                  ? templateForHandleRequest.focus_models
                  : RELATED_MODELS[sessionForContextHandleRequest.goal_model]) || undefined;
            }

            logger.info('Derived modelName from session goal_model', {
              sessionId,
              goalModel: sessionForContextHandleRequest.goal_model,
              focusModels: effectiveContext.focusModels,
              focusSource: templateForHandleRequest?.focus_models?.length > 0 ? 'template' : 'RELATED_MODELS',
            });
          }
        }
      }

      // Include reconciliation prompt only for reconciliation-specific sessions; other posting sessions
      // (e.g. categorisation) should not receive reconciliation instructions to avoid hallucinations.
      const isReconciliationSession = sessionForContextHandleRequest?.template_id === 'atpl_reconcile';
      const basePromptTypes = effectiveContext?.modelName === 'posting' && isReconciliationSession
        ? ['reconciliation', 'analytics', 'default']
        : ['analytics', 'default'];
      const enhancedContext = {
        ...effectiveContext,
        promptTypes: effectiveContext?.promptTypes?.length ? effectiveContext.promptTypes : basePromptTypes,
      };

      const { processedMessages, systemPrompt, promptMetadata, modelName } = await this.prepareRequestSetup(
        message,
        auth,
        previousMessages,
        enhancedContext
      );

      // ── Session context injection ──
      let finalSystemPrompt = systemPrompt;
      let sessionMessages: any[] = [];
      let stepIndexBeforeLLM: number | null = null;
      if (sessionId) {
        const session = await getAgentSession(sessionId);
        stepIndexBeforeLLM = session.current_step_index ?? null;
        sessionMessages = await listAgentMessages(sessionId, 50);

        // ── Template prompt merging ──
        // Use already-loaded template (avoids a second DB round-trip)
        if (session.template_id) {
          const template = templateForHandleRequest ?? await prisma.agent_template.findUnique({ where: { id: session.template_id } });
          if (template?.system_prompt) {
            finalSystemPrompt = template.system_prompt + '\n\n---\n\n' + finalSystemPrompt;
            logger.info('Template system prompt merged', { sessionId, templateId: session.template_id, templateName: template.name });
          }
        }

        // Determine isFirstTurn and justCreatedPlan
        const isFirstTurn = sessionMessages.length === 0;
        const justCreatedPlan = sessionMessages.length > 0 &&
          sessionMessages[sessionMessages.length - 1]?.tool_calls?.some?.(
            (tc: any) => tc.name === 'createPlan' || tc.toolName === 'createPlan'
          );

        const sessionBlock = buildSessionContextBlock(session, isFirstTurn, justCreatedPlan);
        finalSystemPrompt = finalSystemPrompt + '\n' + sessionBlock;

        logger.info('Session context injected', {
          sessionId,
          status: session.status,
          isFirstTurn,
          justCreatedPlan,
          currentStep: session.current_step_index,
        });
      }

      // Use unified tools (model-specific + analytics + session tools if applicable)
      const toolManager = ToolManager.getInstance();
      const templateAllowedTools: string[] = templateForHandleRequest?.allowed_tools || [];
      const tools = toolManager.getUnifiedTools(modelName, auth, enhancedContext, sessionId, templateAllowedTools);

      // Build messages: for session requests, include persisted session messages
      let allMessages: any[];
      if (sessionId && sessionMessages.length > 0) {
        // Use session message history + current message
        const historyMessages = sessionMessages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
        allMessages = [
          { role: 'system', content: finalSystemPrompt },
          ...historyMessages,
          ...(typeof message === 'string'
            ? [{ role: 'user', content: message }]
            : processedMessages.slice(-1)), // just the latest message
        ];
      } else {
        allMessages = [
          { role: 'system', content: finalSystemPrompt },
          ...processedMessages as any,
        ];
      }

      // Emit step_started before the LLM call (non-streaming path)
      if (sessionId) {
        try {
          const sessForEvent = await getAgentSession(sessionId);
          const currentStep = (sessForEvent.plan as any[])?.[sessForEvent.current_step_index ?? 0];
          if (currentStep) {
            sessionEventBus.emitSessionEvent(sessionId, sessForEvent.org_id, 'step_started', {
              step_index: sessForEvent.current_step_index,
              title: currentStep.title,
              type: currentStep.type,
            });
          }
        } catch { /* non-critical */ }
      }

      // Call generateText with configurable maxSteps
      const llmModelId = getModelId('agent');
      const startTime = Date.now();
      const result = await generateText({
        model: getModel('agent'),
        messages: allMessages as any,
        tools,
        maxSteps,  // Configurable via AGENT_MAX_STEPS env

        onStepFinish: async ({ text, toolCalls, stepType }) => {
          if (!sessionId) return;
          try {
            const sess = await getAgentSession(sessionId);
            const orgId = sess.org_id;

            // Emit tool_called events for each tool used in this step
            for (const tc of toolCalls ?? []) {
              sessionEventBus.emitSessionEvent(sessionId, orgId, 'tool_called', {
                tool_name: tc.toolName,
                step_index: sess.current_step_index,
                args_preview: JSON.stringify(tc.args).slice(0, 120),
              });
            }

            // Emit step_completed after the step finishes
            const stepTitle = (sess.plan as any[])?.[sess.current_step_index ?? 0]?.title ?? `Step ${(sess.current_step_index ?? 0) + 1}`;
            sessionEventBus.emitSessionEvent(sessionId, orgId, 'step_completed', {
              step_index: sess.current_step_index,
              title: stepTitle,
              result_preview: text?.slice(0, 200) ?? '',
            });

            // Session name generation: fires once, after the plan is created (first turn, createPlan tool used)
            const planJustCreated = (toolCalls ?? []).some((tc: any) => tc.toolName === 'createPlan');
            if (planJustCreated && !sess.name) {
              this.generateSessionName(sessionId, sess.goal, orgId, sess.template_id || undefined).catch(() => { });
            }
          } catch { /* non-critical */ }
        },
      });
      const durationMs = Date.now() - startTime;

      // ── Persist session messages ──
      if (sessionId) {
        // Save user message
        await createAgentMessage({
          session_id: sessionId,
          role: 'user',
          content: typeof message === 'string' ? message : questionText,
          step_index: (await getAgentSession(sessionId)).current_step_index ?? undefined,
        });

        // Save assistant message with tool call info
        const toolCalls = result.steps
          ?.flatMap((s: any) => s.toolCalls ?? [])
          .map((tc: any) => ({ toolName: tc.toolName, args: tc.args }));

        await createAgentMessage({
          session_id: sessionId,
          role: 'assistant',
          content: result.text || '',
          tool_calls: toolCalls?.length ? toolCalls : undefined,
          step_index: (await getAgentSession(sessionId)).current_step_index ?? undefined,
        });

        // Update last_active_at (handled by @updatedAt)
        await updateAgentSession(sessionId, {});

        // ── Auto-continuation ──
        const updatedSession = await getAgentSession(sessionId);
        const stepIndexAfterLLM = updatedSession.current_step_index ?? null;
        const stepAdvanced = stepIndexAfterLLM !== stepIndexBeforeLLM;

        if (shouldAutoContinue(updatedSession) && stepAdvanced) {
          const plan = updatedSession.plan as any[];
          const nextStep = plan?.[updatedSession.current_step_index ?? 0];
          if (nextStep) {
            const continuationMessage =
              `Continue with step ${nextStep.index + 1}: "${nextStep.title}". ${nextStep.description}`;
            logger.info('Auto-continuing session', {
              sessionId,
              nextStep: nextStep.index,
              title: nextStep.title,
            });
            setImmediate(() => {
              this.handleRequest(
                continuationMessage, auth, [], context, sessionId
              ).catch(err => logger.error('Auto-continuation failed', { sessionId, error: err.message }));
            });
          }
        } else if (!stepAdvanced && shouldAutoContinue(updatedSession)) {
          logger.warn('Auto-continuation skipped — step did not advance (preventing infinite loop)', {
            sessionId,
            stepIndex: stepIndexBeforeLLM,
          });
        }
      }

      // Fire-and-forget: log trace to PostgreSQL for observability
      llmTraceLogger.logTrace({
        orgId: auth.user?.org_id || 'default',
        userId: auth.user?.id,
        sessionId: sessionId || context?.sessionId,
        modelName: context?.modelName,
        viewName: context?.viewName,
        recordId: context?.recordId,
        queryType: classification.type,
        question: questionText,
        llmModel: llmModelId,
        result: {
          text: result.text,
          steps: result.steps as any,
          usage: result.usage,
        },
        durationMs,
        status: 'success',
      }).catch(() => { }); // swallow — already logged inside

      // Return the final content, toolResults, steps, and classification for debugging
      const response: any = {
        content: result.text,
        toolResults: result.toolResults,
        steps: result.steps,
        classification: {
          type: classification.type,
          maxSteps: maxSteps,
          reasoning: classification.reasoning
        }
      };

      // Attach debug metadata when requested (test harness, never in production)
      if (context?.debug) {
        response._debug = {
          systemPrompt: finalSystemPrompt,
          promptMetadata,
          promptSource: process.env.USE_LOCAL_PROMPT === 'true' ? 'local-files' : 'database',
          toolNames: Object.keys(tools),
          modelName,
          llmModel: llmModelId,
          maxSteps,
        };
      }

      return response;

    } catch (error: any) {
      logger.error('Error handling agent request', error.message);

      // Fire-and-forget: log error trace
      try {
        const questionText = this.extractQuestionText(message);
        llmTraceLogger.logTrace({
          orgId: auth.user?.org_id || 'default',
          userId: auth.user?.id,
          sessionId: sessionId || context?.sessionId,
          modelName: context?.modelName,
          viewName: context?.viewName,
          recordId: context?.recordId,
          question: questionText,
          llmModel: getModelId('agent'),
          result: { text: '', steps: [], usage: { promptTokens: 0, completionTokens: 0 } },
          durationMs: 0,
          status: 'error',
          errorMessage: (error as Error).message,
        }).catch(() => { });
      } catch { /* ignore */ }

      // Return error content for non-streaming requests
      if ((error as Error).message.includes("don't have access")) {
        return {
          content: (error as Error).message
        };
      }

      throw error;
    }
  }

  /**
   * Generate a short 4-6 word session name using the LLM and store it on the session.
   * Called fire-and-forget after the plan is created.
   */
  private async generateSessionName(sessionId: string, goal: string, orgId: string, templateId?: string): Promise<void> {
    try {
      // Fetch template name if templateId is provided
      let templateName = '';
      if (templateId) {
        const template = await prisma.agent_template.findUnique({
          where: { id: templateId },
          select: { name: true },
        });
        templateName = template?.name || '';
      }

      const taskContext = templateName
        ? `${templateName}: "${goal}"`
        : `financial task: "${goal}"`;

      const { text } = await generateText({
        model: getModel('agent'),
        messages: [{
          role: 'user',
          content: `Generate a concise 4-6 word title for this ${taskContext}. Reply with ONLY the title, no punctuation, no quotes.`,
        }],
        maxTokens: 20,
      });
      const name = text.trim().slice(0, 80);
      if (name) {
        await updateAgentSession(sessionId, { name } as any);
        sessionEventBus.emitSessionEvent(sessionId, orgId, 'session_status_changed', { field: 'name', name });
        logger.info('Session name generated', { sessionId, name, templateId });
      }
    } catch (err: any) {
      logger.warn('Session name generation failed', { sessionId, error: err.message });
    }
  }

  /**
   * Extract the question text from various message formats
   */
  private extractQuestionText(message: string | any): string {
    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(message)) {
      // Content array format
      const textPart = message.find((part: any) => part.type === 'text');
      return textPart?.text || '';
    }

    if (message?.content) {
      if (typeof message.content === 'string') {
        return message.content;
      }
      if (Array.isArray(message.content)) {
        const textPart = message.content.find((part: any) => part.type === 'text');
        return textPart?.text || '';
      }
    }

    return '';
  }

  /**
   * Create system prompt with available models context
   */
  private async createSystemPrompt(
    userId: string,
    accessibleModels: any[],
    context?: any
  ): Promise<{ systemPrompt: string; promptMetadata?: PromptMetadata }> {
    // Determine the model name from context for prompt selection
    const modelName = context?.modelName || 'default';

    logger.debug('Creating system prompt', {
      modelName,
      contextModelName: context?.modelName,
      hasContext: !!context,
      contextKeys: context ? Object.keys(context) : [],

    });

    // Pass context directly - it contains recordId, stateId, viewId, modelContext
    const dynamicPromptManager = new DynamicPromptManager(
      context?.orgId || 'default', // org_id
      userId, // user_id
      modelName, // modelName
      context?.viewName, // viewName (optional)
      context?.promptTypes, // promptTypes (optional)
      context // Pass context directly instead of manually extracting fields
    );

    const result = await dynamicPromptManager.generateDynamicPromptWithMetadata(context?.permissions || {});
    const completePrompt = result.prompt;
    const promptMetadata = result.metadata;

    // Log the complete system prompt for debugging
    logger.info('Generated system prompt', {
      modelName,
      accessibleModelsCount: accessibleModels.length,
      promptLength: completePrompt.length,
      promptPreview: completePrompt.slice(0, 100),
      promptManagerType: 'DynamicPromptManager',
      // promptMetadata
    });

    return { systemPrompt: completePrompt, promptMetadata };
  }

  /**
   * Handle a streaming request using Vercel AI SDK tools
   * 
   * Uses a unified approach (same as handleRequest):
   * - All tools (transactional + analytical) are always available
   * - Analytics prompt is always included
   * - maxSteps is configurable via AGENT_MAX_STEPS env (default: 5)
   * - Classification is kept for observability/logging only
   */
  async handleStreamingRequest(message: string | any, auth: AuthContext, previousMessages: any[] = [], context?: any, sessionId?: string): Promise<ReadableStream> {
    try {
      logger.info('Starting streaming request handler', { userId: auth.user?.id, context, sessionId });

      // Arm (or reset) the session-level timeout watchdog
      if (sessionId) sessionTimeoutService.arm(sessionId);

      // Get configurable max steps from environment
      // Session turns get higher budget
      const maxSteps = sessionId
        ? parseInt(process.env.SESSION_MAX_STEPS || '20', 10)
        : parseInt(process.env.AGENT_MAX_STEPS || '', 10) || DEFAULT_MAX_STEPS;

      // Extract question text for classification
      const questionText = this.extractQuestionText(message);

      // Classify the question for observability only (not for branching)
      const classification = classifyQuestion(questionText);

      logger.info('Streaming request classified (observability)', {
        type: classification.type,
        reasoning: classification.reasoning,
        maxSteps: maxSteps  // Log actual maxSteps being used
      });

      // ── Derive context from session when available (same as handleRequest) ──
      let effectiveContext = { ...context };
      let sessionForContextStreaming: Awaited<ReturnType<typeof getAgentSession>> | null = null;
      let templateForStreaming: any = null;
      if (sessionId) {
        sessionForContextStreaming = await getAgentSession(sessionId);

        // Load template early — needed for focus_models and allowed_tools
        if (sessionForContextStreaming.template_id) {
          templateForStreaming = await prisma.agent_template.findUnique({
            where: { id: sessionForContextStreaming.template_id },
          });
        }

        if (!context?.modelName || context.modelName === 'default') {
          if (sessionForContextStreaming.goal_model) {
            effectiveContext.modelName = sessionForContextStreaming.goal_model;
            if (!effectiveContext.focusModels) {
              effectiveContext.focusModels =
                (templateForStreaming?.focus_models?.length > 0
                  ? templateForStreaming.focus_models
                  : RELATED_MODELS[sessionForContextStreaming.goal_model]) || undefined;
            }
          }
        }
      }

      // Include reconciliation prompt only for reconciliation-specific sessions.
      const isReconciliationSessionStreaming = sessionForContextStreaming?.template_id === 'atpl_reconcile';
      const basePromptTypes = effectiveContext?.modelName === 'posting' && isReconciliationSessionStreaming
        ? ['reconciliation', 'analytics', 'default']
        : ['analytics', 'default'];
      const enhancedContext = {
        ...effectiveContext,
        promptTypes: effectiveContext?.promptTypes?.length ? effectiveContext.promptTypes : basePromptTypes,
      };

      const { processedMessages, systemPrompt, promptMetadata, modelName } = await this.prepareRequestSetup(
        message,
        auth,
        previousMessages,
        enhancedContext
      );

      // ── Session context injection (same as handleRequest) ──
      let finalSystemPrompt = systemPrompt;
      let sessionMessages: any[] = [];
      let stepIndexBeforeLLM: number | null = null;
      if (sessionId) {
        // Reuse the already-loaded session snapshot; re-fetch only if it wasn't loaded above
        const session = sessionForContextStreaming ?? await getAgentSession(sessionId);
        stepIndexBeforeLLM = session.current_step_index ?? null;
        sessionMessages = await listAgentMessages(sessionId, 50);

        // ── Template prompt merging ──
        // Use already-loaded template (avoids a second DB round-trip)
        if (session.template_id) {
          const template = templateForStreaming ?? await prisma.agent_template.findUnique({ where: { id: session.template_id } });
          if (template?.system_prompt) {
            finalSystemPrompt = template.system_prompt + '\n\n---\n\n' + finalSystemPrompt;
          }
        }

        const isFirstTurn = sessionMessages.length === 0;
        const justCreatedPlan = sessionMessages.length > 0 &&
          sessionMessages[sessionMessages.length - 1]?.tool_calls?.some?.(
            (tc: any) => tc.name === 'createPlan' || tc.toolName === 'createPlan'
          );
        const sessionBlock = buildSessionContextBlock(session, isFirstTurn, justCreatedPlan);
        finalSystemPrompt = finalSystemPrompt + '\n' + sessionBlock;

        // Emit step_started for the current step
        const currentStep = (session.plan as any[])?.[session.current_step_index ?? 0];
        if (currentStep) {
          sessionEventBus.emitSessionEvent(sessionId, session.org_id, 'step_started', {
            step_index: session.current_step_index,
            title: currentStep.title,
            type: currentStep.type,
          });
        }
      }

      // Use unified tools (model-specific + analytics + session tools if applicable)
      const toolManager = ToolManager.getInstance();
      const templateAllowedToolsStreaming: string[] = templateForStreaming?.allowed_tools || [];
      const tools = toolManager.getUnifiedTools(modelName, auth, enhancedContext, sessionId, templateAllowedToolsStreaming);

      // Use streamText with configurable maxSteps
      const llmModelId = getModelId('agent');
      const startTime = Date.now();

      // Build messages: for session requests, include persisted session messages
      let allMessages: any[];
      if (sessionId && sessionMessages.length > 0) {
        const historyMessages = sessionMessages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
        allMessages = [
          { role: 'system', content: finalSystemPrompt },
          ...historyMessages,
          ...(typeof message === 'string'
            ? [{ role: 'user', content: message }]
            : processedMessages.slice(-1)),
        ];
      } else {
        allMessages = [
          { role: 'system', content: finalSystemPrompt },
          ...processedMessages as any,
        ];
      }

      const result = streamText({
        model: getModel('agent'),
        messages: allMessages as any, // Includes system prompt + session history (matches handleRequest pattern)
        tools,
        maxSteps,  // Configurable via AGENT_MAX_STEPS env

        onError: ({ error }) => {
          logger.error('streamText error during agent chat', {
            error: getAgentStreamErrorMessage(error),
            userId: auth.user?.id,
            sessionId,
            modelName: context?.modelName,
          });
        },

        onStepFinish: async ({ text, toolCalls }) => {
          if (!sessionId) return;
          try {
            const sess = await getAgentSession(sessionId);
            for (const tc of toolCalls ?? []) {
              sessionEventBus.emitSessionEvent(sessionId, sess.org_id, 'tool_called', {
                tool_name: tc.toolName,
                step_index: sess.current_step_index,
                args_preview: JSON.stringify(tc.args).slice(0, 120),
              });
            }
            const stepTitle = (sess.plan as any[])?.[sess.current_step_index ?? 0]?.title ?? `Step ${(sess.current_step_index ?? 0) + 1}`;
            sessionEventBus.emitSessionEvent(sessionId, sess.org_id, 'step_completed', {
              step_index: sess.current_step_index,
              title: stepTitle,
              result_preview: text?.slice(0, 200) ?? '',
            });
            const planJustCreated = (toolCalls ?? []).some((tc: any) => tc.toolName === 'createPlan');
            if (planJustCreated && !sess.name) {
              this.generateSessionName(sessionId, sess.goal, sess.org_id, sess.template_id || undefined).catch(() => { });
            }
          } catch { /* non-critical */ }
        },

        // LLM trace logging — fires when stream completes
        onFinish: async ({ text, usage, steps }) => {
          const durationMs = Date.now() - startTime;
          llmTraceLogger.logTrace({
            orgId: auth.user?.org_id || 'default',
            userId: auth.user?.id,
            sessionId: sessionId || context?.sessionId,
            modelName: context?.modelName,
            viewName: context?.viewName,
            recordId: context?.recordId,
            queryType: classification.type,
            question: questionText,
            llmModel: llmModelId,
            result: {
              text,
              steps: steps as any,
              usage,
            },
            durationMs,
            status: 'success',
          }).catch(() => { });

          // ── Persist session messages and auto-continue ──
          if (sessionId) {
            try {
              // Save user message
              await createAgentMessage({
                session_id: sessionId,
                role: 'user',
                content: typeof message === 'string' ? message : questionText,
                step_index: (await getAgentSession(sessionId)).current_step_index ?? undefined,
              });

              // Save assistant message with tool call info (same shape as handleRequest)
              const toolCalls = steps
                ?.flatMap((s: any) => s.toolCalls ?? [])
                .map((tc: any) => ({ toolName: tc.toolName, args: tc.args }));
              await createAgentMessage({
                session_id: sessionId,
                role: 'assistant',
                content: text || '',
                tool_calls: toolCalls?.length ? toolCalls : undefined,
                step_index: (await getAgentSession(sessionId)).current_step_index ?? undefined,
              });

              // Check auto-continuation (only if step advanced — prevents infinite loop)
              const latestSession = await getAgentSession(sessionId);
              const stepIndexAfterLLM = latestSession.current_step_index ?? null;
              const stepAdvanced = stepIndexAfterLLM !== stepIndexBeforeLLM;

              if (shouldAutoContinue(latestSession) && stepAdvanced) {
                const plan = latestSession.plan as any[];
                const nextStep = plan?.[latestSession.current_step_index ?? 0];
                if (nextStep) {
                  logger.info('Auto-continuing session (streaming)', {
                    sessionId,
                    stepIndex: latestSession.current_step_index,
                    stepTitle: nextStep.title,
                  });
                  setImmediate(async () => {
                    try {
                      await this.handleRequest(
                        `Continue with step ${(latestSession.current_step_index ?? 0) + 1}: "${nextStep.title}".`,
                        auth,
                        [],
                        { modelName: latestSession.goal_model || context?.modelName || 'posting' },
                        sessionId
                      );
                    } catch (err: any) {
                      logger.error('Auto-continuation failed (streaming)', {
                        sessionId,
                        error: err.message,
                      });
                    }
                  });
                }
              } else if (!stepAdvanced && shouldAutoContinue(latestSession)) {
                logger.warn('Auto-continuation skipped (streaming) — step did not advance', {
                  sessionId,
                  stepIndex: stepIndexBeforeLLM,
                });
              }
            } catch (err: any) {
              logger.error('Session persistence failed (streaming)', {
                sessionId,
                error: err.message,
              });
            }
          }
        },
      });

      // Forward LLM/provider errors to the client (default SDK masking → "An error occurred.")
      const streamResponse = result.toDataStreamResponse({
        getErrorMessage: getAgentStreamErrorMessage,
      });
      if (!streamResponse.body) {
        throw new Error('Failed to get stream response body');
      }

      // Return the stream
      return streamResponse.body as unknown as ReadableStream;

    } catch (error) {
      logger.error('Error handling streaming request', error);

      const effectiveSessionId = sessionId || context?.sessionId;

      // Mark the session failed immediately — don't wait for the 5-min watchdog
      if (effectiveSessionId) {
        try {
          const session = await prisma.agent_session.findUnique({
            where: { id: effectiveSessionId },
            select: { status: true, org_id: true },
          });
          if (session && (session.status === 'planning' || session.status === 'executing')) {
            await prisma.agent_session.update({
              where: { id: effectiveSessionId },
              data: { status: 'failed', completed_at: new Date() },
            });
            sessionTimeoutService.cancel(effectiveSessionId);
            sessionEventBus.emitSessionEvent(effectiveSessionId, session.org_id, 'session_status_changed', {
              status: 'failed',
              reason: (error as Error).message,
            });
          }
        } catch (updateErr) {
          logger.error('Failed to mark session as failed', { sessionId: effectiveSessionId, updateErr });
        }
      }

      // Fire-and-forget: log error trace with correct session_id
      try {
        const questionText = this.extractQuestionText(message);
        llmTraceLogger.logTrace({
          orgId: auth.user?.org_id || 'default',
          userId: auth.user?.id,
          sessionId: effectiveSessionId,
          modelName: context?.modelName,
          viewName: context?.viewName,
          recordId: context?.recordId,
          question: questionText,
          llmModel: getModelId('agent'),
          result: { text: '', steps: [], usage: { promptTokens: 0, completionTokens: 0 } },
          durationMs: 0,
          status: 'error',
          errorMessage: (error as Error).message,
        }).catch(() => { });
      } catch { /* ignore */ }

      throw error;
    }
  }

  /**
   * Handle request via streamText and consume to completion.
   * Uses the streaming API path (avoids "Invalid JSON response" from generateText).
   * Returns the same structure as handleRequest for compatibility.
   */
  async handleRequestViaStreaming(message: string | any, auth: AuthContext, previousMessages: any[] = [], context?: any): Promise<any> {
    try {
      const maxSteps = context?.maxAgentSteps || parseInt(process.env.AGENT_MAX_STEPS || '', 10) || DEFAULT_MAX_STEPS;
      const questionText = this.extractQuestionText(message);
      const classification = classifyQuestion(questionText);
      const basePromptTypes = context?.modelName === 'posting' ? ['reconciliation', 'analytics', 'default'] : ['analytics', 'default'];
      const enhancedContext = {
        ...context,
        promptTypes: context?.promptTypes?.length ? context.promptTypes : basePromptTypes,
      };

      const { processedMessages, systemPrompt, promptMetadata, modelName } = await this.prepareRequestSetup(
        message,
        auth,
        previousMessages,
        enhancedContext
      );

      const toolManager = ToolManager.getInstance();
      const tools = toolManager.getUnifiedTools(modelName, auth, enhancedContext);
      logger.info('maxSteps', { maxSteps });
      const llmModelId = getModelId('agent');
      const startTime = Date.now();
      const result = streamText({
        model: getModel('agent'),
        system: systemPrompt,
        messages: processedMessages as any,
        tools,
        maxSteps,
        onFinish: ({ text, usage, steps }) => {
          const durationMs = Date.now() - startTime;
          llmTraceLogger.logTrace({
            orgId: auth.user?.org_id || 'default',
            userId: auth.user?.id,
            sessionId: context?.sessionId,
            modelName: context?.modelName,
            viewName: context?.viewName,
            recordId: context?.recordId,
            queryType: classification.type,
            question: questionText,
            llmModel: llmModelId,
            result: { text, steps: steps as any, usage },
            durationMs,
            status: 'success',
          }).catch(() => { });
        },
      });

      await result.consumeStream();
      const text = await result.text;
      const steps = await result.steps;
      const toolResults = await result.toolResults;

      return {
        content: text,
        toolResults: toolResults ?? [],
        steps: steps ?? [],
        classification: {
          type: classification.type,
          maxSteps,
          reasoning: classification.reasoning,
        },
      };
    } catch (error: any) {
      logger.error('Error handling agent request (via streaming)', error.message);
      try {
        const questionText = this.extractQuestionText(message);
        llmTraceLogger.logTrace({
          orgId: auth.user?.org_id || 'default',
          userId: auth.user?.id,
          sessionId: context?.sessionId,
          modelName: context?.modelName,
          viewName: context?.viewName,
          recordId: context?.recordId,
          question: questionText,
          llmModel: getModelId('agent'),
          result: { text: '', steps: [], usage: { promptTokens: 0, completionTokens: 0 } },
          durationMs: 0,
          status: 'error',
          errorMessage: error.message,
        }).catch(() => { });
      } catch { /* ignore */ }
      throw error;
    }
  }

} 