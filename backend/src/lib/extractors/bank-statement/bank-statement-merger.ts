import { DocumentExtractionResult } from '../types';
import { deduplicateBoundaryTransactions } from './transaction-deduplicator';
import logger from '../../../utils/logger';

export interface MergeResult {
  transactions: Record<string, any>[];
  accountContext: Record<string, any> | null;
  categorizations: any[] | undefined;
  warnings: string[];
  originalCount: number;
  deduplicatedCount: number;
}

export interface MergeChunkOptions {
  /** Trailing or full account number for the upload destination — preferred for accountContext. */
  preferredAccountNumber?: string | number | null;
}

function catIndex(cat: Record<string, any>): number | null {
  const idx = cat.transaction_index ?? cat.index;
  return typeof idx === 'number' && idx >= 0 ? idx : null;
}

function accountNumberMatches(
  printed: string | undefined | null,
  preferred: string | number | null | undefined
): boolean {
  if (printed == null || preferred == null || preferred === '') return false;
  const a = String(printed).replace(/\D/g, '');
  const b = String(preferred).replace(/\D/g, '');
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

/**
 * Merge per-chunk extraction results.
 *
 * Remaps each chunk's local `transaction_index` by the running transaction
 * offset, then remaps again after boundary dedupe so categorizations still
 * point at the correct merged rows.
 */
export function mergeChunkResults(
  results: DocumentExtractionResult[],
  options?: MergeChunkOptions
): MergeResult {
  const allTransactions: Record<string, any>[] = [];
  const remappedCats: Record<string, any>[] = [];
  const warnings: string[] = [];
  let offset = 0;

  type CtxCandidate = {
    ctx: Record<string, any>;
    txnCount: number;
    matchesPreferred: boolean;
  };
  const ctxCandidates: CtxCandidate[] = [];

  for (const result of results) {
    // Do NOT stamp rows from accountContext — on multi-account PDFs the LLM often
    // sets accountContext to the upload destination, which would mis-label other
    // accounts' rows and defeat post-filter. Prefer empty → drop in the filter.
    const txs = result.data.transactions || [];
    const cats = result.data.categorizations || [];

    for (const cat of cats) {
      const localIdx = catIndex(cat);
      if (localIdx == null) continue;
      remappedCats.push({
        ...cat,
        transaction_index: localIdx + offset,
      });
    }

    allTransactions.push(...txs);

    if (result.data.accountContext) {
      const ctx = result.data.accountContext;
      ctxCandidates.push({
        ctx,
        txnCount: txs.length,
        matchesPreferred: accountNumberMatches(
          ctx.accountNumber,
          options?.preferredAccountNumber
        ),
      });
    }

    offset += txs.length;
  }

  // Prefer context that matches the target account; else the chunk with most txs; else first.
  let accountContext: Record<string, any> | null = null;
  if (ctxCandidates.length > 0) {
    const matched = ctxCandidates.filter((c) => c.matchesPreferred);
    const pool = matched.length > 0 ? matched : ctxCandidates;
    pool.sort((a, b) => b.txnCount - a.txnCount);
    accountContext = pool[0].ctx;

    const distinctNums = [
      ...new Set(
        ctxCandidates
          .map((c) => c.ctx.accountNumber)
          .filter((n): n is string => !!n)
      ),
    ];
    if (distinctNums.length > 1) {
      warnings.push(
        `Multiple account numbers across chunks: ${distinctNums.join(', ')}` +
          (accountContext?.accountNumber
            ? `; using ${accountContext.accountNumber}`
            : '')
      );
    }
  }

  const originalCount = allTransactions.length;
  const { transactions: deduped, indexMap } =
    deduplicateBoundaryTransactions(allTransactions);
  const deduplicatedCount = originalCount - deduped.length;

  if (deduplicatedCount > 0) {
    logger.debug('Deduplication removed boundary transactions', { deduplicatedCount });
  }

  const finalCats: Record<string, any>[] = [];
  for (const cat of remappedCats) {
    const oldIdx = catIndex(cat);
    if (oldIdx == null) continue;
    const newIdx = indexMap.get(oldIdx);
    if (newIdx == null) continue;
    finalCats.push({ ...cat, transaction_index: newIdx });
  }

  return {
    transactions: deduped,
    accountContext,
    categorizations: finalCats.length > 0 ? finalCats : undefined,
    warnings,
    originalCount,
    deduplicatedCount,
  };
}
