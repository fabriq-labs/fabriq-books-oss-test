#!/usr/bin/env ts-node
/**
 * Automated test for forex-aware trial balance.
 *
 * Tests TWO reporting currencies:
 *   - INR (org default — no currency param)
 *   - USD (explicit override via reportCurrency param)
 *
 * Validates per currency:
 *   1. Row count matches account_hierarchy (all accounts appear)
 *   2. report_currency matches expected value
 *   3. Base-currency accounts have rate = 1; foreign accounts have rate != 1
 *   4. Converted amounts = original × rate (spot-check)
 *   5. Total debits ≈ total credits across leaf accounts
 *   6. Currency distribution
 *
 * Run AFTER setup-forex.ts and prisma db push/generate:
 *   cd backend && npx ts-node scripts/test-forex-trial-balance.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { getTrialBalance } from '../src/lib/reports/perfin';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORG_ID = 'org_knack-global-pvt-ltd';
const FROM = '2024-04-01';
const TO = '2025-03-31';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function getExpectedRowCount(): Promise<number> {
  const result: any[] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM account_hierarchy WHERE org_id = $1`,
    ORG_ID,
  );
  return result[0].cnt;
}

async function testForCurrency(
  reportCurrency: string | undefined,
  expectedReportCurrency: string,
) {
  const label = reportCurrency ?? '(org default)';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Testing report_currency = ${expectedReportCurrency} [param: ${label}]`);
  console.log(`${'═'.repeat(60)}`);

  const rows = await getTrialBalance(FROM, TO, ORG_ID, undefined, reportCurrency);
  const expectedRowCount = await getExpectedRowCount();

  // ── Test 1: Row count ──────────────────────────────────────────────
  console.log('\nTest 1: Row count');
  assert(
    `Row count = ${expectedRowCount}`,
    rows.length === expectedRowCount,
    `got ${rows.length}`,
  );

  // ── Test 2: report_currency ────────────────────────────────────────
  console.log('\nTest 2: report_currency');
  const allMatch = rows.every((r) => r.report_currency === expectedReportCurrency);
  assert(
    `Every row has report_currency = "${expectedReportCurrency}"`,
    allMatch,
    allMatch
      ? undefined
      : `found: ${[...new Set(rows.map((r) => r.report_currency))].join(', ')}`,
  );

  // ── Test 3: Rates ──────────────────────────────────────────────────
  console.log('\nTest 3: Rates');
  const baseRows = rows.filter(
    (r) => !r.account_currency || r.account_currency === expectedReportCurrency,
  );
  const foreignRows = rows.filter(
    (r) => r.account_currency && r.account_currency !== expectedReportCurrency,
  );

  assert(
    `Base-currency accounts (${baseRows.length}) all have period_rate = 1`,
    baseRows.every((r) => Number(r.period_rate) === 1),
  );
  assert(
    `Foreign-currency accounts exist (${foreignRows.length} > 0)`,
    foreignRows.length > 0,
  );

  const foreignWithRate = foreignRows.filter((r) => Number(r.period_rate) !== 1);
  assert(
    `Foreign accounts with period_rate != 1: ${foreignWithRate.length} of ${foreignRows.length}`,
    foreignWithRate.length === foreignRows.length,
    foreignWithRate.length < foreignRows.length
      ? `${foreignRows.length - foreignWithRate.length} foreign accounts have rate=1 (missing rate?)`
      : undefined,
  );

  // ── Test 4: Conversion arithmetic ──────────────────────────────────
  console.log('\nTest 4: Conversion arithmetic (spot-check)');
  const leafForeign = foreignRows.filter(
    (r) =>
      Number(r.total_debits_orig) !== 0 &&
      Number(r.period_rate) !== 1 &&
      r.level > 0,
  );
  const sampleSize = Math.min(5, leafForeign.length);
  let conversionOk = 0;
  for (let i = 0; i < sampleSize; i++) {
    const r = leafForeign[i];
    const expectedDebits = Number(r.total_debits_orig) * Number(r.period_rate);
    const actualDebits = Number(r.total_debits);
    const diff = Math.abs(expectedDebits - actualDebits);
    const ok = diff < 0.02;
    if (ok) conversionOk++;
    if (!ok) {
      console.log(
        `    ${r.account_name} (${r.account_currency}): orig=${r.total_debits_orig} × rate=${r.period_rate} = expected ${expectedDebits.toFixed(4)}, got ${actualDebits}`,
      );
    }
  }
  assert(
    `${conversionOk}/${sampleSize} sampled accounts pass debit conversion check`,
    conversionOk === sampleSize,
  );

  // ── Test 5: Debit/credit balance integrity ─────────────────────────
  console.log('\nTest 5: Debit/credit balance integrity (leaf accounts)');
  const leafRows = rows.filter((r) => {
    const hasChildren = rows.some((c) => c.parent_account_id === r.account_id);
    return !hasChildren;
  });
  const totalDebitsLeaf = leafRows.reduce((s, r) => s + Number(r.total_debits), 0);
  const totalCreditsLeaf = leafRows.reduce((s, r) => s + Number(r.total_credits), 0);
  const debitCreditDiff = Math.abs(totalDebitsLeaf - totalCreditsLeaf);
  assert(
    `Leaf debits (${totalDebitsLeaf.toFixed(2)}) ≈ credits (${totalCreditsLeaf.toFixed(2)}) [diff=${debitCreditDiff.toFixed(2)}]`,
    debitCreditDiff < 1.0,
    debitCreditDiff >= 1.0 ? `diff too large: ${debitCreditDiff.toFixed(4)}` : undefined,
  );

  // ── Test 6: Currency distribution ──────────────────────────────────
  console.log('\nTest 6: Currency distribution');
  const currDist: Record<string, number> = {};
  for (const r of rows) {
    const c = r.account_currency || '(null)';
    currDist[c] = (currDist[c] || 0) + 1;
  }
  for (const [c, n] of Object.entries(currDist).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${c}: ${n} accounts`);
  }
  assert(
    `Multiple currencies present`,
    Object.keys(currDist).length >= 2,
  );

  // ── Sample output ──────────────────────────────────────────────────
  console.log(`\nSample (foreign accounts with activity, report_currency=${expectedReportCurrency}):`);
  const sample = foreignRows
    .filter((r) => Number(r.total_debits_orig) > 0 || Number(r.total_credits_orig) > 0)
    .slice(0, 3);
  console.table(
    sample.map((r) => ({
      name: (r.account_name ?? '').substring(0, 35),
      acct_ccy: r.account_currency,
      rpt_ccy: r.report_currency,
      rate: Number(r.period_rate),
      debits_orig: Number(r.total_debits_orig).toFixed(2),
      debits_conv: Number(r.total_debits).toFixed(2),
    })),
  );
}

async function main() {
  console.log(`\n=== Forex Trial Balance Tests ===`);
  console.log(`Org: ${ORG_ID}  Period: ${FROM} → ${TO}\n`);

  // Test 1: Default (no currency param) → should use org base_currency (INR)
  await testForCurrency(undefined, 'INR');

  // Test 2: Explicit USD override
  await testForCurrency('USD', 'USD');

  // ── Summary ────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
