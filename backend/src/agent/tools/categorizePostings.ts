/**
 * Categorize Postings Tool
 *
 * Agent tool that predicts counter-accounts for uncategorized postings
 * linked to a bank account. Wraps the existing categorizeTransactionBatch
 * handler with dry_run: true so predictions are returned without being written.
 *
 * The agent can then call queueActionBatch with action_type='categorize_transaction'
 * to surface predictions to the user for review and approval.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';
import { categorizeTransactionBatchHandler } from '../handlers/erp/categorizeTransactionBatch';

// ── Schema ─────────────────────────────────────────────────────

const categorizePostingsSchema = z.object({
  account_id: z
    .string()
    .describe('The ID of the bank account whose postings should be categorized.'),
  account_name: z
    .string()
    .optional()
    .describe('Human-readable name of the account (for logging only).'),
  from_date: z
    .string()
    .optional()
    .describe('ISO date string (YYYY-MM-DD). Only postings on or after this date are processed.'),
  to_date: z
    .string()
    .optional()
    .describe('ISO date string (YYYY-MM-DD). Only postings on or before this date are processed.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe('Maximum number of uncategorized postings to process (default 50, max 200).'),
});

export type CategorizePostingsParams = z.infer<typeof categorizePostingsSchema>;

// ── Result type (returned to LLM) ──────────────────────────────

export interface CategorizationPrediction {
  posting_id: string;
  description: string;
  amount: number;
  value_date: string | null;
  predicted_account_id: string | null;
  predicted_account_name: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  confidence_score: number | null;
  reasoning: string | null;
  skipped_reason?: string;
}

export interface CategorizePostingsResult {
  account_id: string;
  account_name: string | null;
  uncategorized_count: number;
  predictions: CategorizationPrediction[];
  summary: {
    total_processed: number;
    with_prediction: number;
    high_confidence: number;
    medium_confidence: number;
    low_confidence: number;
    skipped: number;
  };
}

// ── Tool factory ───────────────────────────────────────────────

export function categorizePostingsTool(auth: AuthContext) {
  return tool({
    description: `Predict counter-accounts for uncategorized expense postings on a bank account.
Fetches postings that have no counter-account set, runs AI categorization in dry-run mode
(no changes written), and returns predictions with confidence scores.
Use this to discover what expense categories apply before queuing approval actions.`,

    parameters: categorizePostingsSchema,

    execute: async (params: CategorizePostingsParams): Promise<CategorizePostingsResult> => {
      const orgId = auth.user.org_id;

      logger.info('categorizePostingsTool: starting', {
        accountId: params.account_id,
        fromDate: params.from_date,
        toDate: params.to_date,
        limit: params.limit,
        orgId,
      });

      // ── 1. Fetch uncategorized postings for this account ────────
      const dateFilter: any = {};
      if (params.from_date) dateFilter.gte = new Date(params.from_date);
      if (params.to_date) dateFilter.lte = new Date(params.to_date);

      // A posting is "uncategorized" when both sides haven't been fully set.
      // For a bank account on the credit side (money_out), account_id (debit) is null.
      // For a bank account on the debit side (money_in), credit_account_id is null.
      // We fetch all postings where at least one counter-account field is missing.
      const rawPostings = await prisma.posting.findMany({
        where: {
          org_id: orgId,
          OR: [
            { account_id: params.account_id, credit_account_id: null },
            { credit_account_id: params.account_id, account_id: null },
          ],
          ...(Object.keys(dateFilter).length > 0 ? { value_date: dateFilter } : {}),
        },
        include: {
          account: { select: { id: true, name: true, type: true } },
          credit_account: { select: { id: true, name: true, type: true } },
        },
        orderBy: { value_date: 'desc' },
        take: params.limit ?? 50,
      });

      logger.info('categorizePostingsTool: fetched uncategorized postings', {
        count: rawPostings.length,
        accountId: params.account_id,
      });

      if (rawPostings.length === 0) {
        return {
          account_id: params.account_id,
          account_name: params.account_name ?? null,
          uncategorized_count: 0,
          predictions: [],
          summary: {
            total_processed: 0,
            with_prediction: 0,
            high_confidence: 0,
            medium_confidence: 0,
            low_confidence: 0,
            skipped: 0,
          },
        };
      }

      // ── 2. Run dry-run categorization via existing handler ──────
      const batchResult = await categorizeTransactionBatchHandler.execute(
        null as any, // ERPConnector not used by this handler
        {
          posting_ids: rawPostings.map((p) => p.id),
          options: {
            dry_run: true,
            skip_already_categorized: true,
            min_confidence: 'low', // Return all predictions; agent/user decides threshold
            // use_historical_matching omitted → CATEGORIZE_USE_HISTORICAL_MATCHING env (default true)
          },
        },
        {},
        auth
      );

      if (!batchResult.success || !batchResult.data) {
        throw new Error(batchResult.error ?? 'Batch categorization failed');
      }

      // ── 3. Build rich predictions with original posting data ────
      const postingMap = new Map(rawPostings.map((p) => [p.id, p]));
      const predictions: CategorizationPrediction[] = batchResult.data.results.map((r: any) => {
        const posting = postingMap.get(r.posting_id);
        return {
          posting_id: r.posting_id,
          description: posting?.description ?? '',
          amount: posting ? Number(posting.amount) : 0,
          value_date: posting?.value_date ? posting.value_date.toISOString().split('T')[0] : null,
          predicted_account_id: r.predicted_account_id,
          predicted_account_name: r.predicted_account_name,
          confidence: r.confidence,
          confidence_score: r.confidence_score,
          reasoning: r.reasoning,
          skipped_reason: r.skipped_reason,
        };
      });

      // ── 4. Summary ──────────────────────────────────────────────
      const withPrediction = predictions.filter((p) => p.predicted_account_id !== null);
      const summary = {
        total_processed: batchResult.data.summary.total_processed,
        with_prediction: withPrediction.length,
        high_confidence: withPrediction.filter((p) => p.confidence === 'high').length,
        medium_confidence: withPrediction.filter((p) => p.confidence === 'medium').length,
        low_confidence: withPrediction.filter((p) => p.confidence === 'low').length,
        skipped: batchResult.data.summary.skipped_count,
      };

      logger.info('categorizePostingsTool: complete', {
        accountId: params.account_id,
        ...summary,
      });

      return {
        account_id: params.account_id,
        account_name: params.account_name ?? null,
        uncategorized_count: rawPostings.length,
        predictions,
        summary,
      };
    },
  });
}
