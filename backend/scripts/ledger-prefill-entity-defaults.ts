/**
 * Prefill entity ledger default accounts from synced CoA where detectable.
 * Does not overwrite non-null defaults. Does not post to the GL.
 *
 *   cd backend && npm run ledger:prefill-entity-defaults -- --org org_kernel
 *   cd backend && npm run ledger:prefill-entity-defaults -- --org org_kernel --entity ent_demo_us
 */
import prisma from '../src/lib/prisma';

type AccountRow = {
  id: string;
  name: string | null;
  account_types: string[] | null;
  sub_type: string | null;
  classification: string | null;
  is_active: boolean | null;
};

function parseArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function typesOf(row: AccountRow): string[] {
  return (row.account_types ?? []).map((t) => t.toLowerCase());
}

function scoreReceivable(row: AccountRow): number {
  const types = typesOf(row);
  const sub = (row.sub_type ?? '').toLowerCase();
  const name = (row.name ?? '').toLowerCase();
  if (sub === 'accountsreceivable') return 100;
  if (types.some((t) => t === 'accounts receivable' || t === 'accountsreceivable')) return 90;
  if (types.some((t) => t === 'ar' || t === 'receivable' || t === 'accounts_receivable')) return 80;
  if (name.includes('accounts receivable') || name === 'a/r') return 70;
  return 0;
}

function scoreUndeposited(row: AccountRow): number {
  const types = typesOf(row);
  const sub = (row.sub_type ?? '').toLowerCase();
  const name = (row.name ?? '').toLowerCase();
  if (sub === 'undepositedfunds') return 100;
  if (name === 'undeposited funds' || name.includes('undeposited funds')) return 90;
  if (types.some((t) => t.includes('undeposited'))) return 80;
  return 0;
}

function scoreIncome(row: AccountRow): number {
  if (row.classification !== 'income') return 0;
  const sub = (row.sub_type ?? '').toLowerCase();
  const name = (row.name ?? '').toLowerCase();
  const types = typesOf(row);
  if (sub === 'salesofproductincome') return 90;
  if (name === 'sales revenue' || name === 'sales of product income') return 85;
  if (types.some((t) => t === 'sales' || t === 'income')) return 60;
  if (sub === 'servicefeeincome' || name === 'services' || name === 'service revenue') return 50;
  return 20;
}

function scoreDiscount(row: AccountRow): number {
  const sub = (row.sub_type ?? '').toLowerCase();
  const name = (row.name ?? '').toLowerCase();
  if (sub === 'discountsrefundsgiven' && name.includes('discount')) return 110;
  if (name.includes('discount')) return 100;
  if (sub === 'discountsrefundsgiven') return 80;
  return 0;
}

function pickBest(rows: AccountRow[], score: (r: AccountRow) => number): AccountRow | null {
  let best: AccountRow | null = null;
  let bestScore = 0;
  for (const row of rows) {
    if (row.is_active === false) continue;
    const s = score(row);
    if (s > bestScore) {
      best = row;
      bestScore = s;
    }
  }
  return bestScore > 0 ? best : null;
}

async function main() {
  const orgId = parseArg('--org');
  const entityId = parseArg('--entity');
  if (!orgId) {
    throw new Error('Usage: ledger:prefill-entity-defaults -- --org <org_id> [--entity <entity_id>]');
  }

  const entities = await prisma.entity.findMany({
    where: {
      org_id: orgId,
      ...(entityId ? { id: entityId } : {}),
    },
    select: {
      id: true,
      name: true,
      default_receivable_account_id: true,
      default_income_account_id: true,
      default_undeposited_funds_account_id: true,
      default_discount_account_id: true,
      default_fx_gain_loss_account_id: true,
    },
  });

  if (entities.length === 0) {
    console.log(`No entities for org ${orgId}`);
    return;
  }

  const accounts = (await prisma.account.findMany({
    where: { org_id: orgId },
    select: {
      id: true,
      name: true,
      account_types: true,
      sub_type: true,
      classification: true,
      is_active: true,
    },
  })) as AccountRow[];

  const ar = pickBest(accounts, scoreReceivable);
  const uf = pickBest(accounts, scoreUndeposited);
  const income = pickBest(accounts, scoreIncome);
  const discount = pickBest(accounts, scoreDiscount);

  console.log('Detected CoA defaults:');
  console.log(`  AR:       ${ar ? `${ar.name} (${ar.id})` : '(none)'}`);
  console.log(`  UF:       ${uf ? `${uf.name} (${uf.id})` : '(none)'}`);
  console.log(`  Income:   ${income ? `${income.name} (${income.id})` : '(none)'}`);
  console.log(`  Discount: ${discount ? `${discount.name} (${discount.id})` : '(none)'}`);
  console.log('  FX:       (left null — not auto-detected)');

  for (const entity of entities) {
    const data: Record<string, string> = {};
    if (!entity.default_receivable_account_id && ar) data.default_receivable_account_id = ar.id;
    if (!entity.default_undeposited_funds_account_id && uf) {
      data.default_undeposited_funds_account_id = uf.id;
    }
    if (!entity.default_income_account_id && income) data.default_income_account_id = income.id;
    if (!entity.default_discount_account_id && discount) {
      data.default_discount_account_id = discount.id;
    }

    if (Object.keys(data).length === 0) {
      console.log(`  ${entity.name} (${entity.id}): already set / nothing detected`);
      continue;
    }

    await prisma.entity.update({
      where: { id: entity.id },
      data: { ...data, modified_by: 'ledger:prefill-entity-defaults' },
    });
    console.log(`  ${entity.name} (${entity.id}): set ${Object.keys(data).join(', ')}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
