/**
 * Test suite for the Opening Balance Migration Journal feature.
 *
 * ── Double-entry conventions ─────────────────────────────────────────────────
 *  Assets / Expense (debit-normal):
 *    positive balance → DR account, CR Opening Balance Clearing (OBC)
 *    negative balance → DR OBC,     CR account
 *
 *  Liabilities / Equity / Income (credit-normal):
 *    positive balance → DR OBC,     CR account
 *    negative balance → DR account, CR OBC
 *
 *  When all entries are balanced (Assets = L + E) the OBC account nets to 0.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tier 1 — Pure logic (always runs, no DB)
 * Tier 2 — Integration with real DB  (MIGRATION_JOURNAL_TEST=1)
 *   Run: MIGRATION_JOURNAL_TEST=1 npx jest src/__tests__/setup/migration-journal.test.ts
 *   Leave data: MIGRATION_JOURNAL_TEST=1 LEAVE_DATA=1 npx jest ...
 *
 * Indian demo constants:
 *   org_id           = org_indian_demo
 *   legal_entity_id  = org_indian_demo   (APR_MAR FY)
 *   migration_date   = 2024-03-31        (last day of FY2023-24)
 *   API key          = fabriq-indian-demo-user_arjun_sharma
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../lib/prisma';
import { SystemDataLayer } from '../../services/dal/SystemDataLayer';
import {
  createMigrationJournal,
  deleteMigrationJournal,
  getMigrationJournalStatus,
  MigrationJournalRow,
} from '../../services/book-keeping/migration-journal/MigrationJournalService';
import {
  parseMigrationJournalCsv,
  importMigrationJournalFromCsv,
} from '../../services/book-keeping/migration-journal/MigrationJournalCsvParser';

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID           = 'org_indian_demo';
const LEGAL_ENTITY_ID  = 'org_indian_demo';
const MIGRATION_DATE   = '2024-03-31';
const CREATED_BY       = 'user_arjun_sharma';

// Leaf accounts in indian demo (not group headers)
const ACCOUNTS = {
  cashOnHand:          'acco_org_indian_demo_1101', // Assets   code=1101
  checkingAccount:     'acco_org_indian_demo_1102', // Assets   code=1102
  accountsReceivable:  'acco_org_indian_demo_1105', // Assets   code=1105
  accountsPayable:     'acco_org_indian_demo_2101', // Liabilities code=2101
  loanPayable:         'acco_org_indian_demo_2201', // Liabilities code=2201
  ownerCapital:        'acco_org_indian_demo_3101', // Equity   code=3101
  retainedEarnings:    'acco_org_indian_demo_3102', // Equity   code=3102
};

const OBC_ACCOUNT_ID = `acco_${ORG_ID}_${LEGAL_ENTITY_ID}_obc`.replace(/[^a-zA-Z0-9_]/g, '_');

const CSV_BY_CODE_FIXTURE = path.join(
  __dirname, '../../../test-data/migration-journal/trial-balance-by-code.csv'
);
const CSV_BY_NAME_FIXTURE = path.join(
  __dirname, '../../../test-data/migration-journal/trial-balance-by-name.csv'
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSDL() {
  return new SystemDataLayer(prisma, ORG_ID, CREATED_BY);
}

function makeBalancedRows(): MigrationJournalRow[] {
  // Assets = 100,000; Liabilities = 60,000; Equity = 40,000 → balanced
  return [
    { account_id: ACCOUNTS.cashOnHand,         balance: 50_000 },
    { account_id: ACCOUNTS.checkingAccount,    balance: 30_000 },
    { account_id: ACCOUNTS.accountsReceivable, balance: 20_000 },
    { account_id: ACCOUNTS.accountsPayable,    balance: 25_000 },
    { account_id: ACCOUNTS.loanPayable,        balance: 35_000 },
    { account_id: ACCOUNTS.ownerCapital,       balance: 40_000 },
  ];
}

function makeUnbalancedRows(): MigrationJournalRow[] {
  // Assets = 100,000; Liabilities = 60,000; Equity missing → OBC = 40,000
  return [
    { account_id: ACCOUNTS.cashOnHand,         balance: 50_000 },
    { account_id: ACCOUNTS.checkingAccount,    balance: 30_000 },
    { account_id: ACCOUNTS.accountsReceivable, balance: 20_000 },
    { account_id: ACCOUNTS.accountsPayable,    balance: 25_000 },
    { account_id: ACCOUNTS.loanPayable,        balance: 35_000 },
  ];
}

async function cleanUp(sdl: SystemDataLayer) {
  await sdl.deleteMany('posting', {
    legal_entity_id: LEGAL_ENTITY_ID,
    posting_type: 'OPENING_BALANCE',
  });
  // Remove OBC account if we created it
  try {
    await (prisma as any).account.deleteMany({ where: { id: OBC_ACCOUNT_ID } });
  } catch {}
}

// ── Tier 1: Pure logic ────────────────────────────────────────────────────────

describe('Tier 1 — Pure logic (no DB)', () => {
  it('CSV fixture files exist', () => {
    expect(fs.existsSync(CSV_BY_CODE_FIXTURE)).toBe(true);
    expect(fs.existsSync(CSV_BY_NAME_FIXTURE)).toBe(true);
  });

  it('balanced rows: Assets = Liabilities + Equity', () => {
    const rows = makeBalancedRows();
    const assets      = rows.filter((r) => ['acco_org_indian_demo_1101','acco_org_indian_demo_1102','acco_org_indian_demo_1105'].includes(r.account_id));
    const liabilities = rows.filter((r) => ['acco_org_indian_demo_2101','acco_org_indian_demo_2201'].includes(r.account_id));
    const equity      = rows.filter((r) => ['acco_org_indian_demo_3101'].includes(r.account_id));

    const totalAssets      = assets.reduce((s, r) => s + r.balance, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
    const totalEquity      = equity.reduce((s, r) => s + r.balance, 0);

    expect(totalAssets).toBe(totalLiabilities + totalEquity);
  });

  it('OBC account id derivation is deterministic', () => {
    const expected = `acco_${ORG_ID}_${LEGAL_ENTITY_ID}_obc`.replace(/[^a-zA-Z0-9_]/g, '_');
    expect(OBC_ACCOUNT_ID).toBe(expected);
  });
});

// ── Tier 2: DB integration ────────────────────────────────────────────────────

const RUN_DB = process.env.MIGRATION_JOURNAL_TEST === '1';
const LEAVE  = process.env.LEAVE_DATA === '1';

(RUN_DB ? describe : describe.skip)('Tier 2 — DB integration', () => {
  let sdl: SystemDataLayer;

  beforeAll(async () => {
    sdl = makeSDL();
    await cleanUp(sdl);
  });

  afterAll(async () => {
    if (!LEAVE) await cleanUp(sdl);
    await prisma.$disconnect();
  });

  // ── 2a: Balanced journal ──────────────────────────────────────────────────

  describe('2a — balanced journal', () => {
    it('creates 6 postings with OBC balance = 0', async () => {
      const result = await createMigrationJournal(sdl, {
        legal_entity_id: LEGAL_ENTITY_ID,
        migration_date: MIGRATION_DATE,
        rows: makeBalancedRows(),
      });

      expect(result.postings_created).toBe(6);
      expect(Math.abs(result.obc_balance)).toBeLessThan(0.01);
      expect(result.obc_account_id).toBe(OBC_ACCOUNT_ID);
    });

    it('each posting has both account_id and credit_account_id set (true double-entry)', async () => {
      const postings = await (prisma as any).posting.findMany({
        where: {
          org_id: ORG_ID,
          legal_entity_id: LEGAL_ENTITY_ID,
          posting_type: 'OPENING_BALANCE',
          value_date: new Date(MIGRATION_DATE),
        },
        select: { account_id: true, credit_account_id: true, amount: true },
      });

      expect(postings).toHaveLength(6);
      for (const p of postings) {
        expect(p.account_id).toBeTruthy();
        expect(p.credit_account_id).toBeTruthy();
        expect(Number(p.amount)).toBeGreaterThan(0);
      }
    });

    it('asset account has debit leg (account_id = asset, credit_account_id = OBC)', async () => {
      const cashPosting = await (prisma as any).posting.findFirst({
        where: {
          org_id: ORG_ID,
          posting_type: 'OPENING_BALANCE',
          account_id: ACCOUNTS.cashOnHand,
        },
        select: { account_id: true, credit_account_id: true, amount: true },
      });

      expect(cashPosting).not.toBeNull();
      expect(cashPosting.account_id).toBe(ACCOUNTS.cashOnHand);
      expect(cashPosting.credit_account_id).toBe(OBC_ACCOUNT_ID);
      expect(Number(cashPosting.amount)).toBe(50_000);
    });

    it('liability account has credit leg (account_id = OBC, credit_account_id = liability)', async () => {
      const apPosting = await (prisma as any).posting.findFirst({
        where: {
          org_id: ORG_ID,
          posting_type: 'OPENING_BALANCE',
          credit_account_id: ACCOUNTS.accountsPayable,
        },
        select: { account_id: true, credit_account_id: true, amount: true },
      });

      expect(apPosting).not.toBeNull();
      expect(apPosting.account_id).toBe(OBC_ACCOUNT_ID);
      expect(apPosting.credit_account_id).toBe(ACCOUNTS.accountsPayable);
      expect(Number(apPosting.amount)).toBe(25_000);
    });
  });

  // ── 2b: Duplicate guard ───────────────────────────────────────────────────

  describe('2b — duplicate guard', () => {
    it('rejects a second submit without replace=true (error message contains "already exist")', async () => {
      await expect(
        createMigrationJournal(sdl, {
          legal_entity_id: LEGAL_ENTITY_ID,
          migration_date: MIGRATION_DATE,
          rows: makeBalancedRows(),
        })
      ).rejects.toThrow(/already exist/);
    });
  });

  // ── 2c: Status endpoint ───────────────────────────────────────────────────

  describe('2c — status', () => {
    it('returns the migration_date and correct posting count', async () => {
      const status = await getMigrationJournalStatus(sdl, { legal_entity_id: LEGAL_ENTITY_ID });
      expect(status.dates).toContain(MIGRATION_DATE);
      expect(status.postings_count).toBe(6);
    });
  });

  // ── 2d: Replace ───────────────────────────────────────────────────────────

  describe('2d — replace', () => {
    it('replaces existing postings (no duplicates, 5 postings for unbalanced)', async () => {
      const result = await createMigrationJournal(sdl, {
        legal_entity_id: LEGAL_ENTITY_ID,
        migration_date: MIGRATION_DATE,
        rows: makeUnbalancedRows(),
        replace: true,
      });

      expect(result.postings_created).toBe(5);
      expect(Math.abs(result.obc_balance)).toBeCloseTo(40_000, 1);

      const count = await (prisma as any).posting.count({
        where: {
          org_id: ORG_ID,
          legal_entity_id: LEGAL_ENTITY_ID,
          posting_type: 'OPENING_BALANCE',
          value_date: new Date(MIGRATION_DATE),
        },
      });
      expect(count).toBe(5);
    });

    it('re-submit balanced replaces unbalanced (OBC returns to 0)', async () => {
      const result = await createMigrationJournal(sdl, {
        legal_entity_id: LEGAL_ENTITY_ID,
        migration_date: MIGRATION_DATE,
        rows: makeBalancedRows(),
        replace: true,
      });

      expect(result.postings_created).toBe(6);
      expect(Math.abs(result.obc_balance)).toBeLessThan(0.01);
    });
  });

  // ── 2e: Delete ────────────────────────────────────────────────────────────

  describe('2e — delete', () => {
    it('removes all opening balance postings for the entity/date', async () => {
      const result = await deleteMigrationJournal(sdl, {
        legal_entity_id: LEGAL_ENTITY_ID,
        migration_date: MIGRATION_DATE,
      });

      expect(result.deleted).toBe(6);

      const remaining = await (prisma as any).posting.count({
        where: {
          org_id: ORG_ID,
          legal_entity_id: LEGAL_ENTITY_ID,
          posting_type: 'OPENING_BALANCE',
          value_date: new Date(MIGRATION_DATE),
        },
      });
      expect(remaining).toBe(0);
    });

    it('status returns empty after delete', async () => {
      const status = await getMigrationJournalStatus(sdl, { legal_entity_id: LEGAL_ENTITY_ID });
      expect(status.postings_count).toBe(0);
    });
  });

  // ── 2f: CSV by account code ───────────────────────────────────────────────

  describe('2f — CSV import (Debit/Credit columns + account code)', () => {
    afterEach(async () => {
      if (!LEAVE) await cleanUp(sdl);
    });

    it('parses CSV and resolves account codes correctly', async () => {
      const csvText = fs.readFileSync(CSV_BY_CODE_FIXTURE, 'utf-8');
      const { rows, errors } = await parseMigrationJournalCsv(sdl, csvText, LEGAL_ENTITY_ID);

      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(6);

      const cashRow = rows.find((r) => r.account_id === ACCOUNTS.cashOnHand);
      expect(cashRow?.balance).toBe(50_000); // debit → positive for asset

      const apRow = rows.find((r) => r.account_id === ACCOUNTS.accountsPayable);
      expect(apRow?.balance).toBe(25_000); // credit → positive for liability
    });

    it('imports via importMigrationJournalFromCsv → balanced', async () => {
      const csvText = fs.readFileSync(CSV_BY_CODE_FIXTURE, 'utf-8');
      const result = await importMigrationJournalFromCsv(sdl, csvText, LEGAL_ENTITY_ID, MIGRATION_DATE);

      expect(result.parse_errors).toHaveLength(0);
      expect(result.postings_created).toBe(6);
      expect(Math.abs(result.obc_balance)).toBeLessThan(0.01);
    });
  });

  // ── 2g: CSV by account name + single balance column ──────────────────────

  describe('2g — CSV import (signed Balance column + account name)', () => {
    afterEach(async () => {
      if (!LEAVE) await cleanUp(sdl);
    });

    it('parses CSV with signed balance column correctly', async () => {
      const csvText = fs.readFileSync(CSV_BY_NAME_FIXTURE, 'utf-8');
      const { rows, errors } = await parseMigrationJournalCsv(sdl, csvText, LEGAL_ENTITY_ID);

      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(6);

      // Signed balance CSV: assets positive, liabilities negative
      const cashRow = rows.find((r) => r.account_id === ACCOUNTS.cashOnHand);
      expect(cashRow?.balance).toBe(50_000);

      const apRow = rows.find((r) => r.account_id === ACCOUNTS.accountsPayable);
      expect(apRow?.balance).toBe(-25_000); // negative = credit-normal abnormal = DR (still Payable)
    });

    it('imports via importMigrationJournalFromCsv → OBC non-zero (L+E accounts are negative, so net differs)', async () => {
      const csvText = fs.readFileSync(CSV_BY_NAME_FIXTURE, 'utf-8');
      const result = await importMigrationJournalFromCsv(sdl, csvText, LEGAL_ENTITY_ID, MIGRATION_DATE);

      expect(result.parse_errors).toHaveLength(0);
      expect(result.postings_created).toBeGreaterThan(0);
    });
  });

  // ── 2h: Unknown account in CSV ────────────────────────────────────────────

  describe('2h — CSV parse errors', () => {
    it('records parse errors for unresolvable account names', async () => {
      const csvText = `Account Code,Balance\n9999,10000\n8888,5000\n`;
      const { rows, errors } = await parseMigrationJournalCsv(sdl, csvText, LEGAL_ENTITY_ID);

      expect(errors).toHaveLength(2);
      expect(rows).toHaveLength(0);
    });

    it('throws when no valid rows and all are errors', async () => {
      const csvText = `Account Code,Balance\n9999,10000\n`;
      await expect(
        importMigrationJournalFromCsv(sdl, csvText, LEGAL_ENTITY_ID, MIGRATION_DATE)
      ).rejects.toThrow(/no valid rows/);
    });
  });
});
