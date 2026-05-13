/**
 * Verification Suite — Opening Balance Migration + FY2025-26 Activity
 *
 * Simulates a real-world Zoho Books migration for Demo Tech Pvt Ltd:
 *  1. Imports FY2024-25 closing balances via migration journal (CSV)
 *  2. Posts 20 FY2025-26 business-activity entries with stable IDs
 *  3. Validates the trial balance includes both opening and activity
 *
 * ── Opening balance sheet (2025-03-31) ───────────────────────────────────────
 *  Assets    12,050,000 = Liabilities 6,050,000 + Equity 6,000,000  (OBC = 0)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tier 1 — Pure logic (no DB, always runs)
 * Tier 2 — Integration (VERIFICATION_SUITE_TEST=1)
 *   Run:        VERIFICATION_SUITE_TEST=1 npx jest src/__tests__/setup/verification-suite.test.ts
 *   Leave data: VERIFICATION_SUITE_TEST=1 LEAVE_DATA=1 npx jest ...
 *   Cleanup:    VERIFICATION_SUITE_TEST=1 npx jest ... (re-run without LEAVE_DATA)
 *
 * Requires: Indian demo loaded in .env.test (org_id = org_indian_demo)
 * Assumes:  No FY2025-26 postings exist before the test run.
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../lib/prisma';
import { SystemDataLayer } from '../../services/dal/SystemDataLayer';
import {
  importMigrationJournalFromCsv,
} from '../../services/book-keeping/migration-journal/MigrationJournalCsvParser';
import {
  deleteMigrationJournal,
  getMigrationJournalStatus,
} from '../../services/book-keeping/migration-journal/MigrationJournalService';
import { getTrialBalance } from '../../lib/reports/perfin';

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID          = 'org_indian_demo';
const LEGAL_ENTITY_ID = 'org_indian_demo';
const MIGRATION_DATE  = '2025-03-31'; // last day of FY2024-25
const FY_START        = '2025-04-01';
const FY_END          = '2026-03-31';
const CREATED_BY      = 'user_arjun_sharma';

const ACCOUNTS = {
  cashOnHand:          'acco_org_indian_demo_1101',
  checkingAccount:     'acco_org_indian_demo_1102',
  savingsAccount:      'acco_org_indian_demo_1103',
  inventory:           'acco_org_indian_demo_1106',
  accountsReceivable:  'acco_org_indian_demo_1105',
  prepaidExpenses:     'acco_org_indian_demo_1107',
  fixedAssets:         'acco_org_indian_demo_1201',
  accumulatedDep:      'acco_org_indian_demo_1202',
  deposits:            'acco_org_indian_demo_1203',
  accountsPayable:     'acco_org_indian_demo_2101',
  payrollLiabilities:  'acco_org_indian_demo_2103',
  taxesPayable:        'acco_org_indian_demo_2104',
  loanPayable:         'acco_org_indian_demo_2201',
  ownerCapital:        'acco_org_indian_demo_3101',
  retainedEarnings:    'acco_org_indian_demo_3102',
  salesRevenue:        'acco_org_indian_demo_4101',
  serviceRevenue:      'acco_org_indian_demo_4102',
  cogs:                'acco_org_indian_demo_5101',
  salaries:            'acco_org_indian_demo_5201',
  payrollTaxes:        'acco_org_indian_demo_5202',
  rent:                'acco_org_indian_demo_5203',
  marketing:           'acco_org_indian_demo_5206',
  professional:        'acco_org_indian_demo_5207',
  software:            'acco_org_indian_demo_5208',
  depreciation:        'acco_org_indian_demo_5212',
};

const OBC_ACCOUNT_ID = `acco_${LEGAL_ENTITY_ID}_obc`.replace(/[^a-zA-Z0-9_]/g, '_');

const STABLE_POSTING_IDS = Array.from({ length: 20 }, (_, i) => `post_vs_${String(i + 1).padStart(3, '0')}`);

const CSV_FIXTURE = path.join(
  __dirname,
  '../../../test-data/verification-suite/zoho-trial-balance-fy2024-25.csv'
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSDL(): SystemDataLayer {
  return new SystemDataLayer(prisma, ORG_ID, CREATED_BY);
}

async function deleteFY2526Postings(): Promise<void> {
  await (prisma as any).posting.deleteMany({
    where: { org_id: ORG_ID, id: { in: STABLE_POSTING_IDS } },
  });
}

async function deleteOBCAccount(): Promise<void> {
  try {
    await (prisma as any).account.deleteMany({ where: { id: OBC_ACCOUNT_ID } });
  } catch {}
}

async function cleanUp(sdl: SystemDataLayer): Promise<void> {
  await deleteFY2526Postings();
  await deleteMigrationJournal(sdl, { legal_entity_id: LEGAL_ENTITY_ID, migration_date: MIGRATION_DATE });
  await deleteOBCAccount();
}

// ── Tier 1: Pure logic ────────────────────────────────────────────────────────

describe('Tier 1 — Pure logic (no DB)', () => {
  it('CSV fixture exists', () => {
    expect(fs.existsSync(CSV_FIXTURE)).toBe(true);
  });

  it('CSV has 14 data rows (one per balance-sheet account)', () => {
    const lines = fs.readFileSync(CSV_FIXTURE, 'utf-8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith('Account Code'));
    expect(lines).toHaveLength(14);
  });

  it('opening balance sheet is balanced (Assets = L + E)', () => {
    // DR totals (assets with debit balance + liabilities/equity with credit balance)
    const drTotal = 200_000 + 4_500_000 + 1_000_000 + 3_800_000 + 350_000 + 2_500_000 + 500_000;
    const crTotal = 800_000 + 2_200_000 + 300_000 + 550_000 + 3_000_000 + 2_000_000 + 4_000_000;
    expect(drTotal).toBe(crTotal);
  });

  it('OBC account ID derivation is deterministic', () => {
    const expected = `acco_${LEGAL_ENTITY_ID}_obc`.replace(/[^a-zA-Z0-9_]/g, '_');
    expect(OBC_ACCOUNT_ID).toBe(expected);
  });

  it('stable posting IDs are unique and zero-padded', () => {
    expect(new Set(STABLE_POSTING_IDS).size).toBe(20);
    expect(STABLE_POSTING_IDS[0]).toBe('post_vs_001');
    expect(STABLE_POSTING_IDS[19]).toBe('post_vs_020');
  });
});

// ── Tier 2: DB integration ────────────────────────────────────────────────────

const RUN_DB = process.env.VERIFICATION_SUITE_TEST === '1';
const LEAVE  = process.env.LEAVE_DATA === '1';

(RUN_DB ? describe : describe.skip)('Tier 2 — DB integration', () => {
  let sdl: SystemDataLayer;
  // Captured after migration journal but BEFORE FY2025-26 postings — lets us
  // assert deltas for accounts that may already have demo transactions.
  let baselineFYTb: Awaited<ReturnType<typeof getTrialBalance>> = [];

  beforeAll(async () => {
    sdl = makeSDL();
    // Delete any leftover data from a previous run before starting
    await cleanUp(sdl);
  });

  afterAll(async () => {
    if (!LEAVE) await cleanUp(sdl);
    await prisma.$disconnect();
  });

  // ── Step 1: Import migration journal from Zoho CSV ────────────────────────

  describe('Step 1 — Import FY2024-25 closing balances via migration journal', () => {
    it('imports 14-account CSV, creates 14 double-entry postings, OBC nets to 0', async () => {
      const csvText = fs.readFileSync(CSV_FIXTURE, 'utf-8');
      const result = await importMigrationJournalFromCsv(
        sdl,
        csvText,
        LEGAL_ENTITY_ID,
        MIGRATION_DATE,
      );

      expect(result.parse_errors).toHaveLength(0);
      expect(result.postings_created).toBe(14);
      expect(Math.abs(result.obc_balance)).toBeLessThan(0.01); // balanced to the cent
      expect(result.obc_account_id).toBe(OBC_ACCOUNT_ID);
    });

    it('status endpoint reflects the new migration date', async () => {
      const status = await getMigrationJournalStatus(sdl, { legal_entity_id: LEGAL_ENTITY_ID });
      expect(status.dates).toContain(MIGRATION_DATE);
      expect(status.postings_count).toBeGreaterThanOrEqual(14);
    });
  });

  // ── Step 2: Create FY2025-26 business activity postings ───────────────────
  //
  // All postings use stable IDs (post_vs_001 … post_vs_020) so cleanup is
  // surgical — it never touches the base Indian demo data.
  //
  // Double-entry layout (DR account | CR account | amount):
  //   001-004  Q1-Q4 service revenue invoiced    AR | ServiceRev | 2.5M each
  //   005-006  Customer collections              Checking | AR | 7.5M + 4.5M
  //   007      Goods purchased on credit         Inventory | AP | 4M
  //   008      COGS recognised                   COGS | Inventory | 3M
  //   009-010  Supplier payments (old + new AP)  AP | Checking | 2.2M + 3M
  //   011-015  Operating expenses paid            Salaries/Rent/… | Checking
  //   016      Payroll tax accrual               PayrollTaxExp | PayrollLib | 540k
  //   017      Payroll liabilities settled        PayrollLib | Checking | 840k
  //   018      Taxes payable settled              TaxesPayable | Checking | 550k
  //   019      Loan principal repayment           LoanPayable | Checking | 600k
  //   020      Annual depreciation                DepreciationExp | AccDep | 500k

  describe('Step 2 — Create FY2025-26 business activity postings', () => {
    beforeAll(async () => {
      // Snapshot the TB before inserting our test postings. The DB may already
      // contain demo transactions in the FY2025-26 range (e.g. post_demo_*
      // bank statement samples). Capturing baseline lets Step 4 assert deltas
      // rather than absolutes, making the suite robust to existing demo data.
      baselineFYTb = await getTrialBalance(MIGRATION_DATE, FY_END, ORG_ID, undefined, undefined, [LEGAL_ENTITY_ID]);
    });

    it('inserts 20 postings with stable IDs', async () => {
      const defaults = {
        org_id: ORG_ID,
        legal_entity_id: LEGAL_ENTITY_ID,
        posting_type: 'JOURNAL',
        status: 'ACTIVE',
        created_by: CREATED_BY,
        modified_by: CREATED_BY,
      };

      const d = (iso: string) => new Date(iso);

      await (prisma as any).posting.createMany({
        data: [
          // ── Revenue (invoiced → AR) ─────────────────────────────────────────
          { id: 'post_vs_001', account_id: ACCOUNTS.accountsReceivable, credit_account_id: ACCOUNTS.serviceRevenue, amount: 2_500_000, posting_date: d('2025-04-30'), value_date: d('2025-04-30'), name: 'Service Revenue Q1 FY2025-26', ...defaults },
          { id: 'post_vs_002', account_id: ACCOUNTS.accountsReceivable, credit_account_id: ACCOUNTS.serviceRevenue, amount: 2_500_000, posting_date: d('2025-07-31'), value_date: d('2025-07-31'), name: 'Service Revenue Q2 FY2025-26', ...defaults },
          { id: 'post_vs_003', account_id: ACCOUNTS.accountsReceivable, credit_account_id: ACCOUNTS.serviceRevenue, amount: 2_500_000, posting_date: d('2025-10-31'), value_date: d('2025-10-31'), name: 'Service Revenue Q3 FY2025-26', ...defaults },
          { id: 'post_vs_004', account_id: ACCOUNTS.accountsReceivable, credit_account_id: ACCOUNTS.serviceRevenue, amount: 2_500_000, posting_date: d('2026-01-31'), value_date: d('2026-01-31'), name: 'Service Revenue Q4 FY2025-26', ...defaults },

          // ── Collections (cash received) ─────────────────────────────────────
          { id: 'post_vs_005', account_id: ACCOUNTS.checkingAccount, credit_account_id: ACCOUNTS.accountsReceivable, amount: 7_500_000, posting_date: d('2025-09-30'), value_date: d('2025-09-30'), name: 'Customer Collections H1', ...defaults },
          { id: 'post_vs_006', account_id: ACCOUNTS.checkingAccount, credit_account_id: ACCOUNTS.accountsReceivable, amount: 4_500_000, posting_date: d('2026-02-28'), value_date: d('2026-02-28'), name: 'Customer Collections H2', ...defaults },

          // ── Inventory purchase (on credit) + COGS ──────────────────────────
          { id: 'post_vs_007', account_id: ACCOUNTS.inventory, credit_account_id: ACCOUNTS.accountsPayable, amount: 4_000_000, posting_date: d('2025-06-30'), value_date: d('2025-06-30'), name: 'Goods Purchased on Credit', ...defaults },
          { id: 'post_vs_008', account_id: ACCOUNTS.cogs, credit_account_id: ACCOUNTS.inventory, amount: 3_000_000, posting_date: d('2025-09-30'), value_date: d('2025-09-30'), name: 'Cost of Goods Sold', ...defaults },

          // ── Supplier payments ──────────────────────────────────────────────
          { id: 'post_vs_009', account_id: ACCOUNTS.accountsPayable, credit_account_id: ACCOUNTS.checkingAccount, amount: 2_200_000, posting_date: d('2025-08-31'), value_date: d('2025-08-31'), name: 'Supplier Payment — Opening AP', ...defaults },
          { id: 'post_vs_010', account_id: ACCOUNTS.accountsPayable, credit_account_id: ACCOUNTS.checkingAccount, amount: 3_000_000, posting_date: d('2025-12-31'), value_date: d('2025-12-31'), name: 'Supplier Payment — New AP', ...defaults },

          // ── Operating expenses ─────────────────────────────────────────────
          { id: 'post_vs_011', account_id: ACCOUNTS.salaries, credit_account_id: ACCOUNTS.checkingAccount, amount: 5_400_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Annual Salaries FY2025-26', ...defaults },
          { id: 'post_vs_012', account_id: ACCOUNTS.rent, credit_account_id: ACCOUNTS.checkingAccount, amount: 600_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Annual Rent FY2025-26', ...defaults },
          { id: 'post_vs_013', account_id: ACCOUNTS.software, credit_account_id: ACCOUNTS.checkingAccount, amount: 240_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Software Subscriptions FY2025-26', ...defaults },
          { id: 'post_vs_014', account_id: ACCOUNTS.marketing, credit_account_id: ACCOUNTS.checkingAccount, amount: 300_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Marketing Campaigns FY2025-26', ...defaults },
          { id: 'post_vs_015', account_id: ACCOUNTS.professional, credit_account_id: ACCOUNTS.checkingAccount, amount: 420_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Professional Fees FY2025-26', ...defaults },

          // ── Payroll tax accrual + settlement ──────────────────────────────
          { id: 'post_vs_016', account_id: ACCOUNTS.payrollTaxes, credit_account_id: ACCOUNTS.payrollLiabilities, amount: 540_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Payroll Tax Accrual FY2025-26', ...defaults },
          { id: 'post_vs_017', account_id: ACCOUNTS.payrollLiabilities, credit_account_id: ACCOUNTS.checkingAccount, amount: 840_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Payroll Liabilities Settlement', ...defaults },

          // ── Tax + loan settlements ─────────────────────────────────────────
          { id: 'post_vs_018', account_id: ACCOUNTS.taxesPayable, credit_account_id: ACCOUNTS.checkingAccount, amount: 550_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Taxes Payable Settlement', ...defaults },
          { id: 'post_vs_019', account_id: ACCOUNTS.loanPayable, credit_account_id: ACCOUNTS.checkingAccount, amount: 600_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Loan Principal Repayment', ...defaults },

          // ── Depreciation ──────────────────────────────────────────────────
          { id: 'post_vs_020', account_id: ACCOUNTS.depreciation, credit_account_id: ACCOUNTS.accumulatedDep, amount: 500_000, posting_date: d('2026-03-31'), value_date: d('2026-03-31'), name: 'Annual Depreciation FY2025-26', ...defaults },
        ],
      });

      const count = await (prisma as any).posting.count({
        where: { org_id: ORG_ID, id: { in: STABLE_POSTING_IDS } },
      });
      expect(count).toBe(20);
    });
  });

  // ── Step 3: Migration-only trial balance snapshot ─────────────────────────

  describe('Step 3 — Trial balance: migration snapshot (2025-03-31 to 2025-03-31)', () => {
    let tb: Awaited<ReturnType<typeof getTrialBalance>>;

    beforeAll(async () => {
      tb = await getTrialBalance(MIGRATION_DATE, MIGRATION_DATE, ORG_ID, undefined, undefined, [LEGAL_ENTITY_ID]);
    });

    const find = () => (id: string) => tb.find((r) => r.account_id === id);

    it('Checking Account balance = 4,500,000 (opening from Zoho)', () => {
      const row = find()(ACCOUNTS.checkingAccount);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(4_500_000, 0);
    });

    it('Accounts Receivable balance = 3,800,000', () => {
      const row = find()(ACCOUNTS.accountsReceivable);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(3_800_000, 0);
    });

    it('Accumulated Depreciation balance = -800,000 (contra-asset, credit side)', () => {
      const row = find()(ACCOUNTS.accumulatedDep);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(-800_000, 0);
    });

    it('Loan Payable balance = 3,000,000', () => {
      const row = find()(ACCOUNTS.loanPayable);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(3_000_000, 0);
    });

    it('Opening Balance Clearing (OBC) nets to zero (perfectly balanced import)', () => {
      const row = tb.find((r) => r.account_id === OBC_ACCOUNT_ID);
      expect(row).toBeDefined();
      expect(Math.abs(Number(row!.balance))).toBeLessThan(1);
    });
  });

  // ── Step 4: Full FY2025-26 trial balance ─────────────────────────────────

  describe('Step 4 — Trial balance: full FY2025-26 (2025-03-31 to 2026-03-31)', () => {
    let tb: Awaited<ReturnType<typeof getTrialBalance>>;

    beforeAll(async () => {
      tb = await getTrialBalance(MIGRATION_DATE, FY_END, ORG_ID, undefined, undefined, [LEGAL_ENTITY_ID]);
    });

    // Delta helper: current balance minus the baseline captured before our
    // postings were inserted. Isolates our effect from existing demo data.
    const delta = (id: string) => {
      const current  = Number(tb.find((r) => r.account_id === id)?.balance ?? 0);
      const baseline = Number(baselineFYTb.find((r) => r.account_id === id)?.balance ?? 0);
      return current - baseline;
    };

    const find = (id: string) => tb.find((r) => r.account_id === id);

    // ── Balance-sheet accounts ─────────────────────────────────────────────────
    //
    // Checking (1102) uses a delta assertion because the demo DB contains
    // post_demo_* bank statement samples in this date range that also debit/
    // credit checking. All other balance-sheet accounts have zero demo activity.
    //
    // Net effect of post_vs_001…020 on Checking (baseline already includes
    // the 4,500,000 migration opening):
    //   +7,500,000 H1 collections  +4,500,000 H2 collections
    //   −2,200,000 old AP  −3,000,000 new AP  −5,400,000 salaries
    //   −600,000 rent  −240,000 software  −300,000 marketing  −420,000 fees
    //   −840,000 payroll lib  −550,000 taxes  −600,000 loan  = −2,150,000 net

    it('Checking Account: business activity reduces cash by 2,150,000 (outflows > inflows)', () => {
      expect(delta(ACCOUNTS.checkingAccount)).toBeCloseTo(-2_150_000, 0);
    });

    // AR: opening 3,800,000 + revenue 10,000,000 − collections 12,000,000 = 1,800,000
    it('Accounts Receivable ending balance = 1,800,000', () => {
      const row = find(ACCOUNTS.accountsReceivable);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(1_800_000, 0);
    });

    // AP: opening 2,200,000 + purchase 4,000,000 − payments 5,200,000 = 1,000,000
    it('Accounts Payable ending balance = 1,000,000', () => {
      const row = find(ACCOUNTS.accountsPayable);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(1_000_000, 0);
    });

    // Loan: opening 3,000,000 − repayment 600,000 = 2,400,000
    it('Loan Payable ending balance = 2,400,000', () => {
      const row = find(ACCOUNTS.loanPayable);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(2_400_000, 0);
    });

    // Payroll Lib: opening 300,000 + accrual 540,000 − settlement 840,000 = 0
    it('Payroll Liabilities cleared to zero (opening + accrual − settlement)', () => {
      const row = find(ACCOUNTS.payrollLiabilities);
      expect(row).toBeDefined();
      expect(Math.abs(Number(row!.balance))).toBeLessThan(1);
    });

    // Taxes Payable: opening 550,000 − settlement 550,000 = 0
    it('Taxes Payable cleared to zero (opening − settlement)', () => {
      const row = find(ACCOUNTS.taxesPayable);
      expect(row).toBeDefined();
      expect(Math.abs(Number(row!.balance))).toBeLessThan(1);
    });

    // Inventory: 0 opening + purchase 4,000,000 − COGS 3,000,000 = 1,000,000
    it('Inventory ending balance = 1,000,000 (purchase minus COGS)', () => {
      const row = find(ACCOUNTS.inventory);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(1_000_000, 0);
    });

    // Acc Dep: opening −800,000 − FY2025-26 charge 500,000 = −1,300,000
    it('Accumulated Depreciation ending balance = −1,300,000 (opening + FY2025-26 charge)', () => {
      const row = find(ACCOUNTS.accumulatedDep);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(-1_300_000, 0);
    });

    // ── Income/expense (absolute — no demo data for these in FY2025-26) ──────

    it('Service Revenue = 10,000,000 (4 quarters × 2.5M)', () => {
      const row = find(ACCOUNTS.serviceRevenue);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(10_000_000, 0);
    });

    it('Salaries expense = 5,400,000', () => {
      const row = find(ACCOUNTS.salaries);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(5_400_000, 0);
    });

    it('COGS = 3,000,000', () => {
      const row = find(ACCOUNTS.cogs);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(3_000_000, 0);
    });

    it('Depreciation expense = 500,000', () => {
      const row = find(ACCOUNTS.depreciation);
      expect(row).toBeDefined();
      expect(Number(row!.balance)).toBeCloseTo(500_000, 0);
    });

    // OBC still nets to zero (FY2025-26 postings don't touch it)
    it('Opening Balance Clearing (OBC) still nets to zero', () => {
      const row = tb.find((r) => r.account_id === OBC_ACCOUNT_ID);
      expect(row).toBeDefined();
      expect(Math.abs(Number(row!.balance))).toBeLessThan(1);
    });
  });

  // ── Step 5: opening_balance column visible in APR_MAR FY 2025-26 ──────────
  //
  // This validates the perfin.ts fix: posting_type='OPENING_BALANCE' postings
  // dated 2025-03-31 must appear in the opening_balance column when the report
  // date range is April 2025 – March 2026 (prevYearEnd = 2025-03-31 ✓).

  describe('Step 5 — opening_balance column shows Zoho values for APR_MAR FY 2025-26', () => {
    const APR_MAR_START = '2025-04-01'; // standard FY start — migration (2025-03-31) is in prev year
    let tbFY: Awaited<ReturnType<typeof getTrialBalance>>;

    beforeAll(async () => {
      tbFY = await getTrialBalance(APR_MAR_START, FY_END, ORG_ID, undefined, undefined, [LEGAL_ENTITY_ID]);
    });

    const findFY = (id: string) => tbFY.find((r) => r.account_id === id);

    it('Checking Account opening_balance = 4,500,000', () => {
      const row = findFY(ACCOUNTS.checkingAccount);
      expect(row).toBeDefined();
      expect(Number(row!.opening_balance)).toBeCloseTo(4_500_000, 0);
    });

    it('Accounts Receivable opening_balance = 3,800,000', () => {
      const row = findFY(ACCOUNTS.accountsReceivable);
      expect(row).toBeDefined();
      expect(Number(row!.opening_balance)).toBeCloseTo(3_800_000, 0);
    });

    it('Loan Payable opening_balance = 3,000,000', () => {
      const row = findFY(ACCOUNTS.loanPayable);
      expect(row).toBeDefined();
      expect(Number(row!.opening_balance)).toBeCloseTo(3_000_000, 0);
    });

    it('Owner Capital opening_balance = 2,000,000', () => {
      const row = findFY(ACCOUNTS.ownerCapital);
      expect(row).toBeDefined();
      expect(Number(row!.opening_balance)).toBeCloseTo(2_000_000, 0);
    });

    it('Retained Earnings opening_balance = 4,000,000', () => {
      const row = findFY(ACCOUNTS.retainedEarnings);
      expect(row).toBeDefined();
      expect(Number(row!.opening_balance)).toBeCloseTo(4_000_000, 0);
    });

    it('Accumulated Depreciation opening_balance = -800,000 (contra-asset)', () => {
      const row = findFY(ACCOUNTS.accumulatedDep);
      expect(row).toBeDefined();
      expect(Number(row!.opening_balance)).toBeCloseTo(-800_000, 0);
    });

    it('OBC opening_balance nets to zero (balanced import)', () => {
      const row = tbFY.find((r) => r.account_id === OBC_ACCOUNT_ID);
      expect(row).toBeDefined();
      expect(Math.abs(Number(row!.opening_balance))).toBeLessThan(1);
    });

    it('Service Revenue has zero opening_balance (P&L resets each year)', () => {
      const row = findFY(ACCOUNTS.serviceRevenue);
      if (row) expect(Math.abs(Number(row.opening_balance))).toBeLessThan(1);
    });

    // ── Month-level checks (the critical regression) ──────────────────────────
    // Jan–Mar 2026 months have startDate.year = 2026. The old year-window logic
    // set prevYearStart = 2025-04-01, which excluded the migration date 2025-03-31.
    // The fix uses posting_date < startDate, so all months work correctly.

    it('March 2026 month view: Checking opening_balance still = 4,500,000', async () => {
      const tbMar = await getTrialBalance('2026-03-01', '2026-03-31', ORG_ID, undefined, undefined, [LEGAL_ENTITY_ID]);
      const row = tbMar.find((r) => r.account_id === ACCOUNTS.checkingAccount);
      expect(row).toBeDefined();
      expect(Number(row!.opening_balance)).toBeCloseTo(4_500_000, 0);
    });

    it('January 2026 month view: Loan Payable opening_balance still = 3,000,000', async () => {
      const tbJan = await getTrialBalance('2026-01-01', '2026-01-31', ORG_ID, undefined, undefined, [LEGAL_ENTITY_ID]);
      const row = tbJan.find((r) => r.account_id === ACCOUNTS.loanPayable);
      expect(row).toBeDefined();
      expect(Number(row!.opening_balance)).toBeCloseTo(3_000_000, 0);
    });
  });
});
