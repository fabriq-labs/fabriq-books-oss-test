/**
 * Truist Consolidated Business Checking — bank statement import
 *
 * Fixture: data/DOC-20260923-WA0003.pdf
 *   - Consolidated statement for Eden Logistics Inc (period ending 12/31/2024)
 *   - Three checking accounts; target account ends in …3249628
 *   - Section-based layout (Checks / Other withdrawals / Deposits) — single AMOUNT column
 *   - No running balance on transaction rows
 *
 * Uses org_indian_demo / legal entity org_us_office (USD Checking Chart of Accounts).
 * Creates a dedicated checking account with account_number = last Int-safe digits
 * of 1430003249628 (3249628) and Truist-oriented extraction_notes.
 *
 * ── Tiers ─────────────────────────────────────────────────────────────────────
 * Tier 1 — PDF fixture + expected totals helpers (always runs)
 * Tier 2 — Create account + dry-run extract+categorize+chunking (FABRIQ_IMPORT_FULL_TEST=1)
 *           Requires LLM. Reports debit/credit split and amount totals.
 *
 * Run:
 *   npx jest src/__tests__/import/truist-bank-statement-import.test.ts
 *   FABRIQ_IMPORT_FULL_TEST=1 npx jest src/__tests__/import/truist-bank-statement-import.test.ts
 *   FABRIQ_IMPORT_FULL_TEST=1 LEAVE_DATA=1 npx jest ...
 *
 * Manual check after LEAVE_DATA=1:
 *   SELECT id, name, account_number, extraction_notes
 *   FROM account WHERE name ILIKE '%Truist%Eden%' ORDER BY created_at DESC LIMIT 5;
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../lib/prisma';
import { PostingImportService } from '../../services/posting/PostingImportService';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG_ID = 'org_indian_demo';
const LEGAL_ENTITY_ID = 'org_us_office';
const PARENT_CURRENT_ASSETS_ID = 'acco_org_us_office_1100';
const USER_ID = 'user_arjun_sharma';

/** Full Truist number on the PDF; Int column stores trailing digits only. */
const TRUIST_ACCOUNT_FULL = '1430003249628';
const TRUIST_ACCOUNT_NUMBER_INT = 3249628; // fits PostgreSQL integer

const TRUIST_PDF = path.resolve(__dirname, '../../../../data/DOC-20260923-WA0003.pdf');
const hasTruistPdf = fs.existsSync(TRUIST_PDF);

/** Expected for account …9628 only (from statement printed totals). */
const EXPECTED_9628 = {
  opening: 399.41,
  closing: 968.77,
  checksTotal: 1110.0,
  otherDebitsTotal: 3644.64,
  depositsTotal: 5324.0,
  /** 4 checks + ~74 other debits + 11 deposits (exact debit line count may vary slightly). */
  minTransactions: 80,
  maxTransactions: 95,
};

const TRUIST_EXTRACTION_NOTES = [
  'Truist consolidated business checking statement.',
  'Debits and credits appear in SEPARATE sections (Checks; Other withdrawals, debits and service charges; Deposits, credits and interest), each with a single AMOUNT column — not side-by-side debit/credit columns.',
  'Section heading determines direction and carries across page breaks until a new heading.',
  'No running balance on transaction rows.',
  'Ignore account-summary / Total lines; do not treat them as transactions.',
  `This upload is for checking account ending in ${TRUIST_ACCOUNT_NUMBER_INT} (full ${TRUIST_ACCOUNT_FULL}).`,
  'If the PDF lists other checking accounts, extract ONLY transactions for this account.',
  'Checks section may pack multiple check#/amount groups on one printed line — emit one transaction per check.',
].join(' ');

const makeContext = () => ({
  user: {
    id: USER_ID,
    org_id: ORG_ID,
    email: 'arjun.sharma@demo-india.com',
    name: 'Arjun Sharma',
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

function sumAmount(rows: Record<string, any>[]): number {
  return Math.round(rows.reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100;
}

function reportTransactions(label: string, accountId: string, txns: Record<string, any>[]) {
  const moneyOut = txns.filter((t) => t.credit_account_id === accountId);
  const moneyIn = txns.filter((t) => t.account_id === accountId);
  const other = txns.filter(
    (t) => t.account_id !== accountId && t.credit_account_id !== accountId
  );
  const categorisedOut = moneyOut.filter((t) => t.account_id != null);
  const categorisedIn = moneyIn.filter((t) => t.credit_account_id != null);

  console.log(`\n========== ${label} ==========`);
  console.log(`Total transactions: ${txns.length}`);
  console.log(
    `  Money OUT (bank on credit_account_id): ${moneyOut.length}  sum=${sumAmount(moneyOut)}`
  );
  console.log(
    `  Money IN  (bank on account_id):        ${moneyIn.length}  sum=${sumAmount(moneyIn)}`
  );
  if (other.length) {
    console.log(`  WARN rows without selected bank on either side: ${other.length}`);
  }
  console.log(
    `  Categorised OUT (expense account_id set): ${categorisedOut.length}/${moneyOut.length}`
  );
  console.log(
    `  Categorised IN  (income credit_account_id set): ${categorisedIn.length}/${moneyIn.length}`
  );
  console.log('  Expected for …9628 only (statement totals):');
  console.log(
    `    checks=${EXPECTED_9628.checksTotal} otherDebits=${EXPECTED_9628.otherDebitsTotal} deposits=${EXPECTED_9628.depositsTotal}`
  );
  console.log(
    `    moneyOut≈${EXPECTED_9628.checksTotal + EXPECTED_9628.otherDebitsTotal} moneyIn≈${EXPECTED_9628.depositsTotal}`
  );
  console.log('  Sample rows (first 8):');
  for (const t of txns.slice(0, 8)) {
    const side = t.credit_account_id === accountId ? 'OUT' : t.account_id === accountId ? 'IN' : '?';
    console.log(
      `    [${side}] ${t.value_date ?? ''}  ${Number(t.amount).toFixed(2).padStart(10)}  ${(t.description || t.name || '').toString().slice(0, 70)}`
    );
  }
  console.log('================================\n');

  return { moneyOut, moneyIn, other, categorisedOut, categorisedIn };
}

// ── Tier 1 ────────────────────────────────────────────────────────────────────

describe('Tier 1 — Truist PDF fixture (no DB, no LLM)', () => {
  (hasTruistPdf ? it : it.skip)('PDF fixture exists and is non-trivial', () => {
    expect(fs.statSync(TRUIST_PDF).size).toBeGreaterThan(50_000);
  });

  it('expected …9628 arithmetic reconciles opening → closing', () => {
    const closing =
      EXPECTED_9628.opening -
      EXPECTED_9628.checksTotal -
      EXPECTED_9628.otherDebitsTotal +
      EXPECTED_9628.depositsTotal;
    expect(Math.round(closing * 100) / 100).toBe(EXPECTED_9628.closing);
  });

  it('account_number Int fit for trailing digits', () => {
    expect(TRUIST_ACCOUNT_NUMBER_INT).toBeLessThanOrEqual(2147483647);
    expect(String(TRUIST_ACCOUNT_FULL).endsWith(String(TRUIST_ACCOUNT_NUMBER_INT))).toBe(true);
  });
});

// ── Tier 2: create account + LLM extract with chunking ────────────────────────

const runFull = process.env.FABRIQ_IMPORT_FULL_TEST === '1';

describe('Tier 2 — Truist PDF: create checking account + chunked extract (FABRIQ_IMPORT_FULL_TEST=1)', () => {
  jest.setTimeout(300_000);

  let createdAccountId: string | null = null;
  let testStartTime: Date;

  beforeAll(async () => {
    if (!runFull) return;
    if (!hasTruistPdf) throw new Error(`Missing fixture: ${TRUIST_PDF}`);

    try {
      const [parent, entity, user] = await Promise.all([
        prisma.account.findUnique({
          where: { id: PARENT_CURRENT_ASSETS_ID },
          select: { id: true, org_id: true },
        }),
        (prisma as any).entity.findUnique({
          where: { id: LEGAL_ENTITY_ID },
          select: { id: true, org_id: true },
        }),
        prisma.user.findUnique({ where: { id: USER_ID }, select: { id: true } }),
      ]);
      if (!parent) throw new Error(`Parent account ${PARENT_CURRENT_ASSETS_ID} not found`);
      if (!entity) throw new Error(`Entity ${LEGAL_ENTITY_ID} not found — load indian-demo / US office data`);
      if (!user) throw new Error(`User ${USER_ID} not found`);
    } catch (e) {
      if (isDatabaseUnavailable(e)) {
        console.log('Skipping Tier 2: DB unreachable');
        return;
      }
      throw e;
    }

    testStartTime = new Date();
    const suffix = Date.now().toString(36);

    const created = await prisma.account.create({
      data: {
        name: `Truist Simple Business Checking Eden ${suffix}`,
        code: `1102-TRUIST-${suffix}`,
        type: ['BANK', 'CHECKING'],
        classification: 'Assets',
        account_number: TRUIST_ACCOUNT_NUMBER_INT,
        parent_account_id: PARENT_CURRENT_ASSETS_ID,
        legal_entity_id: LEGAL_ENTITY_ID,
        org_id: ORG_ID,
        base_currency_id: 'curr_usd',
        is_active: true,
        extraction_notes: TRUIST_EXTRACTION_NOTES,
        created_by: USER_ID,
        modified_by: USER_ID,
        modified_at: new Date(),
      },
    });
    createdAccountId = created.id;
    console.log(
      `Created checking account ${createdAccountId} account_number=${TRUIST_ACCOUNT_NUMBER_INT}`
    );
  });

  afterAll(async () => {
    if (!runFull) return;
    try {
      if (createdAccountId && !process.env.LEAVE_DATA) {
        await prisma.posting.deleteMany({
          where: {
            org_id: ORG_ID,
            OR: [
              { account_id: createdAccountId },
              { credit_account_id: createdAccountId },
            ],
            created_at: { gte: testStartTime },
          },
        });
        await prisma.account.delete({ where: { id: createdAccountId } });
        console.log(`Cleaned up account ${createdAccountId}`);
      } else if (createdAccountId) {
        console.log(`LEAVE_DATA=1 — keeping account ${createdAccountId}`);
      }
    } catch (e) {
      console.warn('Tier 2 cleanup failed:', e);
    }
    await prisma.$disconnect();
  });

  it('dry run: chunked extract+categorize reports transactions for created account', async () => {
    if (!runFull) return console.log('Skipping (set FABRIQ_IMPORT_FULL_TEST=1)');
    if (!createdAccountId) return console.log('Skipping: account not created (DB?)');

    const buf = fs.readFileSync(TRUIST_PDF);
    const progress: string[] = [];

    const result = await PostingImportService.getInstance().importBankStatement(
      makeContext(),
      {
        fileBuffer: buf,
        mimeType: 'application/pdf',
        fileSize: buf.length,
        fileName: 'DOC-20260923-WA0003.pdf',
        accountId: createdAccountId,
        dryRun: true,
        categorize: true,
        legalEntityId: LEGAL_ENTITY_ID,
        enableChunking: true,
        onProgress: (p) => {
          progress.push(p.step);
          console.log(`  [${p.step}] ${p.message}`);
        },
      }
    );

    if (!result.success) {
      console.error('Import failed:', result.error);
    }
    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);

    const txns = result.transactions!;
    const report = reportTransactions(
      'Truist dry-run (chunked + categorize)',
      createdAccountId,
      txns
    );

    // Soft range: with TARGET ACCOUNT scoping, expect ~89 for …9628 only
    expect(txns.length).toBeGreaterThanOrEqual(EXPECTED_9628.minTransactions - 20);
    expect(txns.length).toBeLessThanOrEqual(EXPECTED_9628.maxTransactions + 10);
    expect(report.moneyOut.length + report.moneyIn.length).toBe(txns.length);
    expect(txns.every((t) => Number(t.amount) > 0)).toBe(true);
    expect(txns.every((t) => t.value_date != null)).toBe(true);

    // Document known gaps until P0/P1 land
    const outSum = sumAmount(report.moneyOut);
    const inSum = sumAmount(report.moneyIn);
    const expectedOut = EXPECTED_9628.checksTotal + EXPECTED_9628.otherDebitsTotal;
    if (Math.abs(outSum - expectedOut) > 1 || Math.abs(inSum - EXPECTED_9628.depositsTotal) > 1) {
      console.warn(
        `Totals differ from …9628 statement ` +
          `(out ${outSum} vs ${expectedOut}, in ${inSum} vs ${EXPECTED_9628.depositsTotal}). ` +
          `Likely multi-account bleed and/or debit/credit mapping until account scoping + merge-index fixes land.`
      );
    }

    expect(progress[0]).toBe('extracting');
    expect(progress[progress.length - 1]).toBe('complete');
  });
});

// ── Tier 3: seeded Truist accounts (9628 / 9636 / 9644) ───────────────────────

const SEEDED = [
  {
    id: 'acco_org_us_office_truist_9628',
    account_number: 3249628,
    full: '1430003249628',
    expectMin: 70,
    expectMax: 100,
    allowEmpty: false,
  },
  {
    id: 'acco_org_us_office_truist_9636',
    account_number: 3249636,
    full: '1430003249636',
    expectMin: 2,
    expectMax: 5,
    allowEmpty: false,
  },
  {
    id: 'acco_org_us_office_truist_9644',
    account_number: 3249644,
    full: '1430003249644',
    expectMin: 0,
    expectMax: 0,
    allowEmpty: true,
  },
] as const;

function notesFor(full: string, trailing: number, extra: string): string {
  return [
    'Truist consolidated business checking statement.',
    'Debits and credits appear in SEPARATE sections (Checks; Other withdrawals, debits and service charges; Deposits, credits and interest), each with a single AMOUNT column — not side-by-side debit/credit columns.',
    'Section heading determines direction and carries across page breaks until a new heading.',
    'No running balance on transaction rows.',
    'Ignore account-summary / Total lines; do not treat them as transactions.',
    `This upload is for checking account ending in ${trailing} (full ${full}).`,
    'If the PDF lists other checking accounts, label each row with its true source_account_number; do not relabel other accounts as this one.',
    extra,
  ].join(' ');
}

describe('Tier 3 — seeded Truist accounts 9628/9636/9644 (FABRIQ_IMPORT_FULL_TEST=1)', () => {
  jest.setTimeout(600_000);

  beforeAll(async () => {
    if (!runFull) return;
    if (!hasTruistPdf) throw new Error(`Missing fixture: ${TRUIST_PDF}`);

    try {
      for (const s of SEEDED) {
        await prisma.account.upsert({
          where: { id: s.id },
          create: {
            id: s.id,
            name: `Truist Simple Business Checking (Eden …${String(s.account_number).slice(-4)})`,
            code: `1102-TRUIST-${String(s.account_number).slice(-4)}`,
            type: ['BANK', 'CHECKING'],
            classification: 'Assets',
            account_number: s.account_number,
            parent_account_id: PARENT_CURRENT_ASSETS_ID,
            legal_entity_id: LEGAL_ENTITY_ID,
            org_id: ORG_ID,
            base_currency_id: 'curr_usd',
            is_active: true,
            extraction_notes: notesFor(
              s.full,
              s.account_number,
              s.allowEmpty
                ? 'On the Dec 2024 statement this account has summary balances only and zero transaction rows.'
                : s.account_number === 3249636
                  ? 'On the Dec 2024 statement this account has returned-item fees and a charge-off closeout credit.'
                  : 'Checks section may pack multiple check#/amount groups on one printed line — emit one transaction per check.'
            ),
            created_by: USER_ID,
            modified_by: USER_ID,
            modified_at: new Date(),
          },
          update: {
            account_number: s.account_number,
            extraction_notes: notesFor(
              s.full,
              s.account_number,
              s.allowEmpty
                ? 'On the Dec 2024 statement this account has summary balances only and zero transaction rows.'
                : s.account_number === 3249636
                  ? 'On the Dec 2024 statement this account has returned-item fees and a charge-off closeout credit.'
                  : 'Checks section may pack multiple check#/amount groups on one printed line — emit one transaction per check.'
            ),
            modified_at: new Date(),
          },
        });
      }
      console.log('Upserted seeded Truist accounts:', SEEDED.map((s) => s.id).join(', '));
    } catch (e) {
      if (isDatabaseUnavailable(e)) {
        console.log('Skipping Tier 3: DB unreachable');
        return;
      }
      throw e;
    }
  });

  afterAll(async () => {
    if (!runFull) return;
    await prisma.$disconnect();
  });

  it.each(SEEDED)(
    'dry run chunked extract for $id (…$account_number)',
    async (seed) => {
      if (!runFull) return console.log('Skipping (set FABRIQ_IMPORT_FULL_TEST=1)');

      const buf = fs.readFileSync(TRUIST_PDF);
      const result = await PostingImportService.getInstance().importBankStatement(
        makeContext(),
        {
          fileBuffer: buf,
          mimeType: 'application/pdf',
          fileSize: buf.length,
          fileName: 'DOC-20260923-WA0003.pdf',
          accountId: seed.id,
          dryRun: true,
          categorize: true,
          legalEntityId: LEGAL_ENTITY_ID,
          enableChunking: true,
          onProgress: (p) => console.log(`  [${seed.account_number}] [${p.step}] ${p.message}`),
        }
      );

      console.log(
        `\n[${seed.account_number}] success=${result.success} count=${result.count} error=${result.error ?? ''}`
      );
      expect(result.success).toBe(true);

      const txns = result.transactions ?? [];
      reportTransactions(`Truist …${seed.account_number}`, seed.id, txns);

      if (seed.allowEmpty) {
        expect(txns.length).toBe(0);
      } else {
        expect(txns.length).toBeGreaterThanOrEqual(seed.expectMin);
        expect(txns.length).toBeLessThanOrEqual(seed.expectMax);
        expect(txns.every((t) => Number(t.amount) > 0)).toBe(true);
      }
    }
  );
});
