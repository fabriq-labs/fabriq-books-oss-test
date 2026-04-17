#!/usr/bin/env ts-node
/**
 * Setup forex infrastructure for org_knack-global-pvt-ltd:
 *   1. Seed the currency table with USD, INR, PHP
 *   2. Set base_currency = 'INR' on the org
 *   3. Assign currency to every account based on naming conventions
 *   4. Seed monthly exchange rates (CLOSING + AVERAGE) for USD→INR, PHP→INR, PHP→USD, INR→USD
 *   5. Re-create the account_hierarchy view to include the currency column
 *
 * Run AFTER `prisma db push && prisma generate`:
 *   cd backend && npx ts-node scripts/setup-forex.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORG_ID = 'org_knack-global-pvt-ltd';
const BASE_CURRENCY = 'INR';

// ── 1. Currencies ────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimal_places: 2 },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimal_places: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimal_places: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimal_places: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimal_places: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimal_places: 0 },
];

async function seedCurrencies() {
  console.log('1. Seeding currencies...');
  for (const c of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: { name: c.name, symbol: c.symbol, decimal_places: c.decimal_places },
      create: { ...c, org_id: ORG_ID },
    });
  }
  console.log(`   ✓ ${CURRENCIES.length} currencies upserted`);
}

// ── 2. Set org base currency ─────────────────────────────────────────────

async function setOrgBaseCurrency() {
  console.log('2. Setting org base currency...');
  await prisma.$executeRawUnsafe(
    `UPDATE organizations SET base_currency = $1 WHERE id = $2`,
    BASE_CURRENCY,
    ORG_ID,
  );
  console.log(`   ✓ ${ORG_ID} → base_currency = ${BASE_CURRENCY}`);
}

// ── 3. Assign currency to accounts ───────────────────────────────────────

function inferCurrency(accountName: string): string {
  const n = accountName.trim();
  if (n.endsWith('-PHP') || n.includes('-PHP ')) return 'PHP';
  if (n.includes('(PH)')) return 'PHP';
  if (n.endsWith('-PPM') || n.includes('-PPM ')) return 'USD';
  if (n.includes('(US)')) return 'USD';
  if (n.endsWith('-KI USD') || n.includes('-KI USD ')) return 'USD';
  if (n.includes('(India)')) return 'INR';
  if (n.endsWith('-INR') || n.includes('-INR ')) return 'INR';
  if (n.endsWith('-KI INR') || n.includes('-KI INR ')) return 'INR';
  return BASE_CURRENCY;
}

async function assignAccountCurrencies() {
  console.log('3. Assigning currency to accounts...');
  const accounts = await prisma.account.findMany({
    where: { org_id: ORG_ID },
    select: { id: true, name: true, currency: true },
  });

  const updates: Record<string, string[]> = {};
  for (const a of accounts) {
    const cur = inferCurrency(a.name ?? '');
    if (!updates[cur]) updates[cur] = [];
    updates[cur].push(a.id);
  }

  for (const [cur, ids] of Object.entries(updates)) {
    await prisma.$executeRawUnsafe(
      `UPDATE account SET currency = $1 WHERE id = ANY($2::text[])`,
      cur,
      ids,
    );
  }

  for (const [cur, ids] of Object.entries(updates)) {
    console.log(`   ✓ ${cur}: ${ids.length} accounts`);
  }
}

// ── 4. Seed exchange rates ───────────────────────────────────────────────

// Monthly rates for FY 2024-25 (Apr 2024 – Mar 2025)
// Each entry: { from, to, months[] } where rate = "1 <from> = <rate> <to>"
const RATE_DATA: { from: string; to: string; months: { date: string; closing: number; average: number }[] }[] = [
  // ── USD → INR (for trial balance in INR) ───────────────────────────
  {
    from: 'USD', to: 'INR',
    months: [
      { date: '2024-03-31', closing: 83.40, average: 83.25 },
      { date: '2024-04-30', closing: 83.50, average: 83.45 },
      { date: '2024-05-31', closing: 83.30, average: 83.40 },
      { date: '2024-06-30', closing: 83.55, average: 83.42 },
      { date: '2024-07-31', closing: 83.75, average: 83.65 },
      { date: '2024-08-31', closing: 83.90, average: 83.82 },
      { date: '2024-09-30', closing: 83.80, average: 83.85 },
      { date: '2024-10-31', closing: 84.10, average: 83.95 },
      { date: '2024-11-30', closing: 84.35, average: 84.22 },
      { date: '2024-12-31', closing: 84.70, average: 84.52 },
      { date: '2025-01-31', closing: 85.50, average: 85.10 },
      { date: '2025-02-28', closing: 86.20, average: 85.85 },
      { date: '2025-03-31', closing: 86.60, average: 86.40 },
    ],
  },
  // ── PHP → INR (for trial balance in INR) ───────────────────────────
  {
    from: 'PHP', to: 'INR',
    months: [
      { date: '2024-03-31', closing: 1.490, average: 1.488 },
      { date: '2024-04-30', closing: 1.478, average: 1.484 },
      { date: '2024-05-31', closing: 1.450, average: 1.464 },
      { date: '2024-06-30', closing: 1.428, average: 1.439 },
      { date: '2024-07-31', closing: 1.449, average: 1.438 },
      { date: '2024-08-31', closing: 1.477, average: 1.463 },
      { date: '2024-09-30', closing: 1.492, average: 1.484 },
      { date: '2024-10-31', closing: 1.447, average: 1.469 },
      { date: '2024-11-30', closing: 1.434, average: 1.440 },
      { date: '2024-12-31', closing: 1.431, average: 1.433 },
      { date: '2025-01-31', closing: 1.462, average: 1.446 },
      { date: '2025-02-28', closing: 1.491, average: 1.477 },
      { date: '2025-03-31', closing: 1.516, average: 1.503 },
    ],
  },
  // ── PHP → USD (for trial balance in USD) ───────────────────────────
  {
    from: 'PHP', to: 'USD',
    months: [
      { date: '2024-03-31', closing: 0.01786, average: 0.01790 },
      { date: '2024-04-30', closing: 0.01770, average: 0.01778 },
      { date: '2024-05-31', closing: 0.01740, average: 0.01755 },
      { date: '2024-06-30', closing: 0.01710, average: 0.01725 },
      { date: '2024-07-31', closing: 0.01730, average: 0.01720 },
      { date: '2024-08-31', closing: 0.01760, average: 0.01745 },
      { date: '2024-09-30', closing: 0.01780, average: 0.01770 },
      { date: '2024-10-31', closing: 0.01720, average: 0.01750 },
      { date: '2024-11-30', closing: 0.01700, average: 0.01710 },
      { date: '2024-12-31', closing: 0.01690, average: 0.01695 },
      { date: '2025-01-31', closing: 0.01710, average: 0.01700 },
      { date: '2025-02-28', closing: 0.01730, average: 0.01720 },
      { date: '2025-03-31', closing: 0.01750, average: 0.01740 },
    ],
  },
  // ── INR → USD (for trial balance in USD) ───────────────────────────
  {
    from: 'INR', to: 'USD',
    months: [
      { date: '2024-03-31', closing: 0.01199, average: 0.01201 },
      { date: '2024-04-30', closing: 0.01198, average: 0.01198 },
      { date: '2024-05-31', closing: 0.01195, average: 0.01196 },
      { date: '2024-06-30', closing: 0.01197, average: 0.01196 },
      { date: '2024-07-31', closing: 0.01192, average: 0.01194 },
      { date: '2024-08-31', closing: 0.01190, average: 0.01191 },
      { date: '2024-09-30', closing: 0.01191, average: 0.01190 },
      { date: '2024-10-31', closing: 0.01185, average: 0.01188 },
      { date: '2024-11-30', closing: 0.01181, average: 0.01183 },
      { date: '2024-12-31', closing: 0.01175, average: 0.01178 },
      { date: '2025-01-31', closing: 0.01168, average: 0.01172 },
      { date: '2025-02-28', closing: 0.01160, average: 0.01164 },
      { date: '2025-03-31', closing: 0.01155, average: 0.01158 },
    ],
  },
];

async function seedExchangeRates() {
  console.log('4. Seeding exchange rates...');
  let count = 0;
  for (const pair of RATE_DATA) {
    for (const m of pair.months) {
      for (const [rateType, rateValue] of [
        ['CLOSING', m.closing],
        ['AVERAGE', m.average],
      ] as const) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO exchange_rate (id, org_id, from_currency_id, to_currency_id, effective_date, rate, rate_type, source, created_at, modified_at)
           SELECT
             'exrt_' || gen_random_uuid(),
             $1,
             cf.id,
             ct.id,
             $4::date,
             $5,
             $6::exchange_rate_type,
             'seed',
             NOW(),
             NOW()
           FROM currency cf
           JOIN currency ct ON ct.code = $3
           WHERE cf.code = $2
           ON CONFLICT (org_id, from_currency_id, to_currency_id, effective_date, rate_type)
           DO UPDATE SET rate = EXCLUDED.rate, modified_at = NOW()`,
          ORG_ID,
          pair.from,
          pair.to,
          m.date,
          rateValue,
          rateType,
        );
        count++;
      }
    }
  }
  console.log(`   ✓ ${count} exchange rate rows upserted`);
}

// ── 5. Refresh account_hierarchy view ────────────────────────────────────

async function refreshAccountHierarchyView() {
  console.log('5. Recreating account_hierarchy view (with currency column)...');
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE VIEW public.account_hierarchy
    AS WITH RECURSIVE hierarchy AS (
             SELECT account.id,
                account.code,
                account.classification,
                account.name,
                account.type,
                account.parent_account_id,
                account.name::character varying(1000) AS path,
                0 AS level,
                account.org_id,
                account.currency
               FROM account
              WHERE account.parent_account_id = ''::text OR account.parent_account_id IS NULL
            UNION ALL
             SELECT a.id,
                a.code,
                a.classification,
                a.name,
                a.type,
                a.parent_account_id,
                (((ah.path::text || ' -> '::text) || a.name))::character varying(1000) AS "varchar",
                ah.level + 1,
                a.org_id,
                a.currency
               FROM account a
                 JOIN hierarchy ah ON a.parent_account_id = ah.id::text
            )
     SELECT id, code, classification, name, type, parent_account_id,
            path, level, org_id, currency
       FROM hierarchy;
  `);
  console.log('   ✓ account_hierarchy view refreshed');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Forex Setup for', ORG_ID, '===\n');

  await seedCurrencies();
  await setOrgBaseCurrency();
  await assignAccountCurrencies();
  await seedExchangeRates();
  await refreshAccountHierarchyView();

  // Quick verification
  console.log('\n--- Verification ---');

  const orgRow: any[] = await prisma.$queryRawUnsafe(
    `SELECT base_currency FROM organizations WHERE id = $1`,
    ORG_ID,
  );
  console.log('Org base_currency:', orgRow[0]?.base_currency);

  const currDist: any[] = await prisma.$queryRawUnsafe(
    `SELECT currency, COUNT(*)::int as cnt FROM account WHERE org_id = $1 GROUP BY currency ORDER BY cnt DESC`,
    ORG_ID,
  );
  console.log('Account currency distribution:');
  for (const r of currDist) console.log(`  ${r.currency || '(null)'}: ${r.cnt}`);

  const rateCnt: any[] = await prisma.$queryRawUnsafe(
    `SELECT cf.code AS from_currency, er.rate_type, COUNT(*)::int AS cnt
     FROM exchange_rate er
     JOIN currency cf ON cf.id = er.from_currency_id
     WHERE er.org_id = $1
     GROUP BY cf.code, er.rate_type
     ORDER BY 1, 2`,
    ORG_ID,
  );
  console.log('Exchange rates loaded:');
  for (const r of rateCnt) console.log(`  ${r.from_currency} ${r.rate_type}: ${r.cnt} entries`);

  const ahCurr: any[] = await prisma.$queryRawUnsafe(
    `SELECT currency, COUNT(*)::int as cnt FROM account_hierarchy WHERE org_id = $1 GROUP BY currency ORDER BY cnt DESC`,
    ORG_ID,
  );
  console.log('account_hierarchy currency distribution:');
  for (const r of ahCurr) console.log(`  ${r.currency || '(null)'}: ${r.cnt}`);

  console.log('\n=== Done ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
