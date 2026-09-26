/**
 * Filter extracted transactions to the upload destination account.
 * Matches full or trailing digits on per-row `source_account_number` /
 * `account_number` fields (and remaps categorizations).
 *
 * When a preferred account is set, rows without any account number are dropped
 * (safer empty import than mixing other accounts' postings).
 */

export function digitsOnly(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).replace(/\D/g, '');
}

export function accountNumberMatches(
  printed: string | number | null | undefined,
  preferred: string | number | null | undefined
): boolean {
  const a = digitsOnly(printed);
  const b = digitsOnly(preferred);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

function rowAccountNumber(row: Record<string, any>): string | null {
  const raw =
    row.source_account_number ??
    row.account_number ??
    row.accountNumber ??
    null;
  const d = digitsOnly(raw);
  return d || null;
}

export interface FilterToTargetAccountResult {
  transactions: Record<string, any>[];
  categorizations: Record<string, any>[] | undefined;
  removedCount: number;
  unnumberedDropped: number;
}

/**
 * Keep only rows whose per-transaction account number matches `preferred`.
 * Rows missing an account number are dropped when preferred is set.
 */
export function filterTransactionsToTargetAccount(
  transactions: Record<string, any>[],
  categorizations: Record<string, any>[] | undefined,
  preferred: string | number | null | undefined
): FilterToTargetAccountResult {
  if (preferred == null || preferred === '' || transactions.length === 0) {
    return {
      transactions,
      categorizations,
      removedCount: 0,
      unnumberedDropped: 0,
    };
  }

  const kept: Record<string, any>[] = [];
  const oldToNew = new Map<number, number>();
  let unnumberedDropped = 0;

  for (let i = 0; i < transactions.length; i++) {
    const row = transactions[i];
    const rowNum = rowAccountNumber(row);
    if (!rowNum) {
      unnumberedDropped++;
      continue;
    }
    if (accountNumberMatches(rowNum, preferred)) {
      oldToNew.set(i, kept.length);
      kept.push(row);
    }
  }

  let remappedCats: Record<string, any>[] | undefined;
  if (categorizations && categorizations.length > 0) {
    remappedCats = [];
    for (const cat of categorizations) {
      const idx = cat.transaction_index ?? cat.index;
      if (typeof idx !== 'number') continue;
      const newIdx = oldToNew.get(idx);
      if (newIdx == null) continue;
      remappedCats.push({ ...cat, transaction_index: newIdx });
    }
    if (remappedCats.length === 0) remappedCats = undefined;
  }

  return {
    transactions: kept,
    categorizations: remappedCats,
    removedCount: transactions.length - kept.length,
    unnumberedDropped,
  };
}
