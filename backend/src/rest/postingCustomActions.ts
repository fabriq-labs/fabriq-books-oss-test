import { Request, Response } from 'express';
import { customActionRegistry } from './customActionRegistry';
import { PostingImportService, ImportProgress } from '../services/posting/PostingImportService';
import { mergePostings, MergeValidationError } from '../services/posting/PostingMergeService';
import logger from '../utils/logger';

/**
 * POST /api/posting/custom/import-bank-statement
 *
 * Accepts a multipart form upload and streams SSE progress events back on the
 * same HTTP connection. The pipeline is fully in-process — no internal HTTP calls.
 *
 * Form fields:
 *   file              (required) — PDF or CSV bank statement
 *   account_id        (required) — bank/statement account ID
 *   view_id           (optional, default: posting_view)
 *   dry_run           (optional, default: false) — parse only, do not insert
 *   column_mapping    (required for CSV) — JSON mapping CSV headers → posting fields
 *                     e.g. '{"Date":"value_date","Amount":"debit_amount"}'
 *   categorize        (optional, default: false, PDF only) — run AI categorisation
 *   legal_entity_id   (required when categorize=true) — legal entity ID or name
 *                     used to scope the Chart of Accounts for categorisation
 */
customActionRegistry.register('posting', 'import-bank-statement', async (req: Request, res: Response) => {
  const context = (req as any).context?.auth;

  // ── Input validation (before SSE headers — client gets a JSON error) ───────
  if (!context?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const {
    account_id,
    view_id = 'posting_view',
    dry_run,
    column_mapping,
    categorize,
    legal_entity_id,
  } = req.body ?? {};

  const files = (req as any).files as Express.Multer.File[] | undefined;
  const file: Express.Multer.File | undefined = files?.[0] ?? (req as any).file;

  if (!account_id) {
    res.status(400).json({ error: 'account_id is required' });
    return;
  }
  if (!file) {
    res.status(400).json({ error: 'file is required' });
    return;
  }

  // Parse column_mapping (multipart form fields come as strings)
  let parsedColumnMapping: Record<string, string> | undefined;
  if (column_mapping) {
    try {
      parsedColumnMapping =
        typeof column_mapping === 'string' ? JSON.parse(column_mapping) : column_mapping;
    } catch {
      res.status(400).json({ error: 'column_mapping must be a valid JSON object' });
      return;
    }
  }

  const doCategorize = categorize === 'true' || categorize === true;
  if (doCategorize && !legal_entity_id) {
    res.status(400).json({ error: 'legal_entity_id is required when categorize=true' });
    return;
  }

  // ── Switch to SSE mode ─────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data: object) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* client disconnected */ }
  };

  logger.info('PostingImportService SSE: starting import', {
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    accountId: account_id,
    dryRun: dry_run,
    categorize: doCategorize,
    legalEntityId: legal_entity_id,
    hasColumnMapping: !!parsedColumnMapping,
    userId: context.user?.id,
  });

  try {
    const result = await PostingImportService.getInstance().importBankStatement(context, {
      fileBuffer: Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer),
      mimeType: file.mimetype,
      fileSize: file.size,
      fileName: file.originalname,
      accountId: account_id,
      viewId: view_id,
      dryRun: dry_run === 'true' || dry_run === true,
      columnMapping: parsedColumnMapping,
      categorize: doCategorize,
      legalEntityId: legal_entity_id,
      onProgress: (progress: ImportProgress) => sendEvent(progress),
    });

    sendEvent({ type: 'result', ...result });

  } catch (error: any) {
    const msg = error?.message ?? 'Unexpected error';
    logger.error('PostingImportService SSE error', { error: msg });
    sendEvent({ step: 'error', message: msg, error: msg });
  }

  res.end();
});

/**
 * POST /api/posting/custom/merge
 *
 * Marks one posting as a duplicate of another (manual merge, Wave-style).
 * The duplicate row is soft-deleted with posting_type='DUPLICATE',
 * status='DUPLICATE', reversal_of_posting_id=<primary.id>, reversed_at=now().
 *
 * The route is dispatched by `router.all('/:model/custom/:action', ...)` in
 * `rest/routes.ts`, which is registered BEFORE the auto-generated model loops,
 * so the metadata CRUD handlers cannot shadow this endpoint.
 *
 * Body:
 *   primary_id    (required) — posting to keep
 *   duplicate_id  (required) — posting to mark as DUPLICATE
 *   merge_notes   (optional, default false) — append duplicate's description/
 *                 notes onto the primary's `notes` field
 *
 * Response: { success: true, data: { primary, duplicate } }
 */
customActionRegistry.register('posting', 'merge', async (req: Request, res: Response) => {
  const context = (req as any).context?.auth;
  if (!context?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { primary_id, duplicate_id, merge_notes } = req.body ?? {};
  if (!primary_id || !duplicate_id) {
    res.status(400).json({ error: 'primary_id and duplicate_id are required' });
    return;
  }

  try {
    const result = await mergePostings({
      primaryId: primary_id,
      duplicateId: duplicate_id,
      mergeNotes: merge_notes === true || merge_notes === 'true',
      orgId: context.user.org_id,
      userId: context.user.id,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof MergeValidationError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 422;
      logger.warn('posting/merge validation failed', {
        code: err.code,
        message: err.message,
      });
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    logger.error('posting/merge error', { error: err?.message });
    res.status(500).json({ error: err?.message ?? 'Unexpected error' });
  }
});
