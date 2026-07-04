/**
 * ICICI Bank Statement Import Tests
 *
 * Tests PDF import for the real ICICI statement at:
 *   data/bank-statements/icici/OpTransactionHistory21-04-2026.pdf
 *
 * Uses the Indian demo org (org_indian_demo) and its Savings Account.
 *
 * ── Tiers ─────────────────────────────────────────────────────────────────────
 * Tier 1 — Pure validation (always runs, no DB, no LLM)
 * Tier 2 — Real PDF + real DB, no LLM  (FABRIQ_IMPORT_TEST=1)
 *           Covers categorize=false (extraction only)
 * Tier 3 — Real PDF + real DB + real LLM  (FABRIQ_IMPORT_FULL_TEST=1)
 *           Covers categorize=true, including extraction_notes injection
 *
 * Run commands:
 *   npx jest src/__tests__/import/icici-bank-statement-import.test.ts
 *   FABRIQ_IMPORT_TEST=1 npx jest src/__tests__/import/icici-bank-statement-import.test.ts
 *   FABRIQ_IMPORT_TEST=1 FABRIQ_IMPORT_FULL_TEST=1 npx jest ...
 *   FABRIQ_IMPORT_TEST=1 LEAVE_DATA=1 npx jest ...
 *
 * Manual DB check after LEAVE_DATA=1:
 *   SELECT id, description, value_date, amount, account_id, credit_account_id
 *   FROM posting
 *   WHERE org_id = 'org_indian_demo'
 *     AND (account_id = 'acco_org_indian_demo_1103'
 *          OR credit_account_id = 'acco_org_indian_demo_1103')
 *   ORDER BY value_date DESC LIMIT 30;
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../lib/prisma';
import { PostingImportService } from '../../services/posting/PostingImportService';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INDIAN_ORG_ID = 'org_indian_demo';
const SAVINGS_ACCOUNT_ID = 'acco_org_indian_demo_1103'; // Savings Account (BANK, SAVINGS)
const LEGAL_ENTITY_ID = 'org_indian_demo';              // Demo Tech Solutions India Pvt Ltd

const ICICI_PDF = path.resolve(
  __dirname, '../../../../data/bank-statements/icici/OpTransactionHistory21-04-2026.pdf'
);
const hasIciciPdfFixture = fs.existsSync(ICICI_PDF);

const makeContext = () => ({
  user: {
    id: 'user_arjun_sharma',
    org_id: INDIAN_ORG_ID,
    email: 'arjun.sharma@demotechsolutions.in',
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

async function countInsertedSince(since: Date) {
  return prisma.posting.count({
    where: {
      org_id: INDIAN_ORG_ID,
      OR: [
        { account_id: SAVINGS_ACCOUNT_ID },
        { credit_account_id: SAVINGS_ACCOUNT_ID },
      ],
      created_at: { gte: since },
    },
  });
}

async function deleteInsertedSince(since: Date) {
  return prisma.posting.deleteMany({
    where: {
      org_id: INDIAN_ORG_ID,
      OR: [
        { account_id: SAVINGS_ACCOUNT_ID },
        { credit_account_id: SAVINGS_ACCOUNT_ID },
      ],
      created_at: { gte: since },
    },
  });
}

// ── Tier 1: Pure validation (always runs) ─────────────────────────────────────

describe('Tier 1 — ICICI PDF fixture validation (no DB, no LLM)', () => {
  (hasIciciPdfFixture ? it : it.skip)(
    'ICICI PDF fixture exists and is non-trivial',
    () => {
      expect(fs.statSync(ICICI_PDF).size).toBeGreaterThan(10_000);
    }
  );

  it('PDF import throws when categorize=true but legalEntityId is missing', async () => {
    await expect(
      PostingImportService.getInstance().importBankStatement(makeContext(), {
        fileBuffer: Buffer.from('fake'),
        mimeType: 'application/pdf',
        fileSize: 4,
        fileName: 'test.pdf',
        accountId: SAVINGS_ACCOUNT_ID,
        categorize: true,
        // legalEntityId intentionally omitted
      })
    ).rejects.toThrow('legalEntityId is required');
  });
});

// ── Tier 2: Real ICICI PDF, no LLM (FABRIQ_IMPORT_TEST=1) ────────────────────

const runTier2 = process.env.FABRIQ_IMPORT_TEST === '1';

describe('Tier 2 — ICICI PDF extraction without categorisation (FABRIQ_IMPORT_TEST=1)', () => {
  jest.setTimeout(120_000);
  let testStartTime: Date;

  beforeAll(async () => {
    if (!runTier2) return;
    try {
      const acct = await prisma.account.findUnique({
        where: { id: SAVINGS_ACCOUNT_ID },
        select: { id: true },
      });
      if (!acct) throw new Error(`Account ${SAVINGS_ACCOUNT_ID} not found — load indian-demo data`);
    } catch (e) {
      if (isDatabaseUnavailable(e)) {
        console.log('Skipping Tier 2: DB unreachable');
        return;
      }
      throw e;
    }
    testStartTime = new Date();
  });

  afterAll(async () => {
    if (!runTier2) return;
    if (!process.env.LEAVE_DATA) {
      await deleteInsertedSince(testStartTime!).catch((e) =>
        console.warn('Tier 2 cleanup failed:', e)
      );
      console.log('Tier 2 cleanup done.');
    }
    await prisma.$disconnect();
  });

  it('dry run (categorize=false): extracts transactions without inserting', async () => {
    if (!runTier2) return console.log('Skipping (set FABRIQ_IMPORT_TEST=1)');

    const buf = fs.readFileSync(ICICI_PDF);
    const beforeCount = await prisma.posting.count({
      where: {
        org_id: INDIAN_ORG_ID,
        OR: [
          { account_id: SAVINGS_ACCOUNT_ID },
          { credit_account_id: SAVINGS_ACCOUNT_ID },
        ],
      },
    });

    const result = await PostingImportService.getInstance().importBankStatement(
      makeContext(),
      {
        fileBuffer: buf,
        mimeType: 'application/pdf',
        fileSize: buf.length,
        fileName: 'OpTransactionHistory21-04-2026.pdf',
        accountId: SAVINGS_ACCOUNT_ID,
        dryRun: true,
        categorize: false,
      }
    );

    console.log(`Tier 2 dry run: ${result.count} transactions extracted`);
    if (!result.success) console.error('Error:', result.error);

    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);

    // Nothing inserted
    const afterCount = await prisma.posting.count({
      where: {
        org_id: INDIAN_ORG_ID,
        OR: [
          { account_id: SAVINGS_ACCOUNT_ID },
          { credit_account_id: SAVINGS_ACCOUNT_ID },
        ],
      },
    });
    expect(afterCount).toBe(beforeCount);

    // Check double-entry mapping on extracted rows
    const txns = result.transactions!;
    const debitRows = txns.filter((t) => t.credit_account_id === SAVINGS_ACCOUNT_ID);
    const creditRows = txns.filter((t) => t.account_id === SAVINGS_ACCOUNT_ID);
    console.log(`  Debit rows (money out): ${debitRows.length}`);
    console.log(`  Credit rows (money in): ${creditRows.length}`);
    expect(debitRows.length + creditRows.length).toBe(txns.length);

    // All amounts should be positive numbers
    expect(txns.every((t) => Number(t.amount) > 0)).toBe(true);
    // All rows should have a value_date
    expect(txns.every((t) => t.value_date != null)).toBe(true);
  });

  it('live import (categorize=false): inserts rows with correct bank-account side', async () => {
    if (!runTier2) return console.log('Skipping (set FABRIQ_IMPORT_TEST=1)');

    const buf = fs.readFileSync(ICICI_PDF);
    const progressEvents: string[] = [];

    const result = await PostingImportService.getInstance().importBankStatement(
      makeContext(),
      {
        fileBuffer: buf,
        mimeType: 'application/pdf',
        fileSize: buf.length,
        fileName: 'OpTransactionHistory21-04-2026.pdf',
        accountId: SAVINGS_ACCOUNT_ID,
        categorize: false,
        onProgress: (p) => {
          progressEvents.push(p.step);
          console.log(`  [${p.step}] ${p.message}`);
        },
      }
    );

    console.log(`Tier 2 live import: ${result.count} rows inserted`);
    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);

    expect(progressEvents[0]).toBe('extracting');
    expect(progressEvents[progressEvents.length - 1]).toBe('complete');

    const inserted = await prisma.posting.findMany({
      where: {
        org_id: INDIAN_ORG_ID,
        OR: [
          { account_id: SAVINGS_ACCOUNT_ID },
          { credit_account_id: SAVINGS_ACCOUNT_ID },
        ],
        created_at: { gte: testStartTime },
      },
      select: {
        value_date: true,
        amount: true,
        account_id: true,
        credit_account_id: true,
        description: true,
      },
    });

    expect(inserted.length).toBe(result.count);
    expect(inserted.every((r) => r.value_date != null)).toBe(true);
    expect(inserted.every((r) => Number(r.amount) > 0)).toBe(true);

    // Every row must have the savings account on exactly one side
    expect(
      inserted.every(
        (r) =>
          r.account_id === SAVINGS_ACCOUNT_ID ||
          r.credit_account_id === SAVINGS_ACCOUNT_ID
      )
    ).toBe(true);

    // The contra side (non-bank side) should be null when not categorized
    const debitRows = inserted.filter((r) => r.credit_account_id === SAVINGS_ACCOUNT_ID);
    const creditRows = inserted.filter((r) => r.account_id === SAVINGS_ACCOUNT_ID);
    console.log(
      `  Inserted — debit rows: ${debitRows.length}, credit rows: ${creditRows.length}`
    );
  });
});

// ── Tier 3: Real ICICI PDF + AI categorisation + real DB (FABRIQ_IMPORT_FULL_TEST=1) ──

const runTier3 = process.env.FABRIQ_IMPORT_FULL_TEST === '1';

describe('Tier 3 — ICICI PDF with AI categorisation (FABRIQ_IMPORT_FULL_TEST=1)', () => {
  jest.setTimeout(180_000);
  let testStartTime: Date;

  beforeAll(async () => {
    if (!runTier3) return;
    try {
      const [acct, entity] = await Promise.all([
        prisma.account.findUnique({ where: { id: SAVINGS_ACCOUNT_ID }, select: { id: true } }),
        (prisma as any).entity.findUnique({ where: { id: LEGAL_ENTITY_ID }, select: { id: true } }),
      ]);
      if (!acct) throw new Error(`Account ${SAVINGS_ACCOUNT_ID} not found`);
      if (!entity) throw new Error(`Entity ${LEGAL_ENTITY_ID} not found`);
    } catch (e) {
      if (isDatabaseUnavailable(e)) {
        console.log('Skipping Tier 3: DB unreachable');
        return;
      }
      throw e;
    }
    testStartTime = new Date();
  });

  afterAll(async () => {
    if (!runTier3) return;
    if (!process.env.LEAVE_DATA) {
      await deleteInsertedSince(testStartTime!).catch((e) =>
        console.warn('Tier 3 cleanup failed:', e)
      );
      console.log('Tier 3 cleanup done.');
    } else {
      console.log('LEAVE_DATA=1 — rows kept for manual verification.');
    }
    await prisma.$disconnect();
  });

  it('dry run WITH categorisation: debit rows get expense account_id from LLM', async () => {
    if (!runTier3) return console.log('Skipping (set FABRIQ_IMPORT_FULL_TEST=1)');

    const buf = fs.readFileSync(ICICI_PDF);
    const result = await PostingImportService.getInstance().importBankStatement(
      makeContext(),
      {
        fileBuffer: buf,
        mimeType: 'application/pdf',
        fileSize: buf.length,
        fileName: 'OpTransactionHistory21-04-2026.pdf',
        accountId: SAVINGS_ACCOUNT_ID,
        dryRun: true,
        categorize: true,
        legalEntityId: LEGAL_ENTITY_ID,
      }
    );

    console.log(`Tier 3 categorise dry run: ${result.count} transactions`);
    if (!result.success) console.error('Error:', result.error);

    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);

    const txns = result.transactions!;
    const debitRows = txns.filter((t) => t.credit_account_id === SAVINGS_ACCOUNT_ID);
    const categorisedDebits = debitRows.filter((t) => t.account_id != null);
    console.log(`  Categorised ${categorisedDebits.length} / ${debitRows.length} debit rows`);
    expect(categorisedDebits.length).toBeGreaterThan(0);
  });

  it('dry run WITH categorisation + extraction_notes: notes are forwarded to extractor', async () => {
    if (!runTier3) return console.log('Skipping (set FABRIQ_IMPORT_FULL_TEST=1)');

    // Set ICICI-specific extraction notes directly on the account so the service
    // picks them up automatically via fetchAccountExtractionNotes.
    await prisma.account.update({
      where: { id: SAVINGS_ACCOUNT_ID },
      data: {
        extraction_notes:
          'EBA in the description means a transfer to/from ICICI Direct equity trading account. ' +
          'Positive EBA = sale proceeds received. Negative EBA = purchase funds sent. ' +
          'INT.PD entries are savings account interest credits, not expense payments.',
      },
    });

    const buf = fs.readFileSync(ICICI_PDF);
    const result = await PostingImportService.getInstance().importBankStatement(
      makeContext(),
      {
        fileBuffer: buf,
        mimeType: 'application/pdf',
        fileSize: buf.length,
        fileName: 'OpTransactionHistory21-04-2026.pdf',
        accountId: SAVINGS_ACCOUNT_ID,
        dryRun: true,
        categorize: true,
        legalEntityId: LEGAL_ENTITY_ID,
      }
    );

    // Clean up notes after the test
    await prisma.account.update({
      where: { id: SAVINGS_ACCOUNT_ID },
      data: { extraction_notes: null },
    });

    console.log(`Tier 3 extraction_notes dry run: ${result.count} transactions`);
    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);
  });

  it('live import WITH categorisation: inserts rows, debit rows have expense account_id', async () => {
    if (!runTier3) return console.log('Skipping (set FABRIQ_IMPORT_FULL_TEST=1)');

    const buf = fs.readFileSync(ICICI_PDF);
    const progressEvents: string[] = [];

    const result = await PostingImportService.getInstance().importBankStatement(
      makeContext(),
      {
        fileBuffer: buf,
        mimeType: 'application/pdf',
        fileSize: buf.length,
        fileName: 'OpTransactionHistory21-04-2026.pdf',
        accountId: SAVINGS_ACCOUNT_ID,
        categorize: true,
        legalEntityId: LEGAL_ENTITY_ID,
        onProgress: (p) => {
          progressEvents.push(p.step);
          console.log(`  [${p.step}] ${p.message}`);
        },
      }
    );

    console.log(`Tier 3 live import: ${result.count} rows inserted`);
    expect(result.success).toBe(true);
    expect((result.count ?? 0)).toBeGreaterThan(0);

    expect(progressEvents[0]).toBe('extracting');
    expect(progressEvents[progressEvents.length - 1]).toBe('complete');

    const inserted = await prisma.posting.findMany({
      where: {
        org_id: INDIAN_ORG_ID,
        OR: [
          { account_id: SAVINGS_ACCOUNT_ID },
          { credit_account_id: SAVINGS_ACCOUNT_ID },
        ],
        created_at: { gte: testStartTime },
      },
      select: {
        description: true,
        amount: true,
        account_id: true,
        credit_account_id: true,
        ai_cat_score: true,
      },
    });

    expect(inserted.length).toBe(result.count);

    const debitRows = inserted.filter((r) => r.credit_account_id === SAVINGS_ACCOUNT_ID);
    const creditRows = inserted.filter((r) => r.account_id === SAVINGS_ACCOUNT_ID);
    const categorisedDebits = debitRows.filter((r) => r.account_id != null);
    const aiCategorised = inserted.filter((r) => r.ai_cat_score != null);

    console.log(`  Debit rows: ${debitRows.length}, credit rows: ${creditRows.length}`);
    console.log(`  Categorised debits: ${categorisedDebits.length} / ${debitRows.length}`);
    console.log(`  AI-categorised total: ${aiCategorised.length}`);

    expect(categorisedDebits.length).toBeGreaterThan(0);
  });
});
