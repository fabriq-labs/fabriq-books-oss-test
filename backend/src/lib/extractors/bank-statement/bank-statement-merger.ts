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

export function mergeChunkResults(results: DocumentExtractionResult[]): MergeResult {
  const allTransactions: Record<string, any>[] = [];
  const allCategorizations: any[] = [];
  let accountContext: Record<string, any> | null = null;
  const warnings: string[] = [];

  for (const result of results) {
    allTransactions.push(...(result.data.transactions || []));
    allCategorizations.push(...(result.data.categorizations || []));

    if (!accountContext && result.data.accountContext) {
      accountContext = result.data.accountContext;
    } else if (accountContext && result.data.accountContext) {
      const ctx = result.data.accountContext;
      if (ctx.accountNumber && ctx.accountNumber !== accountContext.accountNumber) {
        warnings.push(
          `Conflicting account numbers across chunks: ${accountContext.accountNumber} vs ${ctx.accountNumber}`
        );
      }
    }
  }

  const originalCount = allTransactions.length;
  const deduped = deduplicateBoundaryTransactions(allTransactions);
  const deduplicatedCount = originalCount - deduped.length;

  if (deduplicatedCount > 0) {
    logger.debug('Deduplication removed boundary transactions', { deduplicatedCount });
  }

  return {
    transactions: deduped,
    accountContext,
    categorizations: allCategorizations.length > 0 ? allCategorizations : undefined,
    warnings,
    originalCount,
    deduplicatedCount,
  };
}
