function normalizeDescription(s?: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isDuplicate(a: Record<string, any>, b: Record<string, any>): boolean {
  const sameDate = (a.value_date || '') === (b.value_date || '');
  const sameDebit = Math.abs((a.debit_amount || 0) - (b.debit_amount || 0)) < 0.01;
  const sameCredit = Math.abs((a.credit_amount || 0) - (b.credit_amount || 0)) < 0.01;
  const sameDesc = normalizeDescription(a.description) === normalizeDescription(b.description);
  return sameDate && sameDebit && sameCredit && sameDesc;
}

export interface DedupeResult {
  transactions: Record<string, any>[];
  /** Maps pre-dedupe index → post-dedupe index. Omitted keys were removed. */
  indexMap: Map<number, number>;
}

/**
 * Removes consecutive duplicates that arise at chunk boundaries.
 * Only compares adjacent pairs — does not do a full O(n²) deduplication.
 */
export function deduplicateBoundaryTransactions(
  transactions: Record<string, any>[]
): DedupeResult {
  const indexMap = new Map<number, number>();
  if (transactions.length === 0) {
    return { transactions: [], indexMap };
  }

  const result: Record<string, any>[] = [transactions[0]];
  indexMap.set(0, 0);

  for (let i = 1; i < transactions.length; i++) {
    if (!isDuplicate(result[result.length - 1], transactions[i])) {
      indexMap.set(i, result.length);
      result.push(transactions[i]);
    }
    // else: drop i — no entry in indexMap
  }

  return { transactions: result, indexMap };
}
