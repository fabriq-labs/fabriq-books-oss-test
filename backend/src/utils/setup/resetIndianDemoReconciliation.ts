/**
 * Reset Indian-demo reconciliation / categorization demo state.
 *
 * Scoped exclusively to org_indian_demo:
 * - Deletes post_demo_* bank lines
 * - Deletes payment receipts created by confirm-match (keeps seed payr_demo_*)
 * - Reloads bank lines from prisma/setup-IN/posting.csv
 * - Clears AI categorization fields on those lines
 *
 * FY journal postings (post_fy25_*, opening balances, etc.) are untouched.
 */
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../lib/prisma';

const csv = require('csv-parser');

export const INDIAN_DEMO_ORG_ID = 'org_indian_demo';
export const INDIAN_DEMO_LEGAL_ENTITY_ID = 'org_indian_demo';

const RECONCILIATION_POSTING_CSV = 'posting.csv';

/** Bank-import style demo lines used for recon / categorization demos. */
export const DEMO_POSTING_IDS = [
  'post_demo_01', 'post_demo_02', 'post_demo_03', 'post_demo_04', 'post_demo_05',
  'post_demo_06', 'post_demo_07', 'post_demo_08', 'post_demo_09', 'post_demo_10',
  'post_demo_11', 'post_demo_12', 'post_demo_13', 'post_demo_14', 'post_demo_15',
  'post_demo_16', 'post_demo_17', 'post_demo_18', 'post_demo_19', 'post_demo_20',
  'post_demo_21', 'post_demo_22', 'post_demo_23', 'post_demo_24',
];

/** Seeded receipts — keep these; only delete receipts created by confirming matches. */
export const SEED_RECEIPT_IDS = [
  'payr_demo_001',
  'payr_demo_002',
  'payr_demo_003',
  'payr_demo_004',
  'payr_demo_005',
  'payr_demo_006',
  'payr_demo_007',
];

interface CsvRow {
  [key: string]: string;
}

export interface ResetIndianDemoReconciliationResult {
  orgId: string;
  deletedPostings: number;
  deletedConfirmReceipts: number;
  reloadedPostings: number;
}

export interface IndianDemoReconStatus {
  orgExists: boolean;
  orgId: string;
  orgName: string | null;
  checkingAccountExists: boolean;
  reconPostingCount: number;
  matchedCount: number;
  unmatchedCount: number;
  aiCategorizedCount: number;
  confirmCreatedReceiptCount: number;
}

function setupInDir(): string {
  return path.join(path.resolve(__dirname, '..', '..', '..'), 'prisma', 'setup-IN');
}

async function loadCsvData(filePath: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const results: CsvRow[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data: CsvRow) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function releasePaymentReceiptLink(
  demoOrgId: string,
  paymentReceiptId: string,
  keepPostingId: string
): Promise<number> {
  const result = await prisma.posting.updateMany({
    where: {
      org_id: demoOrgId,
      payment_receipt_id: paymentReceiptId,
      id: { not: keepPostingId },
    },
    data: {
      payment_receipt_id: null,
      reconciliation_status: null,
      matched_reference: null,
    },
  });
  return result.count;
}

async function upsertReconciliationBankPostingsFromCsv(
  bankAccountId: string,
  demoOrgId: string,
  demoLegalEntityId: string,
  baseDate: Date
): Promise<number> {
  const filePath = path.join(setupInDir(), RECONCILIATION_POSTING_CSV);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Reconciliation CSV not found: ${filePath}`);
  }

  const postingData = await loadCsvData(filePath);
  for (const row of postingData) {
    const daysOffset = parseInt(row.days_offset, 10) || 0;
    const valueDate = new Date(baseDate);
    valueDate.setDate(valueDate.getDate() + daysOffset);
    const isCredit = row.is_credit === 'true' || row.is_credit === '1';
    const updateData: Record<string, unknown> = {
      value_date: valueDate,
      posting_date: valueDate,
      amount: parseFloat(row.amount),
      description: row.description,
      org_id: row.org_id || demoOrgId,
      legal_entity_id: demoLegalEntityId,
      name: (row.description || '').slice(0, 50),
      account_id: isCredit ? bankAccountId : null,
      credit_account_id: isCredit ? null : bankAccountId,
      status: 'ACTIVE',
      // Always clear AI categorization when restoring seed state
      ai_cat_score: null,
      ai_categorized_at: null,
    };
    if (row.payment_receipt_id && String(row.payment_receipt_id).trim() !== '') {
      const receiptId = String(row.payment_receipt_id).trim();
      await releasePaymentReceiptLink(demoOrgId, receiptId, row.id);
      updateData.payment_receipt_id = receiptId;
      updateData.reconciliation_status = row.reconciliation_status || 'MATCHED';
      updateData.matched_reference = row.matched_reference || null;
    } else {
      updateData.payment_receipt_id = null;
      updateData.reconciliation_status = row.reconciliation_status?.trim() || null;
      updateData.matched_reference = row.matched_reference?.trim() || null;
    }
    await prisma.posting.upsert({
      where: { id: row.id },
      update: updateData as any,
      create: { id: row.id, ...updateData } as any,
    });
  }
  return postingData.length;
}

/** Read-only snapshot of indian-demo recon state for the Super Admin UI. */
export async function getIndianDemoReconStatus(): Promise<IndianDemoReconStatus> {
  const org = await prisma.org.findUnique({
    where: { id: INDIAN_DEMO_ORG_ID },
    select: { id: true, name: true },
  });

  if (!org) {
    return {
      orgExists: false,
      orgId: INDIAN_DEMO_ORG_ID,
      orgName: null,
      checkingAccountExists: false,
      reconPostingCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      aiCategorizedCount: 0,
      confirmCreatedReceiptCount: 0,
    };
  }

  const checkingAccount = await prisma.account.findFirst({
    where: {
      org_id: INDIAN_DEMO_ORG_ID,
      legal_entity_id: INDIAN_DEMO_LEGAL_ENTITY_ID,
      code: '1102',
    },
    select: { id: true },
  });

  const [reconPostingCount, matchedCount, unmatchedCount, aiCategorizedCount, linkedReceipts] =
    await Promise.all([
      prisma.posting.count({
        where: { org_id: INDIAN_DEMO_ORG_ID, id: { in: DEMO_POSTING_IDS } },
      }),
      prisma.posting.count({
        where: {
          org_id: INDIAN_DEMO_ORG_ID,
          id: { in: DEMO_POSTING_IDS },
          reconciliation_status: 'MATCHED',
        },
      }),
      prisma.posting.count({
        where: {
          org_id: INDIAN_DEMO_ORG_ID,
          id: { in: DEMO_POSTING_IDS },
          OR: [
            { reconciliation_status: null },
            { reconciliation_status: { not: 'MATCHED' } },
          ],
        },
      }),
      prisma.posting.count({
        where: {
          org_id: INDIAN_DEMO_ORG_ID,
          id: { in: DEMO_POSTING_IDS },
          ai_cat_score: { not: null },
        },
      }),
      prisma.posting.findMany({
        where: {
          org_id: INDIAN_DEMO_ORG_ID,
          id: { in: DEMO_POSTING_IDS },
          payment_receipt_id: { not: null },
        },
        select: { payment_receipt_id: true },
      }),
    ]);

  const confirmCreatedReceiptCount = linkedReceipts.filter(
    (p) => p.payment_receipt_id != null && !SEED_RECEIPT_IDS.includes(p.payment_receipt_id)
  ).length;

  return {
    orgExists: true,
    orgId: org.id,
    orgName: org.name,
    checkingAccountExists: Boolean(checkingAccount),
    reconPostingCount,
    matchedCount,
    unmatchedCount,
    aiCategorizedCount,
    confirmCreatedReceiptCount,
  };
}

/**
 * Reset recon / categorization / confirm-created receipts for org_indian_demo only.
 */
export async function resetIndianDemoReconciliation(): Promise<ResetIndianDemoReconciliationResult> {
  const demoOrgId = INDIAN_DEMO_ORG_ID;
  const demoLegalEntityId = INDIAN_DEMO_LEGAL_ENTITY_ID;

  const org = await prisma.org.findUnique({ where: { id: demoOrgId }, select: { id: true } });
  if (!org) {
    throw new Error(
      `Indian demo org ${demoOrgId} not found. Seed it first (setup-db --demo-data-only --demo-data=indian-demo).`
    );
  }

  console.log(`[demo-data] Resetting reconciliation demo postings for ${demoOrgId}...`);

  const existingPostings = await prisma.posting.findMany({
    where: { id: { in: DEMO_POSTING_IDS }, org_id: demoOrgId },
    select: { id: true, payment_receipt_id: true },
  });

  const receiptIdsToDelete = existingPostings
    .map((p) => p.payment_receipt_id)
    .filter((id): id is string => id != null && !SEED_RECEIPT_IDS.includes(id));

  let deletedConfirmReceipts = 0;
  if (receiptIdsToDelete.length > 0) {
    const deletedReceipts = await prisma.payment_receipt.deleteMany({
      where: { id: { in: receiptIdsToDelete }, org_id: demoOrgId },
    });
    deletedConfirmReceipts = deletedReceipts.count;
    console.log(`[demo-data] Deleted ${deletedConfirmReceipts} confirm-created payment receipt(s)`);
  }

  const deleted = await prisma.posting.deleteMany({
    where: { id: { in: DEMO_POSTING_IDS }, org_id: demoOrgId },
  });
  console.log(`[demo-data] Deleted ${deleted.count} reconciliation demo postings`);

  const bankAccount = await prisma.account.findFirst({
    where: { org_id: demoOrgId, legal_entity_id: demoLegalEntityId, code: '1102' },
  });
  if (!bankAccount) {
    throw new Error(
      'Chart of accounts missing Checking (1102) for org_indian_demo. Run full Indian demo setup first.'
    );
  }

  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() - 2);

  const reloadedPostings = await upsertReconciliationBankPostingsFromCsv(
    bankAccount.id,
    demoOrgId,
    demoLegalEntityId,
    baseDate
  );
  console.log(`[demo-data] Reloaded ${reloadedPostings} reconciliation demo postings`);

  return {
    orgId: demoOrgId,
    deletedPostings: deleted.count,
    deletedConfirmReceipts,
    reloadedPostings,
  };
}
