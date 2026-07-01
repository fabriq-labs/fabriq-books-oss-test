import { run_report } from '../../lib/reports';
import { AuthContext } from '../../auth/types';
import type { PostingSearchToolContext, SearchFilterEntry } from '../search/searchFilterTypes';
import { attachLegalEntityScopeToToolResult } from '../postingCreateHelpers';

type PostingRow = Record<string, unknown>;

export type PostingDisplayUiHint = 'account_ledger' | 'posting_journal' | 'posting_dual';

function comparePostingLedgerAsc(a: PostingRow, b: PostingRow): number {
  const ta = new Date(String(a.value_date ?? a.posting_date ?? '')).getTime();
  const tb = new Date(String(b.value_date ?? b.posting_date ?? '')).getTime();
  if (ta !== tb) return ta - tb;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

function accountNameFromRow(row: PostingRow, side: 'debit' | 'credit'): string {
  const rel = side === 'debit' ? row.account : row.credit_account;
  if (rel && typeof rel === 'object' && 'name' in rel) {
    return String((rel as { name?: string }).name ?? '—');
  }
  return '—';
}

function accountCodeFromRow(row: PostingRow, side: 'debit' | 'credit'): string | null {
  const rel = side === 'debit' ? row.account : row.credit_account;
  if (rel && typeof rel === 'object' && 'code' in rel) {
    const code = (rel as { code?: string }).code;
    return code ? String(code) : null;
  }
  return null;
}

/**
 * From the focus account's perspective (bank / asset register):
 * - **Received** (money in): focus account is debited on the posting (`account_id`) → **+**
 * - **Debited** (money out): focus account is credited on the posting (`credit_account_id`) → **−**
 */
function isAmountReceived(posting: PostingRow, focusAccountId: string): boolean {
  return posting.account_id === focusAccountId;
}

function resolveJournalFocusAccountId(filters: SearchFilterEntry[]): string | null {
  const debitId = filters.find((f) => f.field === 'account_id' && f.operator === 'eq')?.value;
  const creditId = filters.find(
    (f) => f.field === 'credit_account_id' && f.operator === 'eq'
  )?.value;
  if (
    typeof debitId === 'string' &&
    debitId.startsWith('acco_') &&
    (!creditId || creditId === debitId)
  ) {
    return debitId;
  }
  if (typeof creditId === 'string' && creditId.startsWith('acco_') && !debitId) {
    return creditId;
  }
  return null;
}

function currencyCodeFromRow(row: PostingRow): string {
  const debit = row.account as { currency?: string | { code?: string } } | undefined;
  const credit = row.credit_account as { currency?: string | { code?: string } } | undefined;
  for (const c of [debit?.currency, credit?.currency]) {
    if (!c) continue;
    if (typeof c === 'string') return c;
    if (typeof c === 'object' && c.code) return c.code;
  }
  return 'INR';
}

/** OR filter with same account on debit and credit sides (bank register scope). */
export function extractLedgerFocusAccountId(filters: SearchFilterEntry[]): string | null {
  const orFilter = filters.find((f) => f.field === 'or' && f.operator === 'or');
  if (!orFilter || !Array.isArray(orFilter.value)) return null;

  let debitId: string | null = null;
  let creditId: string | null = null;

  for (const branch of orFilter.value as Record<string, unknown>[]) {
    const accEq = (branch.account_id as { eq?: string } | undefined)?.eq;
    const credEq = (branch.credit_account_id as { eq?: string } | undefined)?.eq;
    if (accEq) debitId = accEq;
    if (credEq) creditId = credEq;
  }

  if (debitId && creditId && debitId === creditId) return debitId;
  return null;
}

export function isPostingTransferBetweenAccountsSearch(filters: SearchFilterEntry[]): boolean {
  const debitId = filters.find((f) => f.field === 'account_id' && f.operator === 'eq')?.value;
  const creditId = filters.find(
    (f) => f.field === 'credit_account_id' && f.operator === 'eq'
  )?.value;
  return (
    typeof debitId === 'string' &&
    typeof creditId === 'string' &&
    debitId.startsWith('acco_') &&
    creditId.startsWith('acco_') &&
    debitId !== creditId
  );
}

function resolveJournalHighlightMeta(
  filters: SearchFilterEntry[],
  journalRows: ReturnType<typeof transformJournalRows>
): {
  journalFocusSide?: 'debit' | 'credit';
  journalFocusAccountName?: string;
  journalTitle?: string;
} {
  const debitId = filters.find((f) => f.field === 'account_id' && f.operator === 'eq')?.value;
  const creditId = filters.find(
    (f) => f.field === 'credit_account_id' && f.operator === 'eq'
  )?.value;

  if (
    typeof debitId === 'string' &&
    typeof creditId === 'string' &&
    debitId.startsWith('acco_') &&
    creditId.startsWith('acco_') &&
    debitId !== creditId
  ) {
    return {};
  }

  const sample = journalRows[0];
  if (typeof debitId === 'string' && debitId.startsWith('acco_') && (!creditId || creditId === debitId)) {
    const name = sample?.debit_account_name;
    return {
      journalFocusSide: 'debit',
      journalFocusAccountName: name,
      journalTitle: name ? `Debit account: ${name}` : 'Debit account postings',
    };
  }
  if (typeof creditId === 'string' && creditId.startsWith('acco_') && !debitId) {
    const name = sample?.credit_account_name;
    return {
      journalFocusSide: 'credit',
      journalFocusAccountName: name,
      journalTitle: name ? `Credit account: ${name}` : 'Credit account postings',
    };
  }
  return {};
}

function resolvePostingDisplayMode(
  filters: SearchFilterEntry[],
  _toolContext?: PostingSearchToolContext
): PostingDisplayUiHint {
  // Bank register (+/− ledger): OR filter with the same account on debit and credit sides.
  if (extractLedgerFocusAccountId(filters)) {
    return 'account_ledger';
  }
  if (isPostingTransferBetweenAccountsSearch(filters)) {
    return 'posting_dual';
  }
  // Debit-only, credit-only, period lists, and general posting searches.
  return 'posting_journal';
}

function extractValueDateRange(filters: SearchFilterEntry[]): {
  from_date?: string;
  to_date?: string;
} {
  const gte = filters.find((f) => f.field === 'value_date' && f.operator === 'gte')?.value;
  const lte =
    filters.find((f) => f.field === 'value_date' && f.operator === 'lte')?.value ??
    filters.find((f) => f.field === 'value_date' && f.operator === 'lt')?.value;
  return {
    from_date: typeof gte === 'string' ? gte.slice(0, 10) : undefined,
    to_date: typeof lte === 'string' ? lte.slice(0, 10) : undefined,
  };
}

async function fetchOpeningBalance(
  auth: AuthContext,
  accountId: string,
  filters: SearchFilterEntry[],
  legalEntityId?: string | null
): Promise<number | null> {
  try {
    const { from_date, to_date } = extractValueDateRange(filters);
    const reportFilters: Record<string, unknown> = {
      account_id: accountId,
      ...(from_date && { from_date }),
      ...(to_date && { to_date }),
      ...(legalEntityId && { legal_entity_ids: [legalEntityId] }),
    };
    const rows = await run_report(auth, 'trial_balance', reportFilters);
    const row = (rows as PostingRow[]).find((r) => r.account_id === accountId);
    if (!row) return 0;
    const ob = Number(row.opening_balance ?? 0);
    return Number.isFinite(ob) ? ob : 0;
  } catch {
    return null;
  }
}

function transformLedgerRows(
  records: PostingRow[],
  focusAccountId: string,
  openingBalance: number | null,
  accountName?: string | null
) {
  const open = openingBalance ?? 0;
  const sorted = [...records].sort(comparePostingLedgerAsc);
  let running = open;

  const rows = sorted.map((posting) => {
    const amount = Number(posting.amount) || 0;
    const isReceived = isAmountReceived(posting, focusAccountId);
    const debitAccount = posting.account as { name?: string } | undefined;
    const creditAccount = posting.credit_account as { name?: string } | undefined;
    const category = posting.category as { name?: string } | undefined;

    const categoryName = isReceived
      ? creditAccount?.name || category?.name || '—'
      : debitAccount?.name || category?.name || '—';

    running += isReceived ? amount : -amount;

    return {
      id: posting.id,
      value_date: posting.value_date ?? posting.posting_date,
      description: posting.description || posting.notes || '',
      category_name: categoryName,
      amount,
      signed_amount: isReceived ? amount : -amount,
      is_received: isReceived,
      is_money_in: isReceived,
      currency: currencyCodeFromRow(posting),
      running_balance: running,
    };
  });

  return {
    focusAccountId,
    focusAccountName: accountName ?? null,
    openingBalance: open,
    currency: rows[0]?.currency ?? 'INR',
    rows,
  };
}

function transformJournalRows(records: PostingRow[], focusAccountId?: string | null) {
  return [...records]
    .sort((a, b) => {
      const ta = new Date(String(b.value_date ?? b.posting_date ?? '')).getTime();
      const tb = new Date(String(a.value_date ?? a.posting_date ?? '')).getTime();
      return ta - tb;
    })
    .map((posting) => {
      const amount = Number(posting.amount) || 0;
      const isReceived = focusAccountId
        ? isAmountReceived(posting, focusAccountId)
        : undefined;

      return {
        id: posting.id,
        value_date: posting.value_date ?? posting.posting_date,
        description: posting.description || posting.notes || '',
        notes: posting.notes,
        debit_account_name: accountNameFromRow(posting, 'debit'),
        debit_account_code: accountCodeFromRow(posting, 'debit'),
        credit_account_name:
          accountNameFromRow(posting, 'credit') !== '—'
            ? accountNameFromRow(posting, 'credit')
            : (posting.category as { name?: string } | undefined)?.name ?? '—',
        credit_account_code: accountCodeFromRow(posting, 'credit'),
        amount,
        ...(focusAccountId && {
          signed_amount: isReceived ? amount : -amount,
          is_received: isReceived,
        }),
        currency: currencyCodeFromRow(posting),
        legal_entity_name:
          (posting.legal_entity as { legal_name?: string; name?: string } | undefined)
            ?.legal_name ??
          (posting.legal_entity as { name?: string } | undefined)?.name ??
          null,
      };
    });
}

/**
 * Enrich posting searchRecords results with chat UI hints and pre-shaped row data.
 */
export async function enrichPostingSearchResult(
  base: Record<string, unknown>,
  auth: AuthContext,
  filters: SearchFilterEntry[],
  toolContext?: PostingSearchToolContext
): Promise<Record<string, unknown>> {
  const legalEntityId =
    (filters.find((f) => f.field === 'legal_entity_id' && f.operator === 'eq')?.value as
      | string
      | undefined) ??
    (toolContext?.modelContext?.legalEntityId as string | undefined);

  const finalize = (result: Record<string, unknown>) =>
    attachLegalEntityScopeToToolResult(auth, result, {
      legalEntityIds: legalEntityId ? [String(legalEntityId)] : undefined,
      search: filters,
    });

  const records = Array.isArray(base.data) ? (base.data as PostingRow[]) : [];
  if (records.length === 0) {
    return finalize(base);
  }

  const uiHint = resolvePostingDisplayMode(filters, toolContext);

  if (uiHint === 'account_ledger') {
    const focusAccountId = extractLedgerFocusAccountId(filters)!;
    let focusAccountName = toolContext?.modelContext?.selectedAccountName as string | undefined;
    if (!focusAccountName) {
      const match = records.find(
        (r) => r.account_id === focusAccountId || r.credit_account_id === focusAccountId
      );
      if (match) {
        focusAccountName =
          match.account_id === focusAccountId
            ? accountNameFromRow(match, 'debit')
            : accountNameFromRow(match, 'credit');
      }
    }

    const openingBalance = await fetchOpeningBalance(
      auth,
      focusAccountId,
      filters,
      legalEntityId
    );
    const ledger = transformLedgerRows(
      records,
      focusAccountId,
      openingBalance,
      focusAccountName
    );

    return finalize({
      ...base,
      uiHint: 'account_ledger',
      focusAccountId,
      focusAccountName: ledger.focusAccountName,
      currencyCode: ledger.currency,
      openingBalance: ledger.openingBalance,
      data: ledger.rows,
      columns: [
        { field: 'value_date', label: 'Date' },
        { field: 'description', label: 'Description' },
        { field: 'category_name', label: 'Category' },
        { field: 'signed_amount', label: 'Amount' },
        { field: 'running_balance', label: 'Balance' },
      ],
    });
  }

  const journalFocusAccountId = resolveJournalFocusAccountId(filters);
  const journalRows = transformJournalRows(records, journalFocusAccountId);
  const journalHighlight = resolveJournalHighlightMeta(filters, journalRows);

  if (uiHint === 'posting_dual') {
    const debitId = filters.find((f) => f.field === 'account_id' && f.operator === 'eq')
      ?.value as string;
    const creditId = filters.find(
      (f) => f.field === 'credit_account_id' && f.operator === 'eq'
    )?.value as string;

    const sample = records[0];
    const debitName = accountNameFromRow(sample, 'debit');
    const creditName = accountNameFromRow(sample, 'credit');

    return finalize({
      ...base,
      uiHint: 'posting_dual',
      currencyCode: journalRows[0]?.currency ?? 'INR',
      data: journalRows,
      tables: [
        {
          side: 'debit',
          accountId: debitId,
          accountName: debitName,
          accountCode: accountCodeFromRow(sample, 'debit'),
          title: `Debit account: ${debitName}`,
          rows: journalRows,
        },
        {
          side: 'credit',
          accountId: creditId,
          accountName: creditName,
          accountCode: accountCodeFromRow(sample, 'credit'),
          title: `Credit account: ${creditName}`,
          rows: journalRows,
        },
      ],
      columns: [
        { field: 'description', label: 'Transaction' },
        { field: 'debit_account_name', label: 'Debit Account' },
        { field: 'credit_account_name', label: 'Credit Account' },
        { field: 'amount', label: 'Amount' },
        { field: 'value_date', label: 'Date' },
      ],
    });
  }

  return finalize({
    ...base,
    uiHint: 'posting_journal',
    currencyCode: journalRows[0]?.currency ?? 'INR',
    data: journalRows,
    ...journalHighlight,
    columns: [
      { field: 'description', label: 'Transaction' },
      { field: 'debit_account_name', label: 'Debit Account' },
      { field: 'credit_account_name', label: 'Credit Account' },
      { field: 'amount', label: 'Amount' },
      { field: 'value_date', label: 'Date' },
    ],
  });
}
