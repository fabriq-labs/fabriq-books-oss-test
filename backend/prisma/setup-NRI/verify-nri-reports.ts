/**
 * Print Balance Sheet (trial balance identity) and P&L for org_rajesh.
 * Run after --demo-data=nri. Uses the same report functions as the API.
 */
import prisma from '../../src/lib/prisma';
import { getIncomeStatement, getTrialBalance } from '../../src/lib/reports/perfin';
import { ENT_CA, ENT_IN, ORG_ID } from './setup-nri-demo';

type TbRow = {
  account_id: string;
  classification: string;
  level: number;
  parent_account_id?: string | null;
  total_balance?: number;
  total_debits?: number;
  total_credits?: number;
  account_name?: string;
};

function classTotal(rows: TbRow[], cls: string): number {
  return rows
    .filter((r) => String(r.classification).toLowerCase() === cls.toLowerCase() && Number(r.level) === 0)
    .reduce((s, r) => s + Number(r.total_balance ?? 0), 0);
}

function pnlTotals(
  rows: Array<{ classification: string; level: number; total_amount: number; account_name: string }>
) {
  const income = rows
    .filter((r) => r.classification === 'Income' && Number(r.level) === 0)
    .reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const expense = rows
    .filter((r) => r.classification === 'Expense' && Number(r.level) === 0)
    .reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  return { income, expense, net: income - expense };
}

async function unmatched(entityId: string): Promise<number> {
  const rows = await prisma.posting.findMany({
    where: { org_id: ORG_ID, legal_entity_id: entityId, reconciliation_status: 'UNMATCHED' },
    select: { amount: true },
  });
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

async function checkEntity(label: string, entityId: string, from: string, to: string, currency: string) {
  const tb = (await getTrialBalance(from, to, ORG_ID, undefined, currency, [entityId])) as TbRow[];
  const pnl = await getIncomeStatement(from, to, ORG_ID, undefined, [entityId], currency);
  const assets = classTotal(tb, 'Assets');
  const liabilities = classTotal(tb, 'Liabilities');
  const equity = classTotal(tb, 'Equity');
  const income = classTotal(tb, 'Income');
  const expense = classTotal(tb, 'Expense');
  const netIncome = income - expense;
  const lhs = assets;
  const rhs = liabilities + equity + netIncome;
  const gap = Math.abs(lhs - rhs);
  const um = await unmatched(entityId);
  const pnlT = pnlTotals(pnl as any);
  const ok = Math.abs(gap - um) < 1 || gap < 1;

  console.log(`\n=== ${label} ${from} → ${to} (${currency}) ===`);
  console.log(`  Assets          ${assets.toFixed(2)}`);
  console.log(`  Liabilities     ${liabilities.toFixed(2)}`);
  console.log(`  Equity          ${equity.toFixed(2)}`);
  console.log(`  Income (TB)     ${income.toFixed(2)}`);
  console.log(`  Expense (TB)    ${expense.toFixed(2)}`);
  console.log(`  Net income (TB) ${netIncome.toFixed(2)}`);
  console.log(`  P&L income      ${pnlT.income.toFixed(2)}`);
  console.log(`  P&L expense     ${pnlT.expense.toFixed(2)}`);
  console.log(`  P&L net         ${pnlT.net.toFixed(2)}`);
  console.log(`  Unmatched       ${um.toFixed(2)}`);
  console.log(`  A − (L+E+NI)    ${gap.toFixed(2)}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} accounting equation`);

  const topPnl = (pnl as any[])
    .filter((r) => Number(r.level) > 0 && Number(r.total_amount) !== 0)
    .sort((a, b) => Math.abs(Number(b.total_amount)) - Math.abs(Number(a.total_amount)))
    .slice(0, 8);
  for (const r of topPnl) {
    console.log(`    ${r.classification.padEnd(8)} ${Number(r.total_amount).toFixed(2).padStart(14)}  ${r.account_name}`);
  }

  return ok;
}

async function main() {
  const org = await prisma.org.findUnique({ where: { id: ORG_ID } });
  if (!org) {
    throw new Error('org_rajesh not found — run --demo-data=nri first');
  }
  const counts = await prisma.posting.groupBy({
    by: ['legal_entity_id'],
    where: { org_id: ORG_ID },
    _count: { _all: true },
  });
  console.log('org_rajesh postings', counts);

  const results = [
    await checkEntity('Canada CY2024', ENT_CA, '2024-01-01', '2024-12-31', 'CAD'),
    await checkEntity('Canada CY2025', ENT_CA, '2025-01-01', '2025-12-31', 'CAD'),
    await checkEntity('Canada 2024–2025', ENT_CA, '2024-01-01', '2025-12-31', 'CAD'),
    await checkEntity('India FY24-25', ENT_IN, '2024-04-01', '2025-03-31', 'INR'),
    await checkEntity('India FY25-26', ENT_IN, '2025-04-01', '2026-03-31', 'INR'),
    await checkEntity('India FY24–FY26', ENT_IN, '2024-04-01', '2026-03-31', 'INR'),
  ];

  if (results.some((ok) => !ok)) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
