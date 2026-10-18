/**
 * Demo ledger for the module 1 reports.
 *
 *   npm run seed:coa -- india
 *   npm run seed:books-demo
 *   npm run seed:books-demo -- org_kernel
 *
 * Leaves the chart codes in place. Adds USD and INR if they are missing,
 * two legal entities, INR→USD average and closing rates, a four-account USD
 * entity chart, and opening plus 2026 journals. Re-runs update the same ids.
 *
 * Report currency is the organization base currency. On org_kernel that is USD.
 * For 2026-01-01 through 2026-12-31 the income statement should show:
 *   US Service Revenue 8,000.00 at rate 1
 *   Sales Revenue      1,428.00 at rate 0.0119 (120,000 INR)
 *   US Rent            2,400.00 at rate 1
 *   Rent                 428.40 at rate 0.0119 (36,000 INR)
 */
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma';

const DEFAULT_ORG = 'org_kernel';
const ORG_SYSTEM = 'org_system';
const ACTOR = 'seed:books-demo';

const CURRENCIES = [
  { id: 'curr_kernel_usd', code: 'USD', name: 'US Dollar', symbol: '$' },
  { id: 'curr_kernel_inr', code: 'INR', name: 'Indian Rupee', symbol: '₹' },
] as const;

const ENTITIES = [
  {
    id: 'ent_demo_us',
    name: 'Fabriq US',
    legal_name: 'Fabriq US LLC',
    city: 'Austin',
    state: 'TX',
    country: 'US',
    postal_code: '78701',
    currencyCode: 'USD',
    is_headquarters: true,
  },
  {
    id: 'ent_demo_in',
    name: 'Fabriq India',
    legal_name: 'Fabriq India Private Limited',
    city: 'Bengaluru',
    state: 'KA',
    country: 'IN',
    postal_code: '560001',
    currencyCode: 'INR',
    is_headquarters: false,
  },
] as const;

const RATES: Array<{ id: string; date: string; rateType: 'average' | 'closing'; rate: string }> = [
  { id: 'exrt_demo_inr_usd_close_20250731', date: '2025-07-31', rateType: 'closing', rate: '0.011700' },
  { id: 'exrt_demo_inr_usd_avg_20250831', date: '2025-08-31', rateType: 'average', rate: '0.011800' },
  { id: 'exrt_demo_inr_usd_close_20250831', date: '2025-08-31', rateType: 'closing', rate: '0.011850' },
  { id: 'exrt_demo_inr_usd_avg_20251231', date: '2025-12-31', rateType: 'average', rate: '0.011900' },
  { id: 'exrt_demo_inr_usd_close_20251231', date: '2025-12-31', rateType: 'closing', rate: '0.012000' },
  { id: 'exrt_demo_inr_usd_avg_20261231', date: '2026-12-31', rateType: 'average', rate: '0.011900' },
  { id: 'exrt_demo_inr_usd_close_20261231', date: '2026-12-31', rateType: 'closing', rate: '0.012200' },
];

const US_ACCOUNTS = [
  { id: 'acco_demo_us_cash', code: 'DM-US-CASH', name: 'US Checking', classification: 'asset', account_types: ['bank', 'checking'] },
  { id: 'acco_demo_us_eq', code: 'DM-US-EQ', name: 'US Owner Equity', classification: 'equity', account_types: ['equity'] },
  { id: 'acco_demo_us_rev', code: 'DM-US-REV', name: 'US Service Revenue', classification: 'income', account_types: ['sales'] },
  { id: 'acco_demo_us_rent', code: 'DM-US-RENT', name: 'US Rent', classification: 'expense', account_types: ['rent', 'operating'] },
] as const;

const INDIA_CODES = {
  cash: '1103',
  equity: '3000',
  revenue: '4101',
  rent: '5203',
} as const;

type Journal = {
  id: string;
  date: string;
  amount: string;
  kind: 'opening' | 'journal';
  debitCode: string;
  creditCode: string;
  entityId: string;
  description: string;
};

function dateOnly(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

async function ensureCurrency(db: PrismaClient, spec: (typeof CURRENCIES)[number]): Promise<string> {
  const existing = await db.currency.findUnique({ where: { code: spec.code } });
  if (existing) return existing.id;
  const created = await db.currency.create({
    data: {
      id: spec.id,
      code: spec.code,
      name: spec.name,
      symbol: spec.symbol,
      decimal_places: 2,
      is_active: true,
      org_id: ORG_SYSTEM,
      created_by: ACTOR,
      modified_by: ACTOR,
    },
  });
  return created.id;
}

async function ensureEntity(
  db: PrismaClient,
  orgId: string,
  spec: (typeof ENTITIES)[number],
  currencyId: string
): Promise<string> {
  const data = {
    name: spec.name,
    legal_name: spec.legal_name,
    city: spec.city,
    state: spec.state,
    country: spec.country,
    postal_code: spec.postal_code,
    currency_id: currencyId,
    is_headquarters: spec.is_headquarters,
    modified_by: ACTOR,
  };
  const existing = await db.entity.findUnique({ where: { id: spec.id } });
  if (existing) {
    if (existing.org_id !== orgId) {
      throw new Error(`Entity ${spec.id} belongs to ${existing.org_id}, not ${orgId}`);
    }
    await db.entity.update({ where: { id: spec.id }, data });
    return spec.id;
  }
  await db.entity.create({
    data: {
      id: spec.id,
      org_id: orgId,
      created_by: ACTOR,
      ...data,
    },
  });
  return spec.id;
}

async function ensureRate(
  db: PrismaClient,
  orgId: string,
  fromCurrencyId: string,
  toCurrencyId: string,
  spec: (typeof RATES)[number]
): Promise<void> {
  const data = {
    from_currency_id: fromCurrencyId,
    to_currency_id: toCurrencyId,
    effective_date: dateOnly(spec.date),
    rate: new Prisma.Decimal(spec.rate),
    rate_type: spec.rateType,
    modified_by: ACTOR,
  };
  const existing = await db.exchange_rate.findUnique({ where: { id: spec.id } });
  if (existing) {
    await db.exchange_rate.update({ where: { id: spec.id }, data });
    return;
  }
  await db.exchange_rate.create({
    data: {
      id: spec.id,
      org_id: orgId,
      created_by: ACTOR,
      ...data,
    },
  });
}

async function ensureUsAccount(
  db: PrismaClient,
  orgId: string,
  currencyId: string,
  entityId: string,
  spec: (typeof US_ACCOUNTS)[number]
): Promise<void> {
  const data = {
    name: spec.name,
    classification: spec.classification as Prisma.accountCreateInput['classification'],
    account_types: [...spec.account_types],
    currency_id: currencyId,
    entity_id: entityId,
    is_active: true,
    modified_by: ACTOR,
  };
  const byCode = await db.account.findUnique({
    where: { org_id_code: { org_id: orgId, code: spec.code } },
  });
  if (byCode && byCode.id !== spec.id) {
    throw new Error(`Account code ${spec.code} already exists as ${byCode.id}`);
  }
  const existing = await db.account.findUnique({ where: { id: spec.id } });
  if (existing) {
    await db.account.update({ where: { id: spec.id }, data: { code: spec.code, ...data } });
    return;
  }
  await db.account.create({
    data: {
      id: spec.id,
      org_id: orgId,
      code: spec.code,
      created_by: ACTOR,
      ...data,
    },
  });
}

async function accountByCode(db: PrismaClient, orgId: string, code: string): Promise<string> {
  const row = await db.account.findUnique({
    where: { org_id_code: { org_id: orgId, code } },
    select: { id: true },
  });
  if (!row) {
    throw new Error(`Account ${code} is missing on ${orgId}. Run npm run seed:coa -- india first.`);
  }
  return row.id;
}

async function ensurePosting(
  db: PrismaClient,
  orgId: string,
  journal: Journal,
  accounts: Map<string, string>
): Promise<void> {
  const data = {
    description: journal.description,
    value_date: dateOnly(journal.date),
    posting_date: dateOnly(journal.date),
    amount: new Prisma.Decimal(journal.amount),
    kind: journal.kind,
    status: 'active' as const,
    debit_account_id: accounts.get(journal.debitCode),
    credit_account_id: accounts.get(journal.creditCode),
    entity_id: journal.entityId,
    modified_by: ACTOR,
  };
  if (!data.debit_account_id || !data.credit_account_id) {
    throw new Error(`Posting ${journal.id} is missing an account`);
  }
  const existing = await db.posting.findUnique({ where: { id: journal.id } });
  if (existing) {
    await db.posting.update({ where: { id: journal.id }, data });
    return;
  }
  await db.posting.create({
    data: {
      id: journal.id,
      org_id: orgId,
      created_by: ACTOR,
      ...data,
    },
  });
}

async function main() {
  const orgId = process.argv[2] || DEFAULT_ORG;
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { id: true, base_currency: true } });
  if (!org) throw new Error(`Organization ${orgId} was not found`);

  const currencyIds: Record<string, string> = {};
  for (const spec of CURRENCIES) {
    currencyIds[spec.code] = await ensureCurrency(prisma, spec);
  }

  const entityIds: Record<string, string> = {};
  for (const spec of ENTITIES) {
    entityIds[spec.id] = await ensureEntity(prisma, orgId, spec, currencyIds[spec.currencyCode]);
  }

  for (const spec of RATES) {
    await ensureRate(prisma, orgId, currencyIds.INR, currencyIds.USD, spec);
  }

  for (const spec of US_ACCOUNTS) {
    await ensureUsAccount(prisma, orgId, currencyIds.USD, entityIds.ent_demo_us, spec);
  }

  const accounts = new Map<string, string>();
  for (const spec of US_ACCOUNTS) accounts.set(spec.code, spec.id);
  for (const code of Object.values(INDIA_CODES)) {
    accounts.set(code, await accountByCode(prisma, orgId, code));
  }

  const journals: Journal[] = [
    {
      id: 'post_demo_us_open',
      date: '2025-01-01',
      amount: '25000',
      kind: 'opening',
      debitCode: 'DM-US-CASH',
      creditCode: 'DM-US-EQ',
      entityId: entityIds.ent_demo_us,
      description: 'Demo opening balance, US entity',
    },
    {
      id: 'post_demo_us_rev',
      date: '2026-02-10',
      amount: '8000',
      kind: 'journal',
      debitCode: 'DM-US-CASH',
      creditCode: 'DM-US-REV',
      entityId: entityIds.ent_demo_us,
      description: 'Demo service revenue, US entity',
    },
    {
      id: 'post_demo_us_rent',
      date: '2026-02-01',
      amount: '2400',
      kind: 'journal',
      debitCode: 'DM-US-RENT',
      creditCode: 'DM-US-CASH',
      entityId: entityIds.ent_demo_us,
      description: 'Demo rent, US entity',
    },
    {
      id: 'post_demo_in_open',
      date: '2025-01-01',
      amount: '500000',
      kind: 'opening',
      debitCode: INDIA_CODES.cash,
      creditCode: INDIA_CODES.equity,
      entityId: entityIds.ent_demo_in,
      description: 'Demo opening balance, India entity',
    },
    {
      id: 'post_demo_in_rev',
      date: '2026-03-15',
      amount: '120000',
      kind: 'journal',
      debitCode: INDIA_CODES.cash,
      creditCode: INDIA_CODES.revenue,
      entityId: entityIds.ent_demo_in,
      description: 'Demo sales, India entity',
    },
    {
      id: 'post_demo_in_rent',
      date: '2026-04-01',
      amount: '36000',
      kind: 'journal',
      debitCode: INDIA_CODES.rent,
      creditCode: INDIA_CODES.cash,
      entityId: entityIds.ent_demo_in,
      description: 'Demo rent, India entity',
    },
  ];
  for (const journal of journals) {
    await ensurePosting(prisma, orgId, journal, accounts);
  }

  const indiaAccounts = await prisma.account.updateMany({
    where: { org_id: orgId, currency_id: currencyIds.INR, entity_id: null },
    data: { entity_id: entityIds.ent_demo_in, modified_by: ACTOR },
  });
  const indiaPostings = await prisma.posting.updateMany({
    where: {
      org_id: orgId,
      entity_id: null,
      OR: [
        { debit_account: { currency_id: currencyIds.INR } },
        { credit_account: { currency_id: currencyIds.INR } },
      ],
    },
    data: { entity_id: entityIds.ent_demo_in, modified_by: ACTOR },
  });

  console.log(`Demo books on ${orgId} (reporting currency ${org.base_currency || 'unset'})`);
  console.log(`  currencies USD ${currencyIds.USD}, INR ${currencyIds.INR}`);
  console.log(`  entities ${entityIds.ent_demo_us}, ${entityIds.ent_demo_in}`);
  console.log(`  rates ${RATES.length}, journals ${journals.length}`);
  console.log(`  India entity assigned to ${indiaAccounts.count} accounts and ${indiaPostings.count} postings that had none`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
