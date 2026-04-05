import { Router, Request } from 'express';
import { AgentService } from './AgentService';
import { authMiddleware } from '../auth/middleware';
import { AuthContext } from '../auth/types';
import logger from '../utils/logger';
import { Readable } from 'stream';
import multer from 'multer';
import { categorizeTransactionHandler } from './handlers/erp/categorizeTransaction';
import { categorizeTransactionBatchHandler } from './handlers/erp/categorizeTransactionBatch';
import { reconcileImportedPostings } from '../services/reconciliation/reconcileImportedPostings';
import { confirmReconciliation } from '../services/reconciliation/confirmReconciliation';
import prisma from '../lib/prisma';
import { processEmail } from '../services/email/ProcessEmailService';
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
      res.status(500).json({
        error: error.message || 'Failed to process chat request',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Streaming chat endpoint
  router.post('/chat/stream', authMiddleware, async (req: Request, res) => {
    try {
      logger.info('Received streaming chat request', {
        path: req.path,
        method: req.method,
        headers: req.headers,
        body: req.body
      });

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
        latestMessage: latestMessage,
        context: context,
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
        }
      });

      // Pipe the readable stream to the response
      readable.pipe(res);

    } catch (error: any) {
      logger.error('Error in streaming chat request:', {
        error: error.message,
        stack: error.stack,
        requestBody: req.body
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

      // If headers haven't been sent yet, send error as JSON
      if (!res.headersSent) {
        res.status(500).json({
          error: error.message || 'Failed to process streaming chat request',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      } else {
        // If headers were sent, send error as SSE
        res.write(`data: ${JSON.stringify({ error: error.message || 'Failed to process streaming chat request' })}\n\n`);
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

      logger.debug('Processing extract request', {
        userId: req.context.auth.user.id,
        orgId: req.context.auth.user.org_id,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        prompt: prompt,
        context: context
      });

      // Convert file buffer to base64 data URI format for RawMessage
      const base64Data = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${base64Data}`;

      // Create RawMessage format with file part
      const fileMessage = {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt },
          {
            type: 'file' as const,
            data: dataUri, // Base64 data URI format
            mimeType: file.mimetype,
            name: file.originalname
          }
        ]
      };

      // Process the request with AgentService via streaming (workaround for generateText "Invalid JSON response")
      const response = await agentService.handleRequestViaStreaming(
        fileMessage,
        req.context.auth,
        [], // No previous messages for extraction
        { ...context, maxAgentSteps: 2 }
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

      // Return response with content, toolResults, steps, and file metadata
      res.json({
        content: response.content,
        toolResults: toolResults,
        steps: response.steps,
        fileInfo: {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
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

      logger.error('Error in extract request:', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: error.message || 'Failed to process extract request',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  /**
   * POST /api/agent/process-email
   * Process an email payload: store ingest, run extract per PDF, store items.
   * Accepts multipart: form fields for email metadata + file(s) for attachments.
   * Body fields: gmail_message_id (required), gmail_thread_id?, from_email?, to_email?, subject?, received_at? (ISO), body_snippet?, model_name?
   * Files: one or more PDFs (field name e.g. file, attachment, or attachments).
   */
  router.post('/process-email', authMiddleware, upload.any(), async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized: Missing auth context' });
      }

      const org_id = req.context.auth.user.org_id;
      if (!org_id) {
        return res.status(400).json({ error: 'Missing org_id in auth context' });
      }

      const gmail_message_id = req.body.gmail_message_id ?? req.body.gmailMessageId;
      if (!gmail_message_id || typeof gmail_message_id !== 'string') {
        return res.status(400).json({
          error: 'Missing required field: gmail_message_id',
          message: 'Provide gmail_message_id as form field or JSON body.',
        });
      }

      let files: Express.Multer.File[] = [];
      if (Array.isArray(req.files)) {
        files = req.files;
      } else if (req.files && typeof req.files === 'object') {
        files = Object.values(req.files).flat();
      }

      const attachments = files.map((f) => ({ buffer: f.buffer, filename: f.originalname || 'attachment' }));

      const received_at = req.body.received_at ?? req.body.receivedAt;
      const payload = {
        org_id,
        gmail_message_id: gmail_message_id.trim(),
        gmail_thread_id: req.body.gmail_thread_id ?? req.body.gmailThreadId,
        from_email: req.body.from_email ?? req.body.fromEmail,
        to_email: req.body.to_email ?? req.body.toEmail,
        subject: req.body.subject,
        received_at: received_at ? new Date(received_at) : undefined,
        body_snippet: req.body.body_snippet ?? req.body.bodySnippet,
        model_name: req.body.model_name ?? req.body.modelName ?? 'invoice',
        attachments,
      };

      const result = await processEmail(payload, req.context.auth);
      res.status(200).json(result);
    } catch (error: any) {
      logger.error('Error in process-email request', {
        error: error?.message,
        stack: error?.stack,
      });
      res.status(500).json({
        error: error?.message || 'Failed to process email',
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      });
    }
  });

  // ==========================================
  // AI Categorization Endpoints
  // ==========================================

  /**
   * Categorize a single transaction
   * POST /api/agent/erp/categorize-transaction
   */
  router.post('/erp/categorize-transaction', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized: Missing auth context' });
      }

      const params = req.body;

      logger.debug('Received categorize-transaction request', {
        userId: req.context.auth.user.id,
        orgId: req.context.auth.user.org_id,
        postingId: params.posting_id,
      });

      // Validate parameters
      const validatedParams = categorizeTransactionHandler.validateParams(
        params,
        undefined,
        req.context.auth
      );

      // Execute handler (connector is not used for categorization)
      const result = await categorizeTransactionHandler.execute(
        null as any, // Connector not needed for AI categorization
        validatedParams,
        undefined,
        req.context.auth
      );

      res.json(result);
    } catch (error: any) {
      logger.error('Error in categorize-transaction request:', {
        error: error.message,
        stack: error.stack,
      });

      res.status(error.message?.includes('requires') ? 400 : 500).json({
        success: false,
        error: error.message || 'Failed to categorize transaction',
      });
    }
  });

  /**
   * Categorize multiple transactions in batch
   * POST /api/agent/erp/categorize-transaction-batch
   */
  router.post('/erp/categorize-transaction-batch', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized: Missing auth context' });
      }

      const params = req.body;

      logger.debug('Received categorize-transaction-batch request', {
        userId: req.context.auth.user.id,
        orgId: req.context.auth.user.org_id,
        postingIdsCount: params.posting_ids?.length,
        postingsCount: params.postings?.length,
      });

      // Validate parameters
      const validatedParams = categorizeTransactionBatchHandler.validateParams(
        params,
        undefined,
        req.context.auth
      );

      // Execute handler (connector is not used for categorization)
      const result = await categorizeTransactionBatchHandler.execute(
        null as any, // Connector not needed for AI categorization
        validatedParams,
        undefined,
        req.context.auth
      );

      res.json(result);
    } catch (error: any) {
      logger.error('Error in categorize-transaction-batch request:', {
        error: error.message,
        stack: error.stack,
      });

      res.status(error.message?.includes('requires') ? 400 : 500).json({
        success: false,
        error: error.message || 'Failed to categorize transactions',
      });
    }
  });

  // ==========================================
  // Reconciliation Pipeline Endpoint
  // ==========================================

  /**
   * Reconcile one or more transactions (categorize + match invoices/receipts)
   * POST /api/agent/erp/reconcile-transaction
   *
   * Body: { posting_ids: string[] }
   *
   * Returns an array of results. Each entry contains the updated posting model
   * plus reconciliation suggestions (best match + alternatives).
   * The pipeline writes categorization and reconciliation status to each posting,
   * so the UI can refresh directly from the returned data.
   */
  router.post('/erp/reconcile-transaction', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized: Missing auth context' });
      }

      const { posting_ids } = req.body;
      if (!posting_ids || !Array.isArray(posting_ids) || posting_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'posting_ids is required and must be a non-empty array of strings',
        });
      }

      // Validate all entries are strings
      if (!posting_ids.every((id: any) => typeof id === 'string')) {
        return res.status(400).json({
          success: false,
          error: 'All posting_ids must be strings',
        });
      }

      const auth: AuthContext = {
        user: req.context.auth.user,
        permissions: req.context.auth.permissions,
      };
      const orgId = auth.user?.org_id;

      logger.debug('Received reconcile-transaction request', {
        userId: auth.user.id,
        orgId,
        postingIds: posting_ids,
        count: posting_ids.length,
      });

      // Verify all postings exist and belong to org
      const existingPostings = await prisma.posting.findMany({
        where: { id: { in: posting_ids }, org_id: orgId },
        select: { id: true },
      });

      const foundIds = new Set(existingPostings.map((p: { id: string }) => p.id));
      const missingIds = posting_ids.filter((id: string) => !foundIds.has(id));
      if (missingIds.length > 0) {
        return res.status(404).json({
          success: false,
          error: `Postings not found: ${missingIds.join(', ')}`,
        });
      }

      // Run the full pipeline (categorize + reconcile) for all postings
      const scorecard = await reconcileImportedPostings(posting_ids, auth);

      // Build a lookup from pipeline results
      const pipelineResultMap = new Map(
        scorecard.results.map((r) => [r.posting_id, r])
      );

      // Build Prisma select from the posting_view data_graph so the response
      // includes nested relationships (account names, etc.) — same shape as the
      // list view API.
      const VIEW_NAME = 'posting_view';
      let selectClause: any = undefined;
      try {
        const view = await PermissionService.getView(VIEW_NAME, 'posting');
        const dataGraph = view?.data_graph as { select?: any } | null;
        if (dataGraph) {
          selectClause = dataGraph.select || LegacyDataGraphParser.parseToSelect(dataGraph);
        }
      } catch (err: any) {
        logger.warn('Could not load posting_view data_graph, falling back to flat select', {
          error: err.message,
        });
      }

      // Re-fetch all postings with the data_graph select (nested relationships)
      const findManyArgs: any = {
        where: { id: { in: posting_ids } },
      };
      if (selectClause) {
        findManyArgs.select = selectClause;
      }
      const updatedPostings = await prisma.posting.findMany(findManyArgs);

      const results = updatedPostings.map((posting: any) => {
        const pipelineResult = pipelineResultMap.get(posting.id);
        return {
          posting,
          reconciliation: pipelineResult
            ? {
              status: pipelineResult.reconciliation_status,
              best_match: pipelineResult.best_match,
              alternatives: pipelineResult.alternatives,
            }
            : null,
        };
      });

      res.json({
        success: true,
        data: { results },
      });
    } catch (error: any) {
      logger.error('Error in reconcile-transaction request:', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to reconcile transaction(s)',
      });
    }
  });

  /**
   * Confirm reconciliation: create payment receipt (if match is invoice) or link to existing receipt.
   * POST /api/agent/erp/confirm-reconciliation
   * Body: { posting_id: string }
   */
  router.post('/erp/confirm-reconciliation', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) {
        return res.status(401).json({ error: 'Unauthorized: Missing auth context' });
      }

      const { posting_id } = req.body;
      if (!posting_id || typeof posting_id !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'posting_id is required',
        });
      }

      const auth: AuthContext = {
        user: req.context.auth.user,
        permissions: req.context.auth.permissions,
      };

      const result = await confirmReconciliation(posting_id, auth);

      // Re-fetch the posting with the view's data_graph select so the response
      // includes nested relationships (same shape as the list view).
      let fullPosting: any = result.posting;
      try {
        const view = await PermissionService.getView('posting_view', 'posting');
        const dataGraph = view?.data_graph as { select?: any } | null;
        if (dataGraph) {
          const selectClause = dataGraph.select || LegacyDataGraphParser.parseToSelect(dataGraph);
          if (selectClause) {
            const fetched = await prisma.posting.findUnique({
              where: { id: posting_id },
              select: selectClause,
            });
            if (fetched) fullPosting = fetched;
          }
        }
      } catch (err: any) {
        logger.warn('Could not load posting_view data_graph for confirm response, using default', {
          error: err.message,
        });
      }

      res.json({
        success: true,
        data: { posting: fullPosting },
      });
    } catch (error: any) {
      logger.error('Error in confirm-reconciliation request:', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to confirm reconciliation',
      });
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
      const { goal, goal_model, mode, template_id } = req.body;
      if (!goal) {
        return res.status(400).json({ error: 'goal is required' });
      }
      // If a template_id is provided, inherit its goal_model if caller didn't specify one
      let resolvedGoalModel = goal_model;
      if (template_id && !goal_model) {
        const tmpl = await prisma.agent_template.findUnique({ where: { id: template_id } });
        if (tmpl?.goal_model) resolvedGoalModel = tmpl.goal_model;
      }
      const session = await createAgentSession({
        org_id: req.context.auth.user.org_id,
        user_id: req.context.auth.user.id,
        goal,
        goal_model: resolvedGoalModel,
        template_id,
        mode,
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
  router.get('/admin/templates', authMiddleware, async (req: Request, res) => {
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
  router.get('/admin/templates/:id', authMiddleware, async (req: Request, res) => {
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
  router.post('/admin/templates', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { name, description, icon, goal_model, system_prompt, user_hint, default_mode, is_active, sort_order } = req.body;
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
  router.put('/admin/templates/:id', authMiddleware, async (req: Request, res) => {
    try {
      if (!req.context?.auth?.user) return res.status(401).json({ error: 'Unauthorized' });
      const { id } = req.params;
      const { name, description, icon, goal_model, system_prompt, user_hint, default_mode, is_active, sort_order } = req.body;
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
        },
      });
      res.json({ data: template });
    } catch (error: any) {
      logger.error('Error updating agent template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /** DELETE /api/agent/admin/templates/:id — Delete an agent template */
  router.delete('/admin/templates/:id', authMiddleware, async (req: Request, res) => {
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