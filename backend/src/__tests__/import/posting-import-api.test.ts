/**
 * Three-tier test suite for PostingImportService and the
 * POST /posting/custom/import-bank-statement endpoint.
 *
 * ── Debit / Credit Convention ────────────────────────────────────────────────
 * This service uses double-entry bookkeeping conventions.
 *
 *   Bank statement "Debit" (withdrawal, money OUT):
 *     account_id        = contra/expense account  (debit side — expense increases)
 *     credit_account_id = bank account            (credit side — asset decreases)
 *
 *   Bank statement "Credit" (deposit, money IN):
 *     account_id        = bank account            (debit side — asset increases)
 *     credit_account_id = contra/revenue account  (credit side — revenue increases)
 *
 * For CSV imports the caller expresses contra-account codes via column_mapping:
 *   "Expense Code" → "account_id"        (contra for debit rows)
 *   "Revenue Code" → "credit_account_id" (contra for credit rows)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tier 1 — Pure logic (always runs, no DB, no network)
 * Tier 2 — Mocked PDF extraction + real DB  (FABRIQ_IMPORT_TEST=1)
 * Tier 2 CSV — Direct CSV import + real DB  (FABRIQ_IMPORT_TEST=1)
 * Tier 2 CSV + codes — Account code resolution + real DB  (FABRIQ_IMPORT_TEST=1)
 * Tier 3 — Real PDF + AI categorisation + real DB  (FABRIQ_IMPORT_FULL_TEST=1)
 *
 * Run commands:
 *   npx jest src/__tests__/import/posting-import-api.test.ts
 *   FABRIQ_IMPORT_TEST=1 npx jest src/__tests__/import/posting-import-api.test.ts
 *   FABRIQ_IMPORT_TEST=1 FABRIQ_IMPORT_FULL_TEST=1 npx jest ...
 *   FABRIQ_IMPORT_TEST=1 LEAVE_DATA=1 npx jest ...
 *
 * Manual DB verification (after LEAVE_DATA=1):
 *   SELECT id, description, value_date, amount, account_id, credit_account_id
 *   FROM posting
 *   WHERE org_id = 'org_techflow_us'
 *     AND (account_id = 'acco_org_techflow_us_1102'
 *          OR credit_account_id = 'acco_org_techflow_us_1102')
 *   ORDER BY value_date DESC LIMIT 20;
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import prisma from '../../lib/prisma';
import { ModelService } from '../../services/core/ModelService';
import { PostingImportService } from '../../services/posting/PostingImportService';
import { stableUsCaDemoApiKeyPlaintext } from '../test-utils/demoStableApiKeys';

const execFileAsync = promisify(execFile);
import {
  parseCsvBuffer,
  applyColumnMapping,
  mapPdfRow,
  mapCsvRow,
  applyCategorizations,
} from '../../services/posting/PostingImportService';
import { buildPostingImportFieldMapping } from '../../lib/import/bankStatementImportClient';

// ── Constants ─────────────────────────────────────────────────────────────────

const US_CA_ORG_ID = 'org_techflow_us';
const CHECKING_ACCOUNT_ID = 'acco_org_techflow_us_1102'; // Checking Account

// Account codes in US/CA demo dataset
const SALARIES_ACCOUNT_CODE = '5201';
const RENT_ACCOUNT_CODE = '5203';

const CSV_FIXTURE = path.join(
  __dirname, '../../../test-data/us-ca-bank-import/sample-bank-statement.csv'
);
const CSV_WITH_CODES_FIXTURE = path.join(
  __dirname, '../../../test-data/us-ca-bank-import/sample-bank-statement-with-account-codes.csv'
);
const PDF_FIXTURE = path.join(
  __dirname, '../../../test-data/us-ca-bank-import/pdf-categorization-only/Chequing%20Statement-1113%202022-07-08.pdf'
);

const makeContext = () => ({
  user: {
    id: 'user_daniel_lee',
    org_id: US_CA_ORG_ID,
    email: 'daniel.lee@techflowsolutions.com',
    name: 'Daniel Lee',
  },
  permissions: {},
});

function isDatabaseUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Can't reach database") ||
    msg.includes('P1001') ||
    msg.includes('PrismaClientInitializationError') ||
    msg.includes('ECONNREFUSED')
  );
}

/** Parse the plain CSV fixture into transaction rows (as if from PDF extraction) */
function parseCsvFixture(): Record<string, any>[] {
  const content = fs.readFileSync(CSV_FIXTURE, 'utf8');
  return content.trim().split('\n').slice(1).map((line) => {
    const [value_date, description, debit, credit] = line.split(',');
    return {
      value_date: value_date?.trim(),
      description: description?.trim(),
      debit_amount: debit?.trim() ? parseFloat(debit.trim()) : undefined,
      credit_amount: credit?.trim() ? parseFloat(credit.trim()) : undefined,
    };
  });
}

/** Convenience: count posting rows touching the checking account since a timestamp */
async function countInsertedSince(since: Date) {
  return prisma.posting.count({
    where: {
      org_id: US_CA_ORG_ID,
      OR: [
        { account_id: CHECKING_ACCOUNT_ID },
        { credit_account_id: CHECKING_ACCOUNT_ID },
      ],
      created_at: { gte: since },
    },
  });
}

async function deleteInsertedSince(since: Date) {
  return prisma.posting.deleteMany({
    where: {
      org_id: US_CA_ORG_ID,
      OR: [
        { account_id: CHECKING_ACCOUNT_ID },
        { credit_account_id: CHECKING_ACCOUNT_ID },
      ],
      created_at: { gte: since },
    },
  });
}

// Column mappings
const PLAIN_CSV_MAP = {
  'Value Date': 'value_date',
  'Description': 'description',
  'Debit': 'debit_amount',
  'Credit': 'credit_amount',
};

// Expense Account Code → account_id (contra for debit rows, per double-entry convention)
const CODES_CSV_MAP = {
  'Value Date': 'value_date',
  'Description': 'description',
  'Debit': 'debit_amount',
  'Credit': 'credit_amount',
  'Expense Account Code': 'account_id',
};

// ── Tier 1: Pure logic (no DB, always runs) ───────────────────────────────────

describe('Tier 1 — mapping logic and validation (pure, no DB)', () => {

  // ── mapPdfRow: double-entry convention ─────────────────────────────────────

  it('mapPdfRow debit: bank → credit_account_id; account_id = undefined (no categorisation)', () => {
    const row = { debit_amount: 125.5, description: 'Office supplies' };
    const result = mapPdfRow(row, CHECKING_ACCOUNT_ID);
    expect(result.credit_account_id).toBe(CHECKING_ACCOUNT_ID); // bank credited
    expect(result.account_id).toBeUndefined();                  // expense — unknown without categorisation
    expect(result.amount).toBe(125.5);
    expect(result.debit_amount).toBeUndefined();
  });

  it('mapPdfRow credit: bank → account_id; credit_account_id = undefined (no categorisation)', () => {
    const row = { credit_amount: 2500, description: 'Client payment' };
    const result = mapPdfRow(row, CHECKING_ACCOUNT_ID);
    expect(result.account_id).toBe(CHECKING_ACCOUNT_ID);      // bank debited
    expect(result.credit_account_id).toBeUndefined();         // revenue — unknown without categorisation
    expect(result.amount).toBe(2500);
  });

  it('mapPdfRow debit with categorisation: expense account_id preserved, bank → credit_account_id', () => {
    const row = { debit_amount: 125.5, account_id: 'acco_expense_5201', description: 'Office' };
    const result = mapPdfRow(row, CHECKING_ACCOUNT_ID);
    expect(result.account_id).toBe('acco_expense_5201');       // expense on debit side
    expect(result.credit_account_id).toBe(CHECKING_ACCOUNT_ID); // bank on credit side
  });

  it('mapPdfRow credit with categorisation: revenue credit_account_id preserved, bank → account_id', () => {
    const row = { credit_amount: 2500, credit_account_id: 'acco_revenue_4001', description: 'Payment' };
    const result = mapPdfRow(row, CHECKING_ACCOUNT_ID);
    expect(result.account_id).toBe(CHECKING_ACCOUNT_ID);         // bank on debit side
    expect(result.credit_account_id).toBe('acco_revenue_4001'); // revenue on credit side
  });

  // ── mapCsvRow ──────────────────────────────────────────────────────────────

  it('mapCsvRow debit: bank → credit_account_id; resolved account_id (expense) preserved', () => {
    const row = { debit_amount: 5000, description: 'Salaries', account_id: 'acco_org_techflow_us_5201' };
    const result = mapCsvRow(row, CHECKING_ACCOUNT_ID);
    expect(result.credit_account_id).toBe(CHECKING_ACCOUNT_ID);        // bank on credit side
    expect(result.account_id).toBe('acco_org_techflow_us_5201');        // expense on debit side
    expect(result.amount).toBe(5000);
    expect(result.debit_amount).toBeUndefined();
  });

  it('mapCsvRow credit: bank → account_id; resolved credit_account_id (revenue) preserved', () => {
    const row = { credit_amount: 2500, description: 'Client payment', credit_account_id: 'acco_revenue_4001' };
    const result = mapCsvRow(row, CHECKING_ACCOUNT_ID);
    expect(result.account_id).toBe(CHECKING_ACCOUNT_ID);
    expect(result.credit_account_id).toBe('acco_revenue_4001');
  });

  // ── applyCategorizations ───────────────────────────────────────────────────

  it('applyCategorizations routes high-confidence prediction to account_id for debit row', () => {
    const txns: Record<string, any>[] = [
      { debit_amount: 100, description: 'Office supplies' },
    ];
    applyCategorizations(txns, [{ transaction_index: 0, account_id: 'acco_expense_5201', confidence_score: 0.87 }]);
    expect(txns[0].account_id).toBe('acco_expense_5201');
  });

  it('applyCategorizations routes high-confidence prediction to credit_account_id for credit row', () => {
    const txns: Record<string, any>[] = [
      { credit_amount: 2500, description: 'Client payment' },
    ];
    applyCategorizations(txns, [{ transaction_index: 0, account_id: 'acco_revenue_4001', confidence_score: 0.92 }]);
    expect(txns[0].credit_account_id).toBe('acco_revenue_4001');
  });

  it('applyCategorizations ignores low-confidence predictions (< 0.5)', () => {
    const txns: Record<string, any>[] = [{ debit_amount: 100, description: 'Unknown' }];
    applyCategorizations(txns, [{ transaction_index: 0, account_id: 'acco_xyz', confidence_score: 0.3 }]);
    expect(txns[0].account_id).toBeUndefined();
  });

  it('applyCategorizations ignores out-of-range indices', () => {
    const txns: Record<string, any>[] = [{ debit_amount: 100 }];
    applyCategorizations(txns, [{ transaction_index: 5, account_id: 'acco_xyz', confidence_score: 0.9 }]);
    expect(txns[0].account_id).toBeUndefined();
  });

  // ── applyColumnMapping ─────────────────────────────────────────────────────

  it('applyColumnMapping renames columns and converts numeric fields', () => {
    const row = { 'Value Date': '2026-01-15', 'Description': 'Office', 'Debit': '125.50', 'Credit': '' };
    const result = applyColumnMapping(row, PLAIN_CSV_MAP);
    expect(result.value_date).toBe('2026-01-15');
    expect(result.debit_amount).toBe(125.5);
    expect(result.credit_amount).toBeUndefined(); // blank → omitted
  });

  it('applyColumnMapping strips commas from numeric values', () => {
    const row = { 'Value Date': '2026-01-15', 'Description': 'Payroll', 'Debit': '1,500.00', 'Credit': '' };
    const result = applyColumnMapping(row, PLAIN_CSV_MAP);
    expect(result.debit_amount).toBe(1500);
  });

  it('applyColumnMapping omits zero amounts', () => {
    const row = { 'Value Date': '2026-01-15', 'Description': 'X', 'Debit': '0', 'Credit': '' };
    const result = applyColumnMapping(row, PLAIN_CSV_MAP);
    expect(result.debit_amount).toBeUndefined();
  });

  // ── column_mapping validation ──────────────────────────────────────────────

  it('CSV import throws when column_mapping is missing', async () => {
    await expect(
      PostingImportService.getInstance().importBankStatement(makeContext(), {
        fileBuffer: Buffer.from('Date,Amount\n2026-01-01,100'),
        mimeType: 'text/csv', fileSize: 30, fileName: 'test.csv',
        accountId: CHECKING_ACCOUNT_ID,
      })
    ).rejects.toThrow('column_mapping is required');
  });

  it('CSV import throws when a column maps to "amount"', async () => {
    await expect(
      PostingImportService.getInstance().importBankStatement(makeContext(), {
        fileBuffer: Buffer.from('Date,Amount\n2026-01-01,100'),
        mimeType: 'text/csv', fileSize: 30, fileName: 'test.csv',
        accountId: CHECKING_ACCOUNT_ID,
        columnMapping: { 'Date': 'value_date', 'Amount': 'amount' },
      })
    ).rejects.toThrow('"amount"');
  });

  it('CSV import throws when neither debit_amount nor credit_amount is mapped', async () => {
    await expect(
      PostingImportService.getInstance().importBankStatement(makeContext(), {
        fileBuffer: Buffer.from('Date,Desc\n2026-01-01,X'),
        mimeType: 'text/csv', fileSize: 20, fileName: 'test.csv',
        accountId: CHECKING_ACCOUNT_ID,
        columnMapping: { 'Date': 'value_date', 'Desc': 'description' },
      })
    ).rejects.toThrow('debit_amount');
  });

  it('PDF import throws when categorize=true but legalEntityId missing', async () => {
    await expect(
      PostingImportService.getInstance().importBankStatement(makeContext(), {
        fileBuffer: Buffer.from('fake'),
        mimeType: 'application/pdf', fileSize: 4, fileName: 'test.pdf',
        accountId: CHECKING_ACCOUNT_ID,
        categorize: true,
        // legalEntityId intentionally omitted
      })
    ).rejects.toThrow('legalEntityId is required');
  });

  // ── buildPostingImportFieldMapping ─────────────────────────────────────────

  it('buildPostingImportFieldMapping unions keys across mixed rows', () => {
    const rows = [
      { value_date: '2026-01-15', amount: 125.5, account_id: 'acc1', credit_account_id: 'bank', description: 'a' },
      { value_date: '2026-01-16', amount: 2500,  account_id: 'bank', credit_account_id: 'acc2', description: 'b' },
    ];
    const mapping = buildPostingImportFieldMapping(rows);
    expect(mapping.account_id).toBe('account_id');
    expect(mapping.credit_account_id).toBe('credit_account_id');
    expect(mapping.amount).toBe('amount');
    expect(mapping.debit_amount).toBeUndefined();
    expect(mapping.credit_amount).toBeUndefined();
  });

  // ── Fixtures ───────────────────────────────────────────────────────────────

  it('plain CSV fixture exists with 3 rows (2 debits, 1 credit)', () => {
    const rows = parseCsvFixture();
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.debit_amount != null)).toHaveLength(2);
    expect(rows.filter((r) => r.credit_amount != null)).toHaveLength(1);
  });

  it('account-codes CSV fixture exists with 3 rows', () => {
    const content = fs.readFileSync(CSV_WITH_CODES_FIXTURE, 'utf8');
    expect(content.trim().split('\n')).toHaveLength(4); // header + 3 rows
  });

  it('PDF fixture exists and is non-trivial', () => {
    expect(fs.existsSync(PDF_FIXTURE)).toBe(true);
    expect(fs.statSync(PDF_FIXTURE).size).toBeGreaterThan(10_000);
  });

  it('parseCsvBuffer parses a simple buffer', async () => {
    const csv = 'Value Date,Description,Debit,Credit\n2026-01-15,Office,125.50,\n2026-01-16,Payment,,2500.00';
    const rows = await parseCsvBuffer(Buffer.from(csv));
    expect(rows).toHaveLength(2);
    expect(rows[0]['Debit']).toBe('125.50');
    expect(rows[1]['Credit']).toBe('2500.00');
  });
});

// ── Tier 2: Mocked PDF extraction + real DB (FABRIQ_IMPORT_TEST=1) ───────────

const runTier2 = process.env.FABRIQ_IMPORT_TEST === '1';

describe('Tier 2 — mocked PDF extraction + real DB (FABRIQ_IMPORT_TEST=1)', () => {
  jest.setTimeout(30_000);
  let testStartTime: Date;
  let spy: jest.SpyInstance;

  beforeAll(async () => {
    if (!runTier2) return;
    try {
      const acct = await prisma.account.findUnique({ where: { id: CHECKING_ACCOUNT_ID }, select: { id: true } });
      if (!acct) throw new Error(`Account ${CHECKING_ACCOUNT_ID} not found — load us-ca-demo`);
    } catch (e) {
      if (isDatabaseUnavailable(e)) { console.log('Skipping Tier 2: DB unreachable'); return; }
      throw e;
    }
    const csvRows = parseCsvFixture();
    spy = jest.spyOn(ModelService.prototype, 'parseDocument').mockResolvedValue({
      success: true,
      data: { transactions: csvRows },
      metaData: { modelName: 'posting', fileName: 'sample.csv' },
    });
    testStartTime = new Date();
  });

  afterAll(async () => {
    if (!runTier2) return;
    spy?.mockRestore();
    if (!process.env.LEAVE_DATA) {
      await deleteInsertedSince(testStartTime!).catch((e) => console.warn('Tier 2 cleanup failed:', e));
      console.log('Tier 2 cleanup done.');
    }
    await prisma.$disconnect();
  });

  it('dry run returns 3 transactions without inserting', async () => {
    if (!runTier2) return console.log('Skipping (FABRIQ_IMPORT_TEST=1)');
    const before = await prisma.posting.count({
      where: { org_id: US_CA_ORG_ID, OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }] },
    });
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: Buffer.from('fake'), mimeType: 'application/pdf', fileSize: 4,
      fileName: 'sample.pdf', accountId: CHECKING_ACCOUNT_ID, dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    const after = await prisma.posting.count({
      where: { org_id: US_CA_ORG_ID, OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }] },
    });
    expect(after).toBe(before);
  });

  it('live import inserts 3 rows with correct double-entry account mapping', async () => {
    if (!runTier2) return console.log('Skipping (FABRIQ_IMPORT_TEST=1)');
    const progressEvents: string[] = [];
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: Buffer.from('fake'), mimeType: 'application/pdf', fileSize: 4,
      fileName: 'sample.pdf', accountId: CHECKING_ACCOUNT_ID,
      onProgress: (p) => progressEvents.push(p.step),
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(progressEvents).toEqual(['extracting', 'mapping', 'importing', 'complete']);

    const inserted = await prisma.posting.findMany({
      where: {
        org_id: US_CA_ORG_ID,
        OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }],
        created_at: { gte: testStartTime },
      },
      select: { amount: true, account_id: true, credit_account_id: true },
    });
    expect(inserted).toHaveLength(3);

    // 2 debit rows: bank → credit_account_id (asset decreases)
    const debitRows = inserted.filter((r) => r.credit_account_id === CHECKING_ACCOUNT_ID);
    expect(debitRows).toHaveLength(2);

    // 1 credit row: bank → account_id (asset increases)
    const creditRows = inserted.filter((r) => r.account_id === CHECKING_ACCOUNT_ID);
    expect(creditRows).toHaveLength(1);

    const amounts = inserted.map((r) => Number(r.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([49.99, 125.5, 2500.0]);
  });
});

// ── Tier 2 CSV: direct CSV import (FABRIQ_IMPORT_TEST=1) ─────────────────────

describe('Tier 2 CSV — direct CSV import + real DB (FABRIQ_IMPORT_TEST=1)', () => {
  jest.setTimeout(30_000);
  let testStartTime: Date;

  beforeAll(async () => {
    if (!runTier2) return;
    try {
      const acct = await prisma.account.findUnique({ where: { id: CHECKING_ACCOUNT_ID }, select: { id: true } });
      if (!acct) throw new Error(`Account ${CHECKING_ACCOUNT_ID} not found`);
    } catch (e) {
      if (isDatabaseUnavailable(e)) { console.log('Skipping Tier 2 CSV: DB unreachable'); return; }
      throw e;
    }
    testStartTime = new Date();
  });

  afterAll(async () => {
    if (!runTier2) return;
    if (!process.env.LEAVE_DATA) {
      await deleteInsertedSince(testStartTime!).catch((e) => console.warn('Tier 2 CSV cleanup failed:', e));
    }
  });

  it('CSV dry run returns 3 rows without inserting', async () => {
    if (!runTier2) return console.log('Skipping (FABRIQ_IMPORT_TEST=1)');
    const buf = fs.readFileSync(CSV_FIXTURE);
    const before = await prisma.posting.count({
      where: { org_id: US_CA_ORG_ID, OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }] },
    });
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: buf, mimeType: 'text/csv', fileSize: buf.length,
      fileName: 'sample.csv', accountId: CHECKING_ACCOUNT_ID,
      columnMapping: PLAIN_CSV_MAP, dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    const after = await prisma.posting.count({
      where: { org_id: US_CA_ORG_ID, OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }] },
    });
    expect(after).toBe(before);
  });

  it('CSV live import inserts 3 rows with correct double-entry mapping', async () => {
    if (!runTier2) return console.log('Skipping (FABRIQ_IMPORT_TEST=1)');
    const buf = fs.readFileSync(CSV_FIXTURE);
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: buf, mimeType: 'text/csv', fileSize: buf.length,
      fileName: 'sample.csv', accountId: CHECKING_ACCOUNT_ID,
      columnMapping: PLAIN_CSV_MAP,
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);

    const inserted = await prisma.posting.findMany({
      where: {
        org_id: US_CA_ORG_ID,
        OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }],
        created_at: { gte: testStartTime },
      },
      select: { amount: true, account_id: true, credit_account_id: true },
    });
    expect(inserted).toHaveLength(3);

    // 2 debit rows: bank → credit_account_id
    expect(inserted.filter((r) => r.credit_account_id === CHECKING_ACCOUNT_ID)).toHaveLength(2);
    // 1 credit row: bank → account_id
    expect(inserted.filter((r) => r.account_id === CHECKING_ACCOUNT_ID)).toHaveLength(1);

    const amounts = inserted.map((r) => Number(r.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([49.99, 125.5, 2500.0]);
  });
});

// ── Tier 2 CSV with account codes (FABRIQ_IMPORT_TEST=1) ─────────────────────

describe('Tier 2 CSV — account code resolution + real DB (FABRIQ_IMPORT_TEST=1)', () => {
  jest.setTimeout(30_000);
  let testStartTime: Date;

  beforeAll(async () => {
    if (!runTier2) return;
    try {
      const [acct5201, acct5203] = await Promise.all([
        prisma.account.findFirst({ where: { org_id: US_CA_ORG_ID, code: SALARIES_ACCOUNT_CODE }, select: { id: true } }),
        prisma.account.findFirst({ where: { org_id: US_CA_ORG_ID, code: RENT_ACCOUNT_CODE }, select: { id: true } }),
      ]);
      if (!acct5201) throw new Error(`No account with code ${SALARIES_ACCOUNT_CODE}`);
      if (!acct5203) throw new Error(`No account with code ${RENT_ACCOUNT_CODE}`);
    } catch (e) {
      if (isDatabaseUnavailable(e)) { console.log('Skipping account-code tier: DB unreachable'); return; }
      throw e;
    }
    testStartTime = new Date();
  });

  afterAll(async () => {
    if (!runTier2) return;
    if (!process.env.LEAVE_DATA) {
      await deleteInsertedSince(testStartTime!).catch((e) => console.warn('Account-code cleanup failed:', e));
    }
  });

  it('dry run: debit rows have account_id resolved from expense code (debit side)', async () => {
    if (!runTier2) return console.log('Skipping (FABRIQ_IMPORT_TEST=1)');
    const buf = fs.readFileSync(CSV_WITH_CODES_FIXTURE);
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: buf, mimeType: 'text/csv', fileSize: buf.length,
      fileName: 'with-codes.csv', accountId: CHECKING_ACCOUNT_ID,
      columnMapping: CODES_CSV_MAP, dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);

    const txns = result.transactions!;

    // Debit rows: account_id = resolved expense account (not the raw code)
    const officeRow = txns.find((r) => r.description === 'Office supplies');
    expect(officeRow?.account_id).toMatch(/^acco_/);            // resolved to a DB ID
    expect(officeRow?.account_id).not.toBe(SALARIES_ACCOUNT_CODE); // not the raw code
    expect(officeRow?.credit_account_id).toBe(CHECKING_ACCOUNT_ID); // bank on credit side ✓

    const subRow = txns.find((r) => r.description === 'Monthly subscription');
    expect(subRow?.account_id).toMatch(/^acco_/);
    expect(subRow?.account_id).not.toBe(RENT_ACCOUNT_CODE);
    expect(subRow?.credit_account_id).toBe(CHECKING_ACCOUNT_ID);

    // Credit row: account_id = bank (no expense code supplied)
    const creditRow = txns.find((r) => r.description === 'Client payment received');
    expect(creditRow?.account_id).toBe(CHECKING_ACCOUNT_ID);
  });

  it('live import: resolved expense account_id and bank credit_account_id stored correctly', async () => {
    if (!runTier2) return console.log('Skipping (FABRIQ_IMPORT_TEST=1)');
    const buf = fs.readFileSync(CSV_WITH_CODES_FIXTURE);
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: buf, mimeType: 'text/csv', fileSize: buf.length,
      fileName: 'with-codes.csv', accountId: CHECKING_ACCOUNT_ID,
      columnMapping: CODES_CSV_MAP,
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);

    const inserted = await prisma.posting.findMany({
      where: {
        org_id: US_CA_ORG_ID,
        OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }],
        created_at: { gte: testStartTime },
      },
      select: { description: true, amount: true, account_id: true, credit_account_id: true },
    });
    expect(inserted).toHaveLength(3);

    const officeRow = inserted.find((r) => r.description === 'Office supplies');
    expect(officeRow?.credit_account_id).toBe(CHECKING_ACCOUNT_ID); // bank on credit side
    expect(officeRow?.account_id).toMatch(/^acco_/);                // expense ID, not raw code

    const subRow = inserted.find((r) => r.description === 'Monthly subscription');
    expect(subRow?.credit_account_id).toBe(CHECKING_ACCOUNT_ID);
    expect(subRow?.account_id).toMatch(/^acco_/);

    const creditRow = inserted.find((r) => r.description === 'Client payment received');
    expect(creditRow?.account_id).toBe(CHECKING_ACCOUNT_ID);       // bank on debit side for deposit
  });
});

// ── Tier 3: Real PDF + AI categorisation + real DB (FABRIQ_IMPORT_FULL_TEST=1) ──

const runTier3 = process.env.FABRIQ_IMPORT_FULL_TEST === '1';

describe('Tier 3 — real PDF + AI categorisation + real DB (FABRIQ_IMPORT_FULL_TEST=1)', () => {
  jest.setTimeout(120_000);
  let testStartTime: Date;

  beforeAll(async () => {
    if (!runTier3) return;
    try {
      const acct = await prisma.account.findUnique({ where: { id: CHECKING_ACCOUNT_ID }, select: { id: true } });
      if (!acct) throw new Error(`Account ${CHECKING_ACCOUNT_ID} not found — load us-ca-demo`);
    } catch (e) {
      if (isDatabaseUnavailable(e)) { console.log('Skipping Tier 3: DB unreachable'); return; }
      throw e;
    }
    testStartTime = new Date();
  });

  afterAll(async () => {
    if (!runTier3) return;
    if (!process.env.LEAVE_DATA) {
      await deleteInsertedSince(testStartTime!).catch((e) => console.warn('Tier 3 cleanup failed:', e));
      console.log('Tier 3 cleanup done.');
    } else {
      console.log('LEAVE_DATA=1 — rows kept for manual verification.');
    }
    await prisma.$disconnect();
  });

  it('dry run without categorisation: extracts > 0 transactions, nothing inserted', async () => {
    if (!runTier3) return console.log('Skipping (FABRIQ_IMPORT_FULL_TEST=1)');
    const buf = fs.readFileSync(PDF_FIXTURE);
    const before = await prisma.posting.count({
      where: { org_id: US_CA_ORG_ID, OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }] },
    });
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: buf, mimeType: 'application/pdf', fileSize: buf.length,
      fileName: 'Chequing Statement-1113 2022-07-08.pdf',
      accountId: CHECKING_ACCOUNT_ID, dryRun: true,
    });
    console.log(`Tier 3 no-cat dry run: ${result.count} transactions`);
    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);
    expect(await prisma.posting.count({
      where: { org_id: US_CA_ORG_ID, OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }] },
    })).toBe(before);
  });

  it('dry run WITH categorisation: debit rows get expense account_id from LLM', async () => {
    if (!runTier3) return console.log('Skipping (FABRIQ_IMPORT_FULL_TEST=1)');

    // Find a legal entity in the org
    const entity = await (prisma as any).legal_entity.findFirst({
      where: { org_id: US_CA_ORG_ID },
      select: { id: true, legal_name: true },
    });
    if (!entity) {
      console.log('No legal entity found — skipping categorisation sub-test');
      return;
    }
    console.log(`Using legal entity: ${entity.legal_name} (${entity.id})`);

    const buf = fs.readFileSync(PDF_FIXTURE);
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: buf, mimeType: 'application/pdf', fileSize: buf.length,
      fileName: 'Chequing Statement-1113 2022-07-08.pdf',
      accountId: CHECKING_ACCOUNT_ID, dryRun: true,
      categorize: true, legalEntityId: entity.id,
    });

    console.log(`Tier 3 categorisation dry run: ${result.count} transactions`);
    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);

    const txns = result.transactions!;
    const debitRows = txns.filter((t) => t.credit_account_id === CHECKING_ACCOUNT_ID);
    const categorisedDebits = debitRows.filter((t) => t.account_id != null);
    console.log(`  Categorised ${categorisedDebits.length} / ${debitRows.length} debit rows`);
    // At least some debit rows should have an expense account_id from the LLM
    expect(categorisedDebits.length).toBeGreaterThan(0);
  });

  it('live import: inserts rows with valid dates, amounts, and correct bank-account side', async () => {
    if (!runTier3) return console.log('Skipping (FABRIQ_IMPORT_FULL_TEST=1)');
    const buf = fs.readFileSync(PDF_FIXTURE);
    const progressEvents: string[] = [];
    const result = await PostingImportService.getInstance().importBankStatement(makeContext(), {
      fileBuffer: buf, mimeType: 'application/pdf', fileSize: buf.length,
      fileName: 'Chequing Statement-1113 2022-07-08.pdf',
      accountId: CHECKING_ACCOUNT_ID,
      onProgress: (p) => { progressEvents.push(p.step); console.log(`  [${p.step}] ${p.message}`); },
    });
    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);
    console.log(`Tier 3 live: ${result.count} rows inserted`);

    expect(progressEvents[0]).toBe('extracting');
    expect(progressEvents[progressEvents.length - 1]).toBe('complete');

    const inserted = await prisma.posting.findMany({
      where: {
        org_id: US_CA_ORG_ID,
        OR: [{ account_id: CHECKING_ACCOUNT_ID }, { credit_account_id: CHECKING_ACCOUNT_ID }],
        created_at: { gte: testStartTime },
      },
      select: { value_date: true, amount: true, account_id: true, credit_account_id: true },
    });
    expect(inserted.length).toBe(result.count);
    expect(inserted.every((r) => r.value_date != null)).toBe(true);
    expect(inserted.every((r) => Number(r.amount) > 0)).toBe(true);
  });
});

// ── Script CLI smoke test (FABRIQ_IMPORT_TEST=1) ──────────────────────────────
//
// Spawns scripts/import-bank-statements.ts as a child process, which:
//   1. Authenticates via X-API-Key
//   2. Discovers CSV files in test-data/us-ca-bank-import
//   3. POSTs each to POST /api/posting/custom/import-bank-statement
//   4. Streams SSE progress back and prints a summary
//
// Requires a running backend server on http://localhost:4000.
// Guard: FABRIQ_IMPORT_TEST=1 (same as Tier 2 — server + DB assumed up).

describe('Script CLI — import-bank-statements.ts (FABRIQ_IMPORT_TEST=1)', () => {
  const runScriptTest = !!process.env.FABRIQ_IMPORT_TEST;
  const API_KEY = stableUsCaDemoApiKeyPlaintext('user_daniel_lee');
  const SCRIPT = path.resolve(__dirname, '../../../scripts/import-bank-statements.ts');
  const FOLDER  = path.resolve(__dirname, '../../../test-data/us-ca-bank-import');
  const PLAIN_MAP = JSON.stringify({
    'Value Date': 'value_date',
    'Description': 'description',
    'Debit': 'debit_amount',
    'Credit': 'credit_amount',
  });

  async function runScript(extraArgs: string[]): Promise<{ stdout: string; stderr: string }> {
    const args = [
      SCRIPT,
      '--api-key',    API_KEY,
      '--folder',     FOLDER,
      '--account-id', CHECKING_ACCOUNT_ID,
      '--column-mapping', PLAIN_MAP,
      ...extraArgs,
    ];
    // ts-node may print to stderr for non-errors; collect both
    try {
      return await execFileAsync('npx', ['ts-node', ...args], {
        cwd: path.resolve(__dirname, '../../..'),
        timeout: 60_000,
      });
    } catch (err: any) {
      // execFile rejects on non-zero exit; return stdout/stderr for assertions
      return { stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
    }
  }

  it('dry-run: script exits 0 and prints "Would import" for all CSV files', async () => {
    if (!runScriptTest) return console.log('Skipping script CLI test (FABRIQ_IMPORT_TEST not set)');

    const { stdout, stderr } = await runScript(['--dry-run']);
    const combined = stdout + stderr;

    // Summary line should show 2 files succeeded
    expect(combined).toMatch(/Files\s*:\s*2 total, 2 succeeded, 0 failed/);
    // Each file should report "Would import N transaction(s)"
    expect(combined).toMatch(/Would import \d+ transaction\(s\)/);
    // Overall rows line (dry-run suffix)
    expect(combined).toMatch(/dry run — not inserted/);
  }, 60_000);

  it('live import: script exits 0 and reports total rows imported', async () => {
    if (!runScriptTest) return console.log('Skipping script CLI test (FABRIQ_IMPORT_TEST not set)');
    const testStart = new Date();

    const { stdout, stderr } = await runScript([]);
    const combined = stdout + stderr;

    expect(combined).toMatch(/Files\s*:\s*2 total, 2 succeeded, 0 failed/);
    // Total should be > 0 actual imported rows (not dry-run message)
    expect(combined).toMatch(/Rows\s*:\s*\d+ imported/);
    expect(combined).not.toMatch(/dry run/);

    // DB: rows should have been created
    const inserted = await countInsertedSince(testStart);
    expect(inserted).toBeGreaterThan(0);

    // Cleanup
    if (!process.env.LEAVE_DATA) {
      await deleteInsertedSince(testStart);
    }
  }, 60_000);

  it('missing --column-mapping: script exits 1 with FAIL message for CSV files', async () => {
    if (!runScriptTest) return console.log('Skipping script CLI test (FABRIQ_IMPORT_TEST not set)');

    // Run without --column-mapping by calling script directly (bypass runScript helper)
    const args = [
      SCRIPT,
      '--api-key',    API_KEY,
      '--folder',     FOLDER,
      '--account-id', CHECKING_ACCOUNT_ID,
      '--dry-run',
    ];
    try {
      await execFileAsync('npx', ['ts-node', ...args], {
        cwd: path.resolve(__dirname, '../../..'),
        timeout: 30_000,
      });
      fail('Expected script to exit with non-zero code');
    } catch (err: any) {
      const combined = (err.stdout ?? '') + (err.stderr ?? '');
      expect(combined).toMatch(/CSV file requires --column-mapping/);
      expect(combined).toMatch(/failed/i);
    }
  }, 30_000);
});
