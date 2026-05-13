import { SystemDataLayer } from '../../dal/SystemDataLayer';
import logger from '../../../utils/logger';

const OBC_CODE = '__OBC__';

export interface MigrationJournalRow {
  account_id: string;
  balance: number; // positive = normal balance side; negative = abnormal side
}

export interface CreateMigrationJournalInput {
  legal_entity_id: string;
  migration_date: string; // YYYY-MM-DD
  rows: MigrationJournalRow[];
  replace?: boolean;
}

export interface MigrationJournalResult {
  postings_created: number;
  obc_balance: number;
  obc_account_id: string;
}

// Assets/Expense are debit-normal; everything else is credit-normal.
const CREDIT_NORMAL = new Set(['Liabilities', 'Income', 'Equity']);

export async function createMigrationJournal(
  sdl: SystemDataLayer,
  input: CreateMigrationJournalInput
): Promise<MigrationJournalResult> {
  const { legal_entity_id, migration_date, rows, replace } = input;

  if (!rows.length) throw new Error('No rows provided');

  const date = new Date(migration_date);

  // ── 1. Guard: check for existing OPENING_BALANCE postings ─────────────────
  const existing = await sdl.findFirst('posting', {
    legal_entity_id,
    posting_type: 'OPENING_BALANCE',
    value_date: date,
  });

  if (existing && !replace) {
    throw new Error(
      `Opening Balance postings already exist for entity ${legal_entity_id} on ${migration_date}. ` +
        `Pass replace=true to overwrite.`
    );
  }

  // ── 2. Resolve account classifications ────────────────────────────────────
  const accountIds = rows.map((r) => r.account_id);
  const accounts = await sdl.findMany<{ id: string; name: string; classification: string | null }>(
    'account',
    { id: { in: accountIds } },
    { select: { id: true, name: true, classification: true } }
  );

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const missing = accountIds.filter((id) => !accountMap.has(id));
  if (missing.length) {
    throw new Error(`Accounts not found in org: ${missing.join(', ')}`);
  }

  // ── 3. Upsert "Opening Balance Clearing" account ──────────────────────────
  const obcId = `acco_${legal_entity_id}_obc`.replace(/[^a-zA-Z0-9_]/g, '_');

  await sdl.upsert('account', {
    where: { id: obcId },
    create: {
      id: obcId,
      name: 'Opening Balance Clearing',
      classification: 'Equity',
      type: [],
      code: OBC_CODE,
      legal_entity_id,
      is_active: true,
    },
    update: {},
    select: { id: true }, // guard against schema drift on account model
  });

  // ── 4. Build postings ──────────────────────────────────────────────────────
  const postingData: object[] = [];

  for (const row of rows) {
    if (row.balance === 0) continue;

    const account = accountMap.get(row.account_id)!;
    const isCreditNormal = CREDIT_NORMAL.has(account.classification ?? '');
    const isNormalBalance = row.balance > 0;
    const amount = Math.abs(row.balance);

    let debitId: string;
    let creditId: string;

    if (!isCreditNormal) {
      // Debit-normal (Assets, Expense): normal → DR account, CR OBC
      debitId = isNormalBalance ? row.account_id : obcId;
      creditId = isNormalBalance ? obcId : row.account_id;
    } else {
      // Credit-normal (Liabilities, Equity, Income): normal → DR OBC, CR account
      debitId = isNormalBalance ? obcId : row.account_id;
      creditId = isNormalBalance ? row.account_id : obcId;
    }

    postingData.push({
      account_id: debitId,
      credit_account_id: creditId,
      amount,
      posting_date: date,
      value_date: date,
      posting_type: 'OPENING_BALANCE',
      name: `Opening Balance - ${account.name ?? row.account_id}`,
      notes: `Migration journal for entity ${legal_entity_id} as of ${migration_date}`,
      status: 'ACTIVE',
      legal_entity_id,
    });
  }

  // ── 5. Execute in transaction (delete-then-create if replace) ─────────────
  await sdl.transaction(async (tx) => {
    if (existing && replace) {
      await tx.deleteMany('posting', {
        legal_entity_id,
        posting_type: 'OPENING_BALANCE',
        value_date: date,
      });
      logger.info('Deleted existing opening balance postings', { legal_entity_id, migration_date });
    }
    await tx.createMany('posting', postingData);
  });

  // ── 6. Compute OBC balance for caller (informational) ─────────────────────
  let obcBalance = 0;
  for (const p of postingData as any[]) {
    if (p.credit_account_id === obcId) obcBalance += Number(p.amount);
    if (p.account_id === obcId) obcBalance -= Number(p.amount);
  }

  logger.info('Migration journal created', {
    legal_entity_id,
    migration_date,
    postings_created: postingData.length,
    obc_balance: obcBalance,
  });

  return { postings_created: postingData.length, obc_balance: obcBalance, obc_account_id: obcId };
}

export async function deleteMigrationJournal(
  sdl: SystemDataLayer,
  input: { legal_entity_id: string; migration_date: string }
): Promise<{ deleted: number }> {
  const { legal_entity_id, migration_date } = input;
  const result = await sdl.deleteMany('posting', {
    legal_entity_id,
    posting_type: 'OPENING_BALANCE',
    value_date: new Date(migration_date),
  });
  logger.info('Deleted migration journal postings', { legal_entity_id, migration_date, deleted: result.count });
  return { deleted: result.count };
}

export async function getMigrationJournalStatus(
  sdl: SystemDataLayer,
  input: { legal_entity_id: string }
): Promise<{ dates: string[]; postings_count: number }> {
  const postings = await sdl.groupBy<{ value_date: Date; _count: { id: number } }>('posting', {
    by: ['value_date'],
    where: { legal_entity_id: input.legal_entity_id, posting_type: 'OPENING_BALANCE' },
    _count: { id: true },
    orderBy: { value_date: 'desc' },
  });

  return {
    dates: postings.map((p) => (p.value_date as Date).toISOString().split('T')[0]),
    postings_count: postings.reduce((sum, p) => sum + p._count.id, 0),
  };
}
