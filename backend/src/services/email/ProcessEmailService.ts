import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { AgentService } from '../../agent/AgentService';
import { AttachmentService } from '../upload/AttachmentService';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import type {
  ProcessEmailPayload,
  ProcessEmailResult,
  ProcessEmailAttachment,
  ExtractInvoiceToolResult,
} from './ProcessEmail.types';

const agentService = new AgentService();
const PDF_MIME = 'application/pdf';
const INVOICE_MODEL = 'invoice';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPdf(att: ProcessEmailAttachment): boolean {
  return (att.filename || '').toLowerCase().endsWith('.pdf');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Run invoice extraction on a single PDF buffer via the agent streaming pipeline.
 * Returns the first extractInvoiceFromFile tool result, or null if the tool was
 * never invoked by the LLM.
 */
async function extractInvoiceFromPdf(
  buffer: Buffer,
  filename: string,
  auth: AuthContext,
): Promise<ExtractInvoiceToolResult | null> {
  const dataUri = `data:${PDF_MIME};base64,${buffer.toString('base64')}`;

  const response = await agentService.handleRequestViaStreaming(
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract invoice data from this PDF file' },
        { type: 'file', data: dataUri, mimeType: PDF_MIME, name: filename },
      ],
    },
    auth,
    [],
    {
      modelName: INVOICE_MODEL,
      viewName: 'invoice_view',
      promptTypes: ['invoice_extractor'],
      maxAgentSteps: 2,
    },
  );

  // Collect tool results from the top-level response or from individual steps.
  let toolResults = response.toolResults ?? [];
  if (toolResults.length === 0 && Array.isArray(response.steps)) {
    for (const step of response.steps) {
      if (Array.isArray(step.toolResults)) {
        toolResults = toolResults.concat(step.toolResults);
      }
    }
  }

  for (const tr of toolResults) {
    const raw = (tr as any).result ?? tr;
    if (raw?.tool === 'extractInvoiceFromFile') return raw as ExtractInvoiceToolResult;
  }
  return null;
}

/**
 * Determine the item status and rejection_reason from a tool result.
 */
function resolveItemOutcome(toolResult: ExtractInvoiceToolResult | null, extractionError?: string) {
  // Extraction threw
  if (extractionError) {
    return { status: 'failed' as const, rejection_reason: extractionError };
  }
  // LLM never called the tool
  if (!toolResult) {
    return { status: 'failed' as const, rejection_reason: 'Invoice extraction tool was not invoked by LLM' };
  }
  // Tool returned an error
  if (toolResult.error) {
    return { status: 'failed' as const, rejection_reason: toolResult.error };
  }
  // Invoice auto-created
  if (toolResult.created_invoice_id) {
    return { status: 'processed' as const, rejection_reason: undefined };
  }
  // Extraction succeeded but invoice was not created — capture why
  return { status: 'pending' as const, rejection_reason: toolResult.rejection_reason };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Process an email payload: store ingest, extract invoices from each PDF,
 * store items, and attach files when an invoice is auto-created.
 *
 * Idempotent by (org_id, gmail_message_id).
 */
export async function processEmail(
  payload: ProcessEmailPayload,
  auth: AuthContext,
): Promise<ProcessEmailResult> {
  const { org_id, gmail_message_id, attachments } = payload;

  // ── Idempotency check ────────────────────────────────────────────────
  const existing = await prisma.instance_email_ingest.findFirst({
    where: { org_id, gmail_message_id },
  });
  if (existing) {
    logger.info('processEmail: skipping duplicate', { org_id, gmail_message_id });
    return { ingest_id: existing.id, skipped: true, reason: 'duplicate gmail_message_id', item_count: 0 };
  }

  // ── Create ingest record ─────────────────────────────────────────────
  const ingest = await prisma.instance_email_ingest.create({
    data: {
      org_id,
      gmail_message_id,
      gmail_thread_id: payload.gmail_thread_id,
      from_email: payload.from_email,
      to_email: payload.to_email,
      subject: payload.subject,
      received_at: payload.received_at,
      body_snippet: payload.body_snippet,
      model_name: payload.model_name ?? INVOICE_MODEL,
      status: 'pending',
    },
  });

  // ── Filter to PDF attachments ────────────────────────────────────────
  const pdfs = attachments.filter(isPdf);
  if (pdfs.length === 0) {
    logger.info('processEmail: no PDF attachments', { ingest_id: ingest.id });
    return { ingest_id: ingest.id, skipped: false, item_count: 0 };
  }

  // ── Process each PDF ─────────────────────────────────────────────────
  for (const att of pdfs) {
    let toolResult: ExtractInvoiceToolResult | null = null;
    let extractionError: string | undefined;

    try {
      toolResult = await extractInvoiceFromPdf(att.buffer, att.filename, auth);
    } catch (err) {
      extractionError = errorMessage(err);
      logger.error('processEmail: extraction threw', { ingest_id: ingest.id, filename: att.filename, error: extractionError });
    }

    const { status, rejection_reason } = resolveItemOutcome(toolResult, extractionError);

    logger.info('processEmail: item outcome', {
      ingest_id: ingest.id,
      filename: att.filename,
      status,
      rejection_reason,
      created_invoice_id: toolResult?.created_invoice_id,
    });

    const item = await prisma.instance_email_ingest_item.create({
      data: {
        org_id: ingest.org_id,
        instance_email_ingest_id: ingest.id,
        model_name: INVOICE_MODEL,
        attachment_filename: att.filename,
        extracted_data: (toolResult?.data as any) ?? Prisma.JsonNull,
        instance_id: toolResult?.created_invoice_id ?? undefined,
        status,
        rejection_reason,
      },
    });

    // Store attachment for every item: to invoice if we have instance_id, otherwise to ingest item for later mapping.
    const targetInstanceId = toolResult?.created_invoice_id ?? item.id;
    const targetType = toolResult?.created_invoice_id ? INVOICE_MODEL : 'instance_email_ingest_item';
    try {
      await AttachmentService.uploadFromBuffer(
        targetType,
        targetInstanceId,
        att.buffer,
        att.filename,
        { org_id, created_by: auth.user?.id },
      );
    } catch (uploadErr) {
      const msg = `Attachment upload failed: ${errorMessage(uploadErr)}`;
      logger.error('processEmail: attachment upload failed', { item_id: item.id, error: msg });
      await prisma.instance_email_ingest_item.update({
        where: { id: item.id },
        data: { rejection_reason: msg },
      });
    }
  }

  // ── Update parent status when all child items are done ─────────────────
  const items = await prisma.instance_email_ingest_item.findMany({
    where: { instance_email_ingest_id: ingest.id },
    select: { status: true },
  });
  const hasFailed = items.some((i) => i.status === 'failed');
  const hasPending = items.some((i) => i.status === 'pending');
  const allDone = !hasPending && !hasFailed;
  if (allDone) {
    await prisma.instance_email_ingest.update({
      where: { id: ingest.id },
      data: { status: 'processed', processed_at: new Date() },
    });
  } else if (hasFailed) {
    await prisma.instance_email_ingest.update({
      where: { id: ingest.id },
      data: { status: 'failed' },
    });
  }

  // ── Return summary ───────────────────────────────────────────────────
  const itemCount = items.length;
  return { ingest_id: ingest.id, skipped: false, item_count: itemCount };
}
