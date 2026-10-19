export type FilterableReport = {
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, number>;
};

export type ChartAccount = {
  id: string;
  code?: string | null;
  name?: string | null;
  classification?: string | null;
  parent_account_id?: string | null;
  entity_id?: string | null;
  currency?: { code?: string | null } | null;
};

const STATEMENT_CLASSES: Record<string, string[] | null> = {
  'income-statement': ['income', 'expense'],
  'balance-sheet': ['asset', 'liability', 'equity'],
  'trial-balance': null,
};

export function descendantIds(accounts: ChartAccount[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const account of accounts) {
    const parentId = account.parent_account_id;
    if (!parentId) continue;
    const list = children.get(parentId) ?? [];
    list.push(account.id);
    children.set(parentId, list);
  }
  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const child of children.get(current) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child);
      stack.push(child);
    }
  }
  return ids;
}

function amount(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasActivity(path: string, row: Record<string, unknown>): boolean {
  if (path === 'income-statement') return amount(row, 'amount') !== 0 || amount(row, 'source_amount') !== 0;
  if (path === 'balance-sheet') return amount(row, 'opening_balance') !== 0 || amount(row, 'closing_balance') !== 0;
  if (path === 'trial-balance') {
    return (
      amount(row, 'opening_debit') !== 0 ||
      amount(row, 'opening_credit') !== 0 ||
      amount(row, 'period_debit') !== 0 ||
      amount(row, 'period_credit') !== 0
    );
  }
  if (path === 'cash-flow') return amount(row, 'net_cash') !== 0;
  if (path === 'posting-list') return amount(row, 'amount') !== 0 || amount(row, 'converted_amount') !== 0;
  return true;
}

function rowMatchesAccount(path: string, row: Record<string, unknown>, ids: Set<string>): boolean {
  if (path === 'posting-list') {
    return ids.has(String(row.debit_account_id || '')) || ids.has(String(row.credit_account_id || ''));
  }
  return ids.has(String(row.account_id || ''));
}

function zeroRow(path: string, account: ChartAccount): Record<string, unknown> | null {
  const base = {
    account_id: account.id,
    code: account.code ?? '',
    name: account.name ?? '',
    classification: account.classification ?? '',
    account_currency: account.currency?.code ?? '',
    rate: 1,
    rate_missing: false,
  };
  if (path === 'income-statement') return { ...base, amount: 0, source_amount: 0 };
  if (path === 'balance-sheet') {
    return {
      ...base,
      opening_balance: 0,
      closing_balance: 0,
      source_opening_balance: 0,
      source_closing_balance: 0,
      opening_rate: 1,
    };
  }
  if (path === 'trial-balance') {
    return {
      ...base,
      opening_debit: 0,
      opening_credit: 0,
      period_debit: 0,
      period_credit: 0,
    };
  }
  return null;
}

function accountInScope(account: ChartAccount, entityIds: string[]): boolean {
  if (entityIds.length === 0) return true;
  return Boolean(account.entity_id && entityIds.includes(account.entity_id));
}

function withZeroAccounts(
  path: string,
  rows: Record<string, unknown>[],
  accounts: ChartAccount[],
  entityIds: string[]
): Record<string, unknown>[] {
  const classes = STATEMENT_CLASSES[path];
  if (classes === undefined) return rows;
  const present = new Set(rows.map((row) => String(row.account_id || '')));
  const extras = accounts
    .filter((account) => account.id && !present.has(account.id))
    .filter((account) => classes == null || classes.includes(String(account.classification || '')))
    .filter((account) => accountInScope(account, entityIds))
    .map((account) => zeroRow(path, account))
    .filter((row): row is Record<string, unknown> => row != null);
  return [...rows, ...extras].sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));
}

function trialTotals(rows: Record<string, unknown>[]): Record<string, number> {
  const totals = { opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 0 };
  for (const row of rows) {
    totals.opening_debit += amount(row, 'opening_debit');
    totals.opening_credit += amount(row, 'opening_credit');
    totals.period_debit += amount(row, 'period_debit');
    totals.period_credit += amount(row, 'period_credit');
  }
  return totals;
}

export function applyReportFilters<T extends FilterableReport>(
  report: T,
  options: {
    path: string;
    showOnlyActivity: boolean;
    accountId: string | null;
    accounts: ChartAccount[];
    entityIds: string[];
  }
): T {
  let rows = report.rows as Record<string, unknown>[];
  if (!options.showOnlyActivity) {
    rows = withZeroAccounts(options.path, rows, options.accounts, options.entityIds);
  }
  if (options.accountId) {
    const ids = descendantIds(options.accounts, options.accountId);
    rows = rows.filter((row) => rowMatchesAccount(options.path, row, ids));
  }
  if (options.showOnlyActivity) {
    rows = rows.filter((row) => hasActivity(options.path, row));
  }
  const next = { ...report, rows };
  if (options.path === 'trial-balance' && report.totals) {
    next.totals = trialTotals(rows);
  }
  return next;
}
