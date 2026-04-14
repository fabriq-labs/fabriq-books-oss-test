#!/usr/bin/env ts-node
/**
 * Test Reconciliation Pipeline
 *
 * Imports a test bank statement CSV via UploadService (same path as frontend),
 * then runs the categorize → reconcile pipeline and prints a scorecard.
 *
 * Usage:
 *   npx ts-node scripts/test-reconciliation-pipeline.ts                        # batch: import CSV + pipeline
 *   npx ts-node scripts/test-reconciliation-pipeline.ts --single               # single: create one posting + pipeline
 *   npx ts-node scripts/test-reconciliation-pipeline.ts --posting-id=post_xxx  # single: run pipeline on existing posting
 *   npx ts-node scripts/test-reconciliation-pipeline.ts --cleanup              # delete test postings only
 */

import { config } from 'dotenv';
config({ path: '.env' });

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../src/lib/prisma';
import { UploadService } from '../src/services/upload/UploadService';
import { PermissionService } from '../src/services/permissions/PermissionService';
import { AuthContext } from '../src/auth/types';
import {
  reconcileImportedPostings,
  PipelineScorecard,
  PostingResult,
} from '../src/services/reconciliation/reconcileImportedPostings';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEST_MARKER = '[TEST-RECON]';
const TEST_USER_EMAIL = 'sanjay.gupta@demo-india.com';
const TEST_ORG_ID = 'org_indian_demo';
const CHECKING_ACCOUNT_CODE = '1102'; // Checking Account
const VIEW_NAME = 'posting_view';

const CSV_PATH = path.resolve(__dirname, '../test-data/test-bank-statement.csv');

// ---------------------------------------------------------------------------
// CSV parser (simple, for controlled test CSVs)
// ---------------------------------------------------------------------------

function parseCsv(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Auth context builder
// ---------------------------------------------------------------------------

async function buildAuthContext(): Promise<AuthContext> {
  const user = await prisma.user.findFirst({
    where: { email: TEST_USER_EMAIL },
  });

  if (!user) {
    throw new Error(
      `Test user not found: ${TEST_USER_EMAIL}. ` +
      'Run: node setup-db.js --demo-data=indian-demo'
    );
  }

  const permissions = await PermissionService.getUserPermissions(user.id);

  return {
    user: {
      id: user.id,
      email: user.email || '',
      name: user.name,
      org_id: user.org_id || TEST_ORG_ID,
      metadata: { fabriq_org_id: user.org_id || TEST_ORG_ID },
    },
    permissions,
  };
}

// ---------------------------------------------------------------------------
// Resolve Checking Account ID
// ---------------------------------------------------------------------------

async function getCheckingAccountId(orgId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { org_id: orgId, code: CHECKING_ACCOUNT_CODE },
    select: { id: true, name: true },
  });

  if (!account) {
    throw new Error(
      `Checking Account (code=${CHECKING_ACCOUNT_CODE}) not found in org ${orgId}`
    );
  }

  console.log(`  Checking Account: ${account.name} (${account.id})`);
  return account.id;
}

// ---------------------------------------------------------------------------
// Import CSV via UploadService
// ---------------------------------------------------------------------------

async function importCsv(
  auth: AuthContext,
  checkingAccountId: string
): Promise<number> {
  const csvData = parseCsv(CSV_PATH);
  console.log(`  CSV rows parsed: ${csvData.length}`);

  const mapping: Record<string, string> = {
    value_date: 'value_date',
    description: 'description',
    amount: 'amount',
  };

  const parentData: Record<string, any> = {
    account_id: checkingAccountId,
  };

  const uploadService = UploadService.getInstance();
  const result = await uploadService.uploadCSV(
    'posting',
    auth,
    { data: csvData, mapping, parentData },
    VIEW_NAME
  );

  if (!result.success) {
    throw new Error(`Upload failed: ${result.error}`);
  }

  console.log(`  Upload result: ${result.message}`);
  return result.data?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Find test postings by marker
// ---------------------------------------------------------------------------

async function findTestPostingIds(orgId: string): Promise<string[]> {
  const postings = await prisma.posting.findMany({
    where: {
      org_id: orgId,
      description: { contains: TEST_MARKER },
    },
    select: { id: true },
    orderBy: { value_date: 'asc' },
  });

  return postings.map((p) => p.id);
}

// ---------------------------------------------------------------------------
// Cleanup: delete test postings
// ---------------------------------------------------------------------------

async function cleanup(orgId: string): Promise<number> {
  const result = await prisma.posting.deleteMany({
    where: {
      org_id: orgId,
      description: { contains: TEST_MARKER },
    },
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// Scorecard printer
// ---------------------------------------------------------------------------

function printScorecard(scorecard: PipelineScorecard): void {
  console.log('\n' + '='.repeat(100));
  console.log('  RECONCILIATION PIPELINE SCORECARD');
  console.log('='.repeat(100));

  console.log(`  Postings imported:       ${scorecard.total_imported}`);
  console.log(
    `  Categorized:             ${scorecard.categorized}  (${pct(scorecard.categorized, scorecard.total_imported)})`
  );
  console.log(`  Incoming payments:       ${scorecard.incoming_payments}`);
  console.log(
    `  Reconciled (SUGGESTED):  ${scorecard.suggested}  (${pct(scorecard.suggested, scorecard.incoming_payments)} of incoming)`
  );
  console.log(`  Unmatched:               ${scorecard.unmatched}`);
  console.log(`  Skipped (expense/out):   ${scorecard.skipped_expense}`);

  console.log('\n' + '-'.repeat(100));
  console.log(
    padR('DESCRIPTION', 50) +
    padR('AMOUNT', 10) +
    padR('CATEGORY', 22) +
    padR('STATUS', 12) +
    padR('BEST MATCH', 35) +
    'CONF'
  );
  console.log('-'.repeat(100));

  for (const r of scorecard.results) {
    const desc = truncate(r.description || '—', 48);
    const amt = r.amount.toLocaleString('en-IN');
    const cat = truncate(r.predicted_account_name || '—', 20);
    const status = r.reconciliation_status;
    const match =
      r.best_match
        ? `${r.best_match.type === 'payment_receipt' ? 'receipt' : 'invoice'}:${r.best_match.reference}`
        : '—';
    const conf = r.best_match?.confidence ?? '—';

    console.log(
      padR(desc, 50) +
      padR(amt, 10) +
      padR(cat, 22) +
      padR(status, 12) +
      padR(match, 35) +
      conf
    );

    if (r.alternatives.length > 0) {
      for (const alt of r.alternatives.slice(0, 2)) {
        const altMatch = `${alt.type === 'payment_receipt' ? 'receipt' : 'invoice'}:${alt.reference}`;
        console.log(
          padR('', 50) +
          padR('', 10) +
          padR('', 22) +
          padR('  (alt)', 12) +
          padR(altMatch, 35) +
          alt.confidence
        );
      }
    }
  }

  console.log('='.repeat(100) + '\n');
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function padR(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + '..' : s;
}

// ---------------------------------------------------------------------------
// Single posting: create a test posting directly
// ---------------------------------------------------------------------------

async function createSingleTestPosting(
  auth: AuthContext,
  checkingAccountId: string
): Promise<string> {
  const posting = await prisma.posting.create({
    data: {
      description: `${TEST_MARKER} NEFT - Infosys balance payment INV-002`,
      amount: 35000,
      value_date: new Date('2025-10-30'),
      account_id: checkingAccountId,
      org_id: auth.user.org_id,
      created_by: auth.user.id,
      modified_by: auth.user.id,
    },
  });

  return posting.id;
}

// ---------------------------------------------------------------------------
// Print single posting result (detailed view, simulates API response)
// ---------------------------------------------------------------------------

function printSingleResult(scorecard: PipelineScorecard): void {
  const r = scorecard.results[0];
  if (!r) {
    console.log('  No result returned from pipeline.');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('  SINGLE POSTING PIPELINE RESULT');
  console.log('='.repeat(80));
  console.log(`  Posting ID:       ${r.posting_id}`);
  console.log(`  Description:      ${r.description}`);
  console.log(`  Amount:           ${r.amount.toLocaleString('en-IN')}`);
  console.log(`  Date:             ${r.value_date}`);
  console.log(`  Is Incoming:      ${r.is_incoming}`);
  console.log('');
  console.log('  --- Categorization ---');
  console.log(`  Predicted:        ${r.predicted_account_name ?? '—'}`);
  console.log(`  Confidence:       ${r.confidence ?? '—'}`);
  console.log(`  Reasoning:        ${r.reasoning ?? '—'}`);
  console.log('');
  console.log('  --- Reconciliation ---');
  console.log(`  Status:           ${r.reconciliation_status}`);

  if (r.best_match) {
    const m = r.best_match;
    console.log(`  Best Match:       ${m.type}:${m.reference} (${m.confidence})`);
    console.log(`    Amount:         ${m.amount.toLocaleString('en-IN')}`);
    console.log(`    Date:           ${m.date}`);
    console.log(`    Customer:       ${m.customer ?? '—'}`);
  } else {
    console.log('  Best Match:       —');
  }

  if (r.alternatives.length > 0) {
    console.log(`  Alternatives:     (${r.alternatives.length})`);
    for (const alt of r.alternatives) {
      console.log(`    - ${alt.type}:${alt.reference}  amt=${alt.amount.toLocaleString('en-IN')}  conf=${alt.confidence}  customer=${alt.customer ?? '—'}`);
    }
  }

  console.log('='.repeat(80) + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isCleanupOnly = args.includes('--cleanup');
  const isSingle = args.includes('--single');
  const postingIdArg = args.find((a) => a.startsWith('--posting-id='));
  const existingPostingId = postingIdArg?.split('=')[1];

  console.log('\n=== Reconciliation Pipeline Test ===\n');

  // Build auth context
  console.log('1. Building auth context...');
  const auth = await buildAuthContext();
  const orgId = auth.user.org_id;
  console.log(`   User: ${auth.user.name} (${auth.user.email})`);
  console.log(`   Org:  ${orgId}`);

  // Cleanup mode
  if (isCleanupOnly) {
    console.log('\n2. Cleaning up test postings...');
    const deleted = await cleanup(orgId);
    console.log(`   Deleted ${deleted} test posting(s).`);
    return;
  }

  // =========================================================================
  // Mode: --posting-id=xxx (run pipeline on an existing posting, no insert)
  // =========================================================================
  if (existingPostingId) {
    console.log(`\n2. Running pipeline on existing posting: ${existingPostingId}`);

    // Verify posting exists
    const posting = await prisma.posting.findFirst({
      where: { id: existingPostingId, org_id: orgId },
      select: { id: true, description: true, amount: true },
    });

    if (!posting) {
      console.error(`   ERROR: Posting ${existingPostingId} not found in org ${orgId}.`);
      return;
    }

    console.log(`   Found: "${posting.description}" (amount: ${posting.amount})`);
    console.log('\n3. Running reconciliation pipeline...\n');

    const scorecard = await reconcileImportedPostings([existingPostingId], auth);
    printSingleResult(scorecard);

    console.log('Done.\n');
    return;
  }

  // =========================================================================
  // Mode: --single (create one test posting, run pipeline, print detailed result)
  // =========================================================================
  if (isSingle) {
    // Clean up any previous single test postings
    console.log('\n2. Checking for existing test data...');
    const existingIds = await findTestPostingIds(orgId);
    if (existingIds.length > 0) {
      console.log(`   Found ${existingIds.length} existing test posting(s) — cleaning up...`);
      await cleanup(orgId);
    }

    console.log('\n3. Resolving Checking Account...');
    const checkingAccountId = await getCheckingAccountId(orgId);

    console.log('\n4. Creating single test posting...');
    const postingId = await createSingleTestPosting(auth, checkingAccountId);
    console.log(`   Created posting: ${postingId}`);

    console.log('\n5. Running reconciliation pipeline...\n');
    const scorecard = await reconcileImportedPostings([postingId], auth);
    printSingleResult(scorecard);

    // Also print the updated posting from DB (simulates API response)
    const updatedPosting = await prisma.posting.findUnique({
      where: { id: postingId },
    });
    if (updatedPosting) {
      console.log('  --- Updated Posting (as returned by API) ---');
      console.log(`  reconciliation_status: ${updatedPosting.reconciliation_status}`);
      console.log(`  matched_reference:     ${updatedPosting.matched_reference}`);
      console.log(`  credit_account_id:     ${updatedPosting.credit_account_id}`);
      console.log(`  account_id:            ${updatedPosting.account_id}`);
      console.log(`  ai_cat_score:          ${updatedPosting.ai_cat_score}`);
      console.log(`  ai_categorized_at:     ${updatedPosting.ai_categorized_at}`);
      console.log('');
    }

    console.log('Done. Run with --cleanup to remove test postings.\n');
    return;
  }

  // =========================================================================
  // Mode: default (batch: import CSV + pipeline)
  // =========================================================================

  // Check for existing test postings and clean them up first
  console.log('\n2. Checking for existing test data...');
  const existingIds = await findTestPostingIds(orgId);
  if (existingIds.length > 0) {
    console.log(`   Found ${existingIds.length} existing test posting(s) — cleaning up...`);
    const deleted = await cleanup(orgId);
    console.log(`   Deleted ${deleted} posting(s).`);
  } else {
    console.log('   No existing test data found.');
  }

  // Resolve checking account
  console.log('\n3. Resolving Checking Account...');
  const checkingAccountId = await getCheckingAccountId(orgId);

  // Import CSV
  console.log('\n4. Importing test bank statement via UploadService...');
  const importedCount = await importCsv(auth, checkingAccountId);
  console.log(`   Imported ${importedCount} postings.`);

  // Fetch created posting IDs
  console.log('\n5. Fetching created test posting IDs...');
  const postingIds = await findTestPostingIds(orgId);
  console.log(`   Found ${postingIds.length} test posting(s).`);

  if (postingIds.length === 0) {
    console.error('   ERROR: No test postings found after import. Aborting.');
    return;
  }

  // Run pipeline
  console.log('\n6. Running reconciliation pipeline...');
  console.log('   Phase 1: Batch categorization (calls LLM)...');
  console.log('   Phase 2: Filter incoming payments...');
  console.log('   Phase 3: Reconcile each incoming posting...\n');

  const scorecard = await reconcileImportedPostings(postingIds, auth);

  // Print scorecard
  printScorecard(scorecard);

  console.log('Done. Run with --cleanup to remove test postings.\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFATAL ERROR:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
