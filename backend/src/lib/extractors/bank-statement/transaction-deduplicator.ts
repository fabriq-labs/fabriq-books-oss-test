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

/**
 * Removes consecutive duplicates that arise at chunk boundaries.
 * Only compares adjacent pairs — does not do a full O(n²) deduplcation.
 */
export function deduplicateBoundaryTransactions(
  transactions: Record<string, any>[]
): Record<string, any>[] {
  if (transactions.length === 0) return [];
  const result: Record<string, any>[] = [transactions[0]];
  for (let i = 1; i < transactions.length; i++) {
    if (!isDuplicate(result[result.length - 1], transactions[i])) {
      result.push(transactions[i]);
    }
  }
  return result;
}
