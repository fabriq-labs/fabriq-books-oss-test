import { Router, Request } from 'express';
import { AgentService } from './AgentService';
import { authMiddleware } from '../auth/middleware';
import { requirePlatformAdmin } from '../auth/platformAdmin';
import { AuthContext } from '../auth/types';
import logger from '../utils/logger';
import { Readable } from 'stream';
import multer from 'multer';
import prisma from '../lib/prisma';
import { PermissionService } from '../services/permissions/PermissionService';
import { LegacyDataGraphParser } from '../utils/LegacyDataGraphParser';
import {
  createAgentSession,
  getAgentSession,
  listAgentSessions,
  updateAgentSession,
  createAgentMessage,
  listAgentMessages,
} from './services/SessionService';
import {
  createPendingAction,
  getPendingAction,
  listPendingActions,
  resolvePendingAction,
  bulkApproveByConfidence,
} from './services/PendingActionService';
import { getSessionTrace } from './services/SessionTraceService';
import { sessionEventBus } from './services/SessionEventBus';
import {
  formatAgentHttpError,
  getAgentHttpStatusCode,
  getAgentStreamErrorMessage,
} from './utils/streamErrorMessage';
import {
  buildBillUploadDataUri,
  resolveBillUploadMime,
} from './utils/billUploadMime';
import type { PlanStep } from './tools/sessionTools';
// Removing ai/express import since it appears to be causing issues
// import { createStreamDataHandler } from 'ai/express';

// Extend Express Request to include auth context and multer files
declare module 'express' {
  interface Request {
    context?: {
      auth?: AuthContext;
    };
    files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
  }
}

/**
 * Create and configure routes for agent interaction
 */
export function createAgentRouter() {
  const router = Router();

  // Create agent services
  const agentService = new AgentService();

  // Setup multer for file uploads
  // Note: Using memoryStorage() - files are NOT stored on disk, only kept in memory during processing
  const upload = multer({
    storage: multer.memoryStorage(), // Files stored in memory only, not persisted
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
  });

  // Regular chat endpoint
  router.post('/chat', authMiddleware, async (req: Request, res) => {
    console.log(authMiddleware);
    console.log('req.context:', JSON.stringify(req.context, null, 2));
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: "Unauthorized: Missing auth context" });
      }

      const { messages, context, sessionId } = req.body;
      if (!messages || messages.length === 0) {
        return res.status(400).json({ error: "No messages provided" });
      }

      // Get the latest message
      const latestMessage = messages[messages.length - 1];
      if (!latestMessage.content) {
        return res.status(400).json({ error: "No message content provided" });
      }

      logger.debug('Processing chat request', {
        userId: req.context.auth.user.id,
        orgId: req.context.auth.user.org_id,
        messagesCount: messages.length,
        context: context,
        sessionId: sessionId,
      });


      // Convert messages to ModelMessage format, excluding the latest message
      const previousMessages = messages
        .slice(0, -1)
        .map((msg: { role: string; content: string }) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        }))
        .filter((msg: { content: string }) => msg.content && msg.content.trim() !== '');

      // Process the request with context and optional sessionId
      const response = await agentService.handleRequest(
        latestMessage.content,
        req.context.auth,
        previousMessages,
        context,
        sessionId
      );

      // Always send the final response
      res.json({
        choices: [{
          message: {
            id: req.body.id,
            role: 'assistant',
            content: response.content || ''
          }
        }],
        steps: response.steps
      });
    } catch (error: any) {
      logger.error('Error in chat request:', error);
      res.status(500).json(formatAgentHttpError(error));
    }
  });

  // Streaming chat endpoint
  router.post('/chat/stream', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: "Unauthorized: Missing auth context" });
      }

      const { messages, context, sessionId } = req.body;
      if (!messages || messages.length === 0) {
        logger.warn('No messages provided in request');
        return res.status(400).json({ error: "No messages provided" });
      }

      // Get the latest message
      const latestMessage = messages[messages.length - 1];
      if (!latestMessage.content) {
        logger.warn('No message content provided in latest message');
        return res.status(400).json({ error: "No message content provided" });
      }

      logger.info('Processing streaming chat request', {
        userId: req.context.auth.user.id,
        orgId: req.context.auth.user.org_id,
        messagesCount: messages.length,
        contextModelName: context?.modelName,
        sessionId: sessionId,
      });

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Get the stream from agent service with context and optional sessionId
      const dataStream = await agentService.handleStreamingRequest(
        latestMessage.content,
        req.context.auth,
        messages.slice(0, -1),
        context,
        sessionId
      );

      if (!dataStream) {
        throw new Error('No data stream available');
      }

      // Convert ReadableStream to Node.js Readable stream
      const reader = dataStream.getReader();
      const readable = new Readable({
        async read() {
          try {
            const { done, value } = await reader.read();
            if (done) {
              this.push(null);
            } else {
              this.push(value);
            }
          } catch (error) {
            this.destroy(error as Error);
          }
        },
        destroy(error, callback) {
          reader.cancel().catch(() => undefined).finally(() => callback(error));
        },
      });

      // Unhandled 'error' on a piped Readable crashes the Node process (exit 1).
      // LLM provider failures (e.g. 402 credit/max_tokens) must be absorbed here.
      const failSessionBestEffort = async () => {
        if (!sessionId) return;
        try {
          const session = await prisma.agent_session.findUnique({
            where: { id: sessionId },
            select: { status: true },
          });
          if (session && (session.status === 'planning' || session.status === 'executing')) {
            await prisma.agent_session.update({
              where: { id: sessionId },
              data: { status: 'failed', completed_at: new Date() },
            });
          }
        } catch { /* best-effort */ }
      };

      readable.on('error', (error) => {
        logger.error('Streaming chat readable error', {
          error: getAgentStreamErrorMessage(error),
          sessionId,
          userId: req.context?.auth?.user?.id,
        });
        void failSessionBestEffort();
        if (!res.headersSent) {
          res.status(getAgentHttpStatusCode(error)).json(formatAgentHttpError(error));
          return;
        }
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify(formatAgentHttpError(error))}\n\n`);
          } catch { /* ignore */ }
          res.end();
        }
      });

      res.on('error', (error) => {
        logger.error('Streaming chat response error', {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      });

      // Pipe the readable stream to the response
      readable.pipe(res);

    } catch (error: any) {
      logger.error('Error in streaming chat request:', {
        error: error?.message || getAgentStreamErrorMessage(error),
        stack: error?.stack,
        sessionId: req.body?.sessionId,
      });

      // Defensively mark session failed if it is still in a running state.
      // AgentService should have already done this, but guard against cases
      // where the error occurred before AgentService could update the session.
      const { sessionId } = req.body;
      if (sessionId) {
        try {
          const session = await prisma.agent_session.findUnique({
            where: { id: sessionId },
            select: { status: true },
          });
          if (session && (session.status === 'planning' || session.status === 'executing')) {
            await prisma.agent_session.update({
              where: { id: sessionId },
              data: { status: 'failed', completed_at: new Date() },
            });
          }
        } catch { /* best-effort */ }
      }

      const httpError = formatAgentHttpError(error);
      const status = getAgentHttpStatusCode(error);

      // If headers haven't been sent yet, send error as JSON
      if (!res.headersSent) {
        res.status(status).json(httpError);
      } else if (!res.writableEnded) {
        // If headers were sent, send error as SSE
        res.write(`data: ${JSON.stringify(httpError)}\n\n`);
        res.end();
      }
    }
  });

  // Endpoint for agent requests
  router.post('/request', authMiddleware, async (req: Request, res) => {
    try {
      const { message, previousMessages = [], context } = req.body;

      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: "Unauthorized: Missing auth context" });
      }

      if (!message) {
        return res.status(400).json({ error: "No message provided" });
      }

      logger.debug('Processing agent request', {
        userId: req.context.auth.user.id,
        orgId: req.context.auth.user.org_id,
        context: context
      });

      // Process user request with context
      const response = await agentService.handleRequest(
        message,
        req.context.auth,
        previousMessages,
        context // Pass the context to the agent service
      );

      res.json({ response });
    } catch (error) {
      logger.error('Error in agent request:', error);
      res.status(500).json({
        error: (error as Error).message || 'Failed to process agent request',
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      });
    }
  });

  // AI extractor endpoint - accepts file upload and processes with tools
  // Files are processed in memory and NOT stored on disk
  // Using upload.any() to accept file with any field name (file, document, attachment, etc.)
  router.post('/extract', authMiddleware, upload.any(), async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: "Unauthorized: Missing auth context" });
      }

      // Validate file upload - accept file from any field name
      // req.files is an array when using upload.any(), but could be an object with upload.fields()
      let files: Express.Multer.File[] = [];
      if (Array.isArray(req.files)) {
        files = req.files;
      } else if (req.files && typeof req.files === 'object') {
        // If it's an object, flatten all files into a single array
        files = Object.values(req.files).flat();
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          error: "No file uploaded",
          message: "Please upload a file. The file field can be named 'file', 'document', 'attachment', or any other name."
        });
      }

      // Use the first file if multiple are uploaded
      const file = files[0];

      // Validate file size (already enforced by multer, but check anyway)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        return res.status(400).json({ error: "File size must be less than 10MB" });
      }

      // Normalize MIME: browsers often send empty/octet-stream for HEIC photos.
      const mimeResolved = resolveBillUploadMime({
        originalName: file.originalname,
        mimetype: file.mimetype,
      });
      if (!mimeResolved.ok) {
        return res.status(400).json({
          error: mimeResolved.error,
          message: mimeResolved.error,
        });
      }
      const resolvedMime = mimeResolved.mime;

      // Get optional prompt and context from request body
      const prompt = req.body.prompt || 'Extract data from this file';
      let context: any = undefined;

      if (req.body.context) {
        try {
          context = typeof req.body.context === 'string'
            ? JSON.parse(req.body.context)
            : req.body.context;
        } catch (error) {
          logger.warn('Failed to parse context JSON, context will be undefined', { error });
          context = undefined;
        }
      }

      logger.info('Processing extract request', {
        userId: req.context.auth.user.id,
        orgId: req.context.auth.user.org_id,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: resolvedMime,
        reportedMimeType: file.mimetype,
        mimeSource: mimeResolved.source,
        prompt,
        modelName: context?.modelName,
        viewName: context?.viewName,
        promptTypes: context?.promptTypes,
      });

      // Convert file buffer to base64 data URI — never use empty Multer MIME
      const dataUri = buildBillUploadDataUri(resolvedMime, file.buffer);

      // Create RawMessage format with file part
      const fileMessage = {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt },
          {
            type: 'file' as const,
            data: dataUri, // Base64 data URI format
            mimeType: resolvedMime,
            name: file.originalname
          }
        ]
      };

      // Process the request with AgentService via streaming (workaround for generateText "Invalid JSON response")
      const response = await agentService.handleRequestViaStreaming(
        fileMessage,
        req.context.auth,
        [], // No previous messages for extraction
        { ...context, maxAgentSteps: 2, maxRetries: 1 }
      );

      // Extract toolResults from steps if not directly available
      // The Vercel AI SDK may have toolResults in steps array instead of directly in result.toolResults
      let toolResults = response.toolResults || [];

      // If toolResults is empty, extract from steps
      if (!toolResults || toolResults.length === 0) {
        toolResults = [];
        if (response.steps && Array.isArray(response.steps)) {
          for (const step of response.steps) {
            if (step.toolResults && Array.isArray(step.toolResults)) {
              toolResults.push(...step.toolResults);
            }
          }
        }
      }

      logger.info('Extract request completed', {
        userId: req.context.auth.user.id,
        orgId: req.context.auth.user.org_id,
        fileName: file.originalname,
        toolResultsCount: toolResults.length,
        stepsCount: Array.isArray(response.steps) ? response.steps.length : 0,
      });

      // Return response with content, toolResults, steps, and file metadata
      res.json({
        content: response.content,
        toolResults: toolResults,
        steps: response.steps,
        fileInfo: {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: resolvedMime,
          uploadedAt: new Date().toISOString()
        }
      });

    } catch (error: any) {
      // Handle Multer errors specifically
      if (error.name === 'MulterError') {
        logger.error('Multer error in extract request:', {
          error: error.message,
          code: error.code,
          field: error.field
        });

        let errorMessage = 'File upload error';
        if (error.code === 'LIMIT_FILE_SIZE') {
          errorMessage = 'File size exceeds the 10MB limit';
        } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
          errorMessage = `Unexpected file field: ${error.field}. Please use a standard field name like 'file', 'document', or 'attachment'.`;
        } else {
          errorMessage = `File upload error: ${error.message}`;
        }

        return res.status(400).json({
          error: errorMessage,
          code: error.code
        });
      }

      const httpError = formatAgentHttpError(error);
      const status = getAgentHttpStatusCode(error);
      logger.error('Error in extract request:', {
        error: httpError.error,
        status,
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.context?.auth?.user?.id,
        orgId: req.context?.auth?.user?.org_id,
      });

      return res.status(status).json(httpError);
    }
  });

  // ==========================================
  // Agent Session Endpoints
  // ==========================================

  /** POST /api/agent/sessions — Create a new agent session */
  router.post('/sessions', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { goal, goal_model, mode, template_id, intake } = req.body;
      if (!goal) {
        return res.status(400).json({ error: 'goal is required' });
      }
      const tmpl = template_id
        ? await prisma.agent_template.findUnique({ where: { id: template_id } })
        : null;
      let resolvedGoalModel = goal_model;
      if (template_id && !goal_model && tmpl?.goal_model) {
        resolvedGoalModel = tmpl.goal_model;
      }

      let plan: PlanStep[] | undefined;
      let current_step_index: number | undefined;
      let accumulated_context: Record<string, any> | undefined;
      const pinned = tmpl?.pinned_plan;
      if (Array.isArray(pinned) && pinned.length > 0) {
        plan = pinned.map((s: any, i: number) => ({
          index: i,
          type: s.type,
          title: s.title,
          description: s.description,
          status: i === 0 ? 'in_progress' : 'pending',
          requires_approval: Boolean(s.requires_approval),
        }));
        current_step_index = 0;
      }



      const session = await createAgentSession({
        org_id: req.context.auth.user.org_id,
        user_id: req.context.auth.user.id,
        goal,
        goal_model: resolvedGoalModel,
        template_id,
        mode,
        plan,
        current_step_index,
        accumulated_context,
      });
      res.status(201).json({ data: session });
    } catch (error: any) {
      logger.error('Error creating agent session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/sessions — List sessions for current user */
  router.get('/sessions', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const sessions = await listAgentSessions(
        req.context.auth.user.id,
        req.context.auth.user.org_id
      );
      res.json({ data: sessions });
    } catch (error: any) {
      logger.error('Error listing agent sessions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/sessions/:id — Get session by ID */
  router.get('/sessions/:id', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const session = await getAgentSession(req.params.id);
      if (session.org_id !== req.context.auth.user.org_id) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json({ data: session });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Session not found' });
      }
      logger.error('Error getting agent session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** PATCH /api/agent/sessions/:id — Update session */
  router.patch('/sessions/:id', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const existing = await getAgentSession(req.params.id);
      if (existing.org_id !== req.context.auth.user.org_id) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const { status, mode, plan, current_step_index, accumulated_context } = req.body;
      const session = await updateAgentSession(req.params.id, {
        status,
        mode,
        plan,
        current_step_index,
        accumulated_context,
      });
      res.json({ data: session });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Session not found' });
      }
      logger.error('Error updating agent session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/agent/sessions/:id/clarify — Submit user answer to a clarification request */
  router.post('/sessions/:id/clarify', authMiddleware, async (req: Request, res) => {
    try {
      const auth = req.context?.auth;
      if (!auth?.user) return res.status(401).json({ error: 'Unauthorized' });

      const session = await getAgentSession(req.params.id);
      if (session.org_id !== auth.user.org_id) {
        return res.status(404).json({ error: 'Session not found' });
      }
      if (session.status !== 'awaiting_input') {
        return res.status(400).json({ error: 'Session is not awaiting input' });
      }

      const { response } = req.body;
      if (!response || typeof response !== 'string') {
        return res.status(400).json({ error: 'response is required' });
      }

      const clarificationRequest = session.clarification_request as any;
      const existingContext = (session.accumulated_context as Record<string, any>) || {};
      const clarifications = Array.isArray(existingContext.clarifications)
        ? existingContext.clarifications
        : [];
      clarifications.push({
        step_index: clarificationRequest?.step_index ?? session.current_step_index,
        question: clarificationRequest?.question ?? '',
        answer: response,
        context: clarificationRequest?.context ?? {},
        input_schema: clarificationRequest?.input_schema ?? null,
      });

      // Persist clarification as a user message so LLM sees it in history
      await createAgentMessage({
        session_id: session.id,
        role: 'user',
        content: response,
        step_index: session.current_step_index ?? undefined,
      });

      // Clear clarification_request, archive to accumulated_context, resume
      await updateAgentSession(session.id, {
        status: 'executing',
        clarification_request: null,
        accumulated_context: { ...existingContext, clarifications },
      });

      sessionEventBus.emitSessionEvent(session.id, session.org_id, 'session_status_changed', {
        status: 'executing',
      });

      // Trigger LLM continuation in background — same pattern as auto-continuation
      setImmediate(() => {
        agentService.handleRequest(
          response,
          auth,
          [],
          { modelName: session.goal_model || 'default' },
          session.id
        ).catch((err: any) => logger.error('Clarification continuation failed', {
          sessionId: session.id, error: err.message,
        }));
      });

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error handling clarification:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/sessions/:id/messages — List messages for a session */
  router.get('/sessions/:id/messages', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // Verify session belongs to user's org
      const session = await getAgentSession(req.params.id);
      if (session.org_id !== req.context.auth.user.org_id) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const messages = await listAgentMessages(req.params.id);
      res.json({ data: messages });
    } catch (error: any) {
      logger.error('Error listing agent messages:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/sessions/:id/trace — Full session trace (audit trail) */
  router.get('/sessions/:id/trace', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // Verify session belongs to user's org
      const session = await getAgentSession(req.params.id);
      if (session.org_id !== req.context.auth.user.org_id) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const trace = await getSessionTrace(req.params.id);
      res.json({ data: trace });
    } catch (error: any) {
      logger.error('Error getting session trace:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/sessions/:id/events — SSE stream of live session events */
  router.get('/sessions/:id/events', authMiddleware, async (req: Request, res) => {
    if (!req.context?.auth?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let session: any;
    try {
      session = await getAgentSession(req.params.id);
      if (session.org_id !== req.context.auth.user.org_id) {
        return res.status(404).json({ error: 'Session not found' });
      }
    } catch {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if applicable
    res.flushHeaders();

    const sendEvent = (event: object) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch { /* client disconnected */ }
    };

    // Send snapshot immediately: current session + recent trace
    try {
      const trace = await getSessionTrace(req.params.id);
      sendEvent({
        id: `evt_snapshot_${Date.now()}`,
        type: 'snapshot',
        sessionId: req.params.id,
        orgId: session.org_id,
        timestamp: new Date().toISOString(),
        data: { session, trace },
      });
    } catch (err: any) {
      logger.warn('SSE snapshot failed', { sessionId: req.params.id, error: err.message });
    }

    // Subscribe to live events
    const unsubscribe = sessionEventBus.subscribeSession(req.params.id, sendEvent);

    // Heartbeat every 30s to keep the connection alive through proxies
    const heartbeat = setInterval(() => {
      sendEvent({
        id: `evt_hb_${Date.now()}`,
        type: 'heartbeat',
        sessionId: req.params.id,
        orgId: session.org_id,
        timestamp: new Date().toISOString(),
        data: {},
      });
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });

  /** GET /api/agent/templates — List active agent templates */
  router.get('/templates', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const orgId = req.context.auth.user.org_id;
      const templates = await prisma.agent_template.findMany({
        where: {
          is_active: true,
          OR: [{ org_id: null }, { org_id: orgId }],
        },
        orderBy: { sort_order: 'asc' },
      });
      res.json({ data: templates });
    } catch (error: any) {
      logger.error('Error fetching agent templates:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================
  // Agent Template Admin Endpoints (Super Admin)
  // ==========================================

  /** GET /api/agent/admin/templates — List all templates (active + inactive) for admin */
  router.get('/admin/templates', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const templates = await prisma.agent_template.findMany({
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      });
      res.json({ data: templates });
    } catch (error: any) {
      logger.error('Error fetching admin agent templates:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/admin/templates/:id — Get a single agent template by ID */
  router.get('/admin/templates/:id', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const template = await prisma.agent_template.findUnique({ where: { id: req.params.id } });
      if (!template) return res.status(404).json({ error: 'Template not found' });
      res.json({ data: template });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/agent/admin/templates — Create a new agent template */
  router.post('/admin/templates', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const {
        name, description, icon, goal_model, system_prompt, user_hint, default_mode,
        is_active, sort_order, focus_models, allowed_tools, pinned_plan, intake_schema,
      } = req.body;
      if (!name || !description || !system_prompt || !user_hint) {
        return res.status(400).json({ error: 'name, description, system_prompt, and user_hint are required' });
      }
      const template = await prisma.agent_template.create({
        data: {
          name,
          description,
          icon: icon || 'bot',
          goal_model: goal_model || null,
          system_prompt,
          user_hint,
          default_mode: default_mode || 'supervised',
          is_active: is_active ?? true,
          sort_order: sort_order ?? 0,
          focus_models: Array.isArray(focus_models) ? focus_models : [],
          allowed_tools: Array.isArray(allowed_tools) ? allowed_tools : [],
          pinned_plan: pinned_plan ?? undefined,
          intake_schema: intake_schema ?? undefined,
          org_id: null,
        },
      });
      res.status(201).json({ data: template });
    } catch (error: any) {
      logger.error('Error creating agent template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** PUT /api/agent/admin/templates/:id — Update an agent template */
  router.put('/admin/templates/:id', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { id } = req.params;
      const {
        name, description, icon, goal_model, system_prompt, user_hint, default_mode,
        is_active, sort_order, focus_models, allowed_tools, pinned_plan, intake_schema,
      } = req.body;
      const existing = await prisma.agent_template.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Template not found' });
      const template = await prisma.agent_template.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(icon !== undefined && { icon }),
          ...(goal_model !== undefined && { goal_model: goal_model || null }),
          ...(system_prompt !== undefined && { system_prompt }),
          ...(user_hint !== undefined && { user_hint }),
          ...(default_mode !== undefined && { default_mode }),
          ...(is_active !== undefined && { is_active }),
          ...(sort_order !== undefined && { sort_order }),
          ...(focus_models !== undefined && {
            focus_models: Array.isArray(focus_models) ? focus_models : [],
          }),
          ...(allowed_tools !== undefined && {
            allowed_tools: Array.isArray(allowed_tools) ? allowed_tools : [],
          }),
          ...(pinned_plan !== undefined && { pinned_plan }),
          ...(intake_schema !== undefined && { intake_schema }),
        },
      });
      res.json({ data: template });
    } catch (error: any) {
      logger.error('Error updating agent template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** DELETE /api/agent/admin/templates/:id — Delete an agent template */
  router.delete('/admin/templates/:id', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { id } = req.params;
      const existing = await prisma.agent_template.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Template not found' });
      await prisma.agent_template.delete({ where: { id } });
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error deleting agent template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================
  // Agent Model Tool Config (Super Admin)
  // ==========================================

  /** GET /api/agent/admin/model-tools/catalog — Tool names + labels for checkboxes */
  router.get('/admin/model-tools/catalog', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { AGENT_TOOL_CATALOG } = await import('./toolRegistry');
      res.json({ data: AGENT_TOOL_CATALOG });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/admin/model-tools — List per-model tool configs */
  router.get('/admin/model-tools', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { listModelToolConfigsForAdmin } = await import('./agentModelToolConfigCache');
      const data = await listModelToolConfigsForAdmin();
      res.json({ data });
    } catch (error: any) {
      logger.error('Error listing model tool configs', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/admin/model-tools/:modelName */
  router.get('/admin/model-tools/:modelName', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { listModelToolConfigsForAdmin } = await import('./agentModelToolConfigCache');
      const configs = await listModelToolConfigsForAdmin();
      const row = configs.find((c) => c.model_name === req.params.modelName);
      if (!row) return res.status(404).json({ error: 'Model not found' });
      res.json({ data: row });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** PUT /api/agent/admin/model-tools/:modelName — Upsert model tool config */
  router.put('/admin/model-tools/:modelName', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { modelName } = req.params;
      const { display_name, description, model_tools, include_analytics_tools, is_active, sort_order } =
        req.body;
      if (!Array.isArray(model_tools)) {
        return res.status(400).json({ error: 'model_tools must be an array of tool names' });
      }
      const { upsertModelToolConfig } = await import('./agentModelToolConfigCache');
      const row = await upsertModelToolConfig(req.context.auth, modelName, {
        display_name,
        description,
        model_tools,
        include_analytics_tools,
        is_active,
        sort_order,
      });
      res.json({ data: row });
    } catch (error: any) {
      logger.error('Error upserting model tool config', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/agent/admin/model-tools/seed — Apply prisma/seed-agent-model-tools.sql (idempotent) */
  router.post('/admin/model-tools/seed', authMiddleware, requirePlatformAdmin, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { seedDefaultModelToolConfigs } = await import('./agentModelToolConfigCache');
      const count = await seedDefaultModelToolConfigs();
      res.json({ success: true, count, created: count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================
  // Pending Action Endpoints
  // ==========================================

  /** GET /api/agent/pending-actions/paginated — Paginated, filterable list for the Inbox */
  router.get('/pending-actions/paginated', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const orgId = req.context.auth.user.org_id;
      const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string || '25', 10)));
      const skip = (page - 1) * pageSize;

      const where: any = { org_id: orgId };
      if (req.query.session_id) where.session_id = req.query.session_id;
      if (req.query.action_type) where.action_type = req.query.action_type;
      if (req.query.confidence) where.confidence = req.query.confidence;
      if (req.query.status && req.query.status !== 'all') {
        where.status = req.query.status;
      } else if (!req.query.status) {
        where.status = 'pending'; // default to pending
      }

      const sortField = req.query.sort === 'confidence_desc' ? 'confidence_score' : 'created_at';
      const sortDir = 'desc';

      const [items, total] = await Promise.all([
        prisma.pending_action.findMany({
          where,
          orderBy: { [sortField]: sortDir },
          skip,
          take: pageSize,
        }),
        prisma.pending_action.count({ where }),
      ]);

      res.json({
        data: {
          items,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (error: any) {
      logger.error('Error listing paginated pending actions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/pending-actions — List pending actions */
  router.get('/pending-actions', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const filter: any = { org_id: req.context.auth.user.org_id };
      if (req.query.session_id) filter.session_id = req.query.session_id;
      if (req.query.status) filter.status = req.query.status;
      if (req.query.action_type) filter.action_type = req.query.action_type;
      const actions = await listPendingActions(filter);
      res.json({ data: actions });
    } catch (error: any) {
      logger.error('Error listing pending actions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/agent/pending-actions/:id — Get pending action by ID */
  router.get('/pending-actions/:id', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const action = await getPendingAction(req.params.id);
      if (action.org_id !== req.context.auth.user.org_id) {
        return res.status(404).json({ error: 'Pending action not found' });
      }
      res.json({ data: action });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Pending action not found' });
      }
      logger.error('Error getting pending action:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** PATCH /api/agent/pending-actions/:id — Resolve a pending action */
  router.patch('/pending-actions/:id', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { status, resolution_note, edited_payload, defer_until } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }
      const resolved = await resolvePendingAction(req.params.id, {
        status,
        resolved_by: req.context.auth.user.id,
        resolution_note,
        edited_payload,
        defer_until: defer_until ? new Date(defer_until) : undefined,
      }, req.context.auth);
      res.json({ data: resolved });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Pending action not found' });
      }
      logger.error('Error resolving pending action:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/agent/pending-actions/batch/:batchId/approve — Bulk approve by confidence */
  router.post('/pending-actions/batch/:batchId/approve', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { confidence } = req.body;
      if (!confidence || !['high', 'medium', 'low'].includes(confidence)) {
        return res.status(400).json({ error: 'confidence must be high, medium, or low' });
      }
      const approvedIds = await bulkApproveByConfidence(
        req.params.batchId,
        confidence,
        req.context.auth.user.id,
        req.context.auth
      );
      res.json({ data: { approved_count: approvedIds.length, approved_ids: approvedIds } });
    } catch (error: any) {
      logger.error('Error bulk approving actions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      provider: process.env.LLM_PROVIDER || 'vertex',
      version: '1.0.0'
    });
  });

  return router;
} 