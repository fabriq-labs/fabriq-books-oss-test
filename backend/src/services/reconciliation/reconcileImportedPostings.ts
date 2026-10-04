/**
 * Reconciliation Pipeline for Imported Postings
 *
 * Orchestrates: Categorize (batch) → Filter incoming payments → Reconcile (per posting) → Update status
 *
 * Each posting gets:
 *   - reconciliation_status = 'SUGGESTED' (match found, awaiting human approval)
 *   - reconciliation_status = 'UNMATCHED' (no match found)
 *   - matched_reference = 'type:id:reference' (best match details)
 */

import prisma from '../../lib/prisma';
import { AuthContext } from '../../auth/types';
import { categorizeTransactionBatchHandler } from '../../agent/handlers/erp/categorizeTransactionBatch';
import {
  findSuggestionsForPosting,
  MatchSuggestion,
} from '../../agent/tools/suggestReconciliationMatches';
import { determineTransactionDirection } from '../../agent/handlers/erp/utils/categorizationUtils';
import logger from '../../utils/logger';

// ---------------------------------------------------------------------------
// Categorization result shape (mirrors BatchPostingResult from categorizeTransactionBatch)
// ---------------------------------------------------------------------------

interface CatPostingResult {
  posting_id: string;
  predicted_account_id: string | null;
  predicted_account_name: string | null;
  confidence: string | null;
  confidence_score: number | null;
  reasoning: string | null;
  applied: boolean;
  skipped_reason?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostingResult {
  posting_id: string;
  description: string | null;
  amount: number;
  value_date: string | null;
  // Categorization
  predicted_account_name: string | null;
  confidence: string | null;
  reasoning: string | null;
  is_incoming: boolean;
  // Reconciliation (only for incoming)
  reconciliation_status: 'SUGGESTED' | 'UNMATCHED' | 'SKIPPED';
  best_match: MatchSuggestion | null;
  alternatives: MatchSuggestion[];
}

export interface PipelineScorecard {
  total_imported: number;
  categorized: number;
  incoming_payments: number;
  suggested: number;
  unmatched: number;
  skipped_expense: number;
  results: PostingResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build matched_reference string from a MatchSuggestion.
 * Format: "type:id:reference"  e.g. "payment_receipt:payr_demo_001:REC-DEMO-001"
 */
function buildMatchedReference(match: MatchSuggestion): string {
  return `${match.type}:${match.id}:${match.reference}`;
}

const AI_NOTES_MARKER = '--- AI classification';
const AI_NOTES_MARKER_END = '---';

/**
 * Build the AI classification block for posting.notes (categorization + reconciliation reasoning).
 * Then merge with existing notes: remove any existing AI block, append the new one.
 */
function buildNotesWithAiBlock(
  existingNotes: string | null,
  catReasoning: string | null,
  reconciliationStatus: 'SUGGESTED' | 'UNMATCHED' | 'SKIPPED',
  bestMatch: MatchSuggestion | null,
  alternatives: MatchSuggestion[]
): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 19).replace('T', ' ');

  const lines: string[] = [
    `${AI_NOTES_MARKER} (${dateStr}) ${AI_NOTES_MARKER_END}`,
    'Categorization: ' + (catReasoning || '—'),
    '',
  ];

  if (reconciliationStatus === 'SUGGESTED' && bestMatch) {
    const typeLabel = bestMatch.type === 'payment_receipt' ? 'Payment receipt' : 'Invoice';
    lines.push(
      `Reconciliation: Matched to ${typeLabel} ${bestMatch.reference} (${bestMatch.confidence} confidence).`
    );
    if (bestMatch.customer) lines.push(`  Customer: ${bestMatch.customer}.`);
    if (alternatives.length > 0) {
      const altRefs = alternatives.map((a) => `${a.type === 'payment_receipt' ? 'Receipt' : 'Invoice'} ${a.reference}`).join(', ');
      lines.push(`  Other suggestions: ${altRefs}.`);
    }
  } else if (reconciliationStatus === 'UNMATCHED') {
    lines.push('Reconciliation: No matching invoice or payment receipt found.');
  } else {
    lines.push('Reconciliation: Skipped (outgoing/expense).');
  }

  const aiBlock = lines.join('\n');

  const existing = (existingNotes || '').trim();
  if (!existing) return aiBlock;

  // Remove any existing AI block (from first marker to next line that starts with --- or end of string)
  const markerIndex = existing.indexOf(AI_NOTES_MARKER);
  let userPart = existing;
  if (markerIndex >= 0) {
    userPart = existing.slice(0, markerIndex).trim();
  }

  if (!userPart) return aiBlock;
  return userPart + '\n\n' + aiBlock;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface ReconcileImportedPostingsOptions {
  /** When set, overrides CATEGORIZE_USE_HISTORICAL_MATCHING for this run. */
  use_historical_matching?: boolean;
}

export async function reconcileImportedPostings(
  postingIds: string[],
  auth: AuthContext,
  options?: ReconcileImportedPostingsOptions
): Promise<PipelineScorecard> {
  const orgId = auth.user?.org_id;
  if (!orgId) throw new Error('org_id is required in auth context');

  logger.info(`[reconciliation-pipeline] Starting for ${postingIds.length} postings`, {
    use_historical_matching: options?.use_historical_matching,
  });

  // -----------------------------------------------------------------------
  // Phase 1: Batch categorization
  // -----------------------------------------------------------------------
  logger.info('[reconciliation-pipeline] Phase 1: Batch categorization');

  const catResult = await categorizeTransactionBatchHandler.execute(
    null as any, // connector not needed for categorization
    {
      posting_ids: postingIds,
      options: {
        skip_already_categorized: false,
        min_confidence: 'low' as any,
        dry_run: false,
        use_historical_matching: options?.use_historical_matching,
      },
    },
    undefined,
    auth
  );

  if (!catResult.success || !catResult.data) {
    logger.error('[reconciliation-pipeline] Categorization failed', { error: catResult.error });
    throw new Error(`Categorization failed: ${catResult.error}`);
  }

  const catResults = catResult.data.results as CatPostingResult[];
  const catSummary = catResult.data.summary;
  logger.info('[reconciliation-pipeline] Categorization done', {
    total: catSummary.total_processed,
    categorized: catSummary.categorized_count,
    applied: catSummary.applied_count,
  });

  // Build lookup: posting_id → categorization result
  const catMap = new Map<string, CatPostingResult>(
    catResults.map((r) => [r.posting_id, r])
  );

  // -----------------------------------------------------------------------
  // Phase 2: Fetch postings and filter incoming payments
  // -----------------------------------------------------------------------
  logger.info('[reconciliation-pipeline] Phase 2: Filter incoming payments');

  const postings = await prisma.posting.findMany({
    where: { id: { in: postingIds }, org_id: orgId },
    include: {
      account: { select: { type: true } },
      credit_account: { select: { type: true } },
    },
  });

  const results: PostingResult[] = [];
  let suggestedCount = 0;
  let unmatchedCount = 0;
  let skippedExpenseCount = 0;
  let incomingCount = 0;

  for (const posting of postings) {
    const amount = posting.amount != null ? Number(posting.amount) : 0;
    const valueDate = posting.value_date || posting.posting_date;
    const catEntry = catMap.get(posting.id);

    if (posting.account == null || posting.credit_account == null) {
      // Prefer the upstream categorization/LLM error when present — otherwise a bad
      // model/config surfaces here as a misleading "missing account" failure.
      if (catEntry?.error) {
        throw new Error(`Categorization failed for ${posting.id}: ${catEntry.error}`);
      }
      throw new Error(
        `Posting ${posting.id} has missing account or credit_account; cannot determine transaction direction.`
      );
    }
    const accountType = posting.account?.type ?? [];
    const creditAccountType = posting.credit_account?.type ?? [];
    const direction = determineTransactionDirection(amount, accountType, creditAccountType, {
      strict: true,
    });
    const incoming = direction === 'money_in';

    const baseResult: PostingResult = {
      posting_id: posting.id,
      description: posting.description || posting.name || null,
      amount,
      value_date: valueDate ? new Date(valueDate).toISOString().slice(0, 10) : null,
      predicted_account_name: catEntry?.predicted_account_name ?? null,
      confidence: catEntry?.confidence ?? null,
      reasoning: catEntry?.reasoning ?? null,
      is_incoming: incoming,
      reconciliation_status: 'SKIPPED',
      best_match: null,
      alternatives: [],
    };

    if (!incoming) {
      // Expense / outgoing — skip reconciliation but still write notes and reconciliation_status
      const notes = buildNotesWithAiBlock(
        posting.notes,
        catEntry?.reasoning ?? null,
        'SKIPPED',
        null,
        []
      );
      await prisma.posting.update({
        where: { id: posting.id },
        data: { notes, reconciliation_status: 'SKIPPED' },
      });
      skippedExpenseCount++;
      results.push(baseResult);
      continue;
    }

    incomingCount++;

    // -------------------------------------------------------------------
    // Phase 3: Reconcile this incoming posting
    // -------------------------------------------------------------------
    const suggestionResult = await findSuggestionsForPosting(
      posting,
      orgId,
      0, // tolerance
      365 // maxDateRangeDays
    );

    const suggestions = suggestionResult?.suggestions ?? [];

    if (suggestions.length > 0) {
      // Pick the best match (already sorted by confidence, then we break ties by date proximity)
      const bestMatch = suggestions[0];
      const alternatives = suggestions.slice(1);

      const notes = buildNotesWithAiBlock(
        posting.notes,
        catEntry?.reasoning ?? null,
        'SUGGESTED',
        bestMatch,
        alternatives
      );

      // Update posting in DB
      await prisma.posting.update({
        where: { id: posting.id },
        data: {
          reconciliation_status: 'SUGGESTED',
          matched_reference: buildMatchedReference(bestMatch),
          notes,
        },
      });

      baseResult.reconciliation_status = 'SUGGESTED';
      baseResult.best_match = bestMatch;
      baseResult.alternatives = alternatives;
      suggestedCount++;
    } else {
      const notes = buildNotesWithAiBlock(
        posting.notes,
        catEntry?.reasoning ?? null,
        'UNMATCHED',
        null,
        []
      );

      await prisma.posting.update({
        where: { id: posting.id },
        data: {
          reconciliation_status: 'UNMATCHED',
          notes,
        },
      });

      baseResult.reconciliation_status = 'UNMATCHED';
      unmatchedCount++;
    }

    results.push(baseResult);
  }

  logger.info('[reconciliation-pipeline] Pipeline complete', {
    total: postings.length,
    categorized: catSummary.categorized_count,
    incoming: incomingCount,
    suggested: suggestedCount,
    unmatched: unmatchedCount,
    skippedExpense: skippedExpenseCount,
  });

  return {
    total_imported: postings.length,
    categorized: catSummary.categorized_count,
    incoming_payments: incomingCount,
    suggested: suggestedCount,
    unmatched: unmatchedCount,
    skipped_expense: skippedExpenseCount,
    results,
  };
}
