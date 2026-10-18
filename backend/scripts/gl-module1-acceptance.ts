/**
 * Module 1 acceptance checks against a running API.
 *   cd backend && npx ts-node --transpile-only -r dotenv/config scripts/gl-module1-acceptance.ts
 */
import prisma from '../src/lib/prisma';

const API = process.env.ACCEPTANCE_API || 'http://127.0.0.1:4000';
const FROM = '2026-01-01';
const TO = '2026-12-31';

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }),
  });
  const json = await res.json() as { token?: string; error?: string };
  if (!res.ok || !json.token) throw new Error(`login failed ${res.status}`);
  return json.token;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function near(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.02;
}

async function ensureCurrency(token: string, code: string, name: string) {
  const existing = await prisma.currency.findUnique({ where: { code } });
  if (existing) return existing.id;
  const created = await api(token, '/api/currency/view/currency_view', {
    method: 'POST',
    body: JSON.stringify({ code, name, symbol: code, decimal_places: 2, is_active: true, org_id: 'org_system' }),
  });
  const id = created.json?.data?.id as string | undefined;
  if (!id) throw new Error(`could not create currency ${code}: ${created.status} ${JSON.stringify(created.json)}`);
  return id;
}

async function ensureEntity(token: string, name: string, headquarters: boolean) {
  const existing = await prisma.entity.findFirst({ where: { name, org_id: 'org_kernel' } });
  if (existing) return existing.id;
  const created = await api(token, '/api/entity/view/entity_view', {
    method: 'POST',
    body: JSON.stringify({ name, legal_name: name, is_headquarters: headquarters, currency_id: 'curr_kernel_usd' }),
  });
  const id = created.json?.data?.id as string | undefined;
  if (!id) throw new Error(`could not create entity ${name}: ${created.status} ${JSON.stringify(created.json)}`);
  return id;
}

async function ensureAccount(
  token: string,
  code: string,
  name: string,
  classification: string,
  currencyId: string,
  types: string[]
) {
  const existing = await prisma.account.findFirst({ where: { org_id: 'org_kernel', code } });
  if (existing) return existing.id;
  const created = await api(token, '/api/account/view/account_view', {
    method: 'POST',
    body: JSON.stringify({
      name,
      code,
      classification,
      account_types: types,
      currency_id: currencyId,
      is_active: true,
    }),
  });
  const id = created.json?.data?.id as string | undefined;
  if (!id) throw new Error(`could not create account ${code}: ${created.status} ${JSON.stringify(created.json)}`);
  return id;
}

async function main() {
  const token = await login();
  const eur = await ensureCurrency(token, 'EUR', 'Euro');
  const gbp = await ensureCurrency(token, 'GBP', 'Pound');
  const entityA = await ensureEntity(token, 'Module1 Entity A', true);
  const entityB = await ensureEntity(token, 'Module1 Entity B', false);
  const secondHq = await api(token, '/api/entity/view/entity_view', {
    method: 'POST',
    body: JSON.stringify({ name: 'Module1 Second HQ', legal_name: 'Module1 Second HQ', is_headquarters: true }),
  });
  record(
    'one headquarters',
    secondHq.status >= 400 && String(secondHq.json?.error || secondHq.json?.message || '').toLowerCase().includes('headquarters'),
    `status ${secondHq.status}`
  );

  const cash = await ensureAccount(token, 'M1-CASH', 'Operating Cash', 'asset', 'curr_kernel_usd', ['cash', 'bank']);
  const rent = await ensureAccount(token, 'M1-RENT', 'Rent Expense', 'expense', 'curr_kernel_usd', ['expense']);
  const equity = await ensureAccount(token, 'M1-EQ', 'Owner Equity', 'equity', 'curr_kernel_usd', ['equity']);
  const fxCash = await ensureAccount(token, 'M1-FX', 'FX Cash', 'asset', eur, ['cash']);
  const fxEquity = await ensureAccount(token, 'M1-FXEQ', 'FX Equity', 'equity', eur, ['equity']);
  const rawCash = await ensureAccount(token, 'M1-RAW', 'Unrated Cash', 'asset', gbp, ['cash']);
  const rawEquity = await ensureAccount(token, 'M1-RAWEQ', 'Unrated Equity', 'equity', gbp, ['equity']);

  await prisma.posting.deleteMany({
    where: { org_id: 'org_kernel', description: { startsWith: 'module1-accept' } },
  });
  await prisma.exchange_rate.deleteMany({
    where: { org_id: 'org_kernel', from_currency_id: { in: [eur, gbp] }, to_currency_id: 'curr_kernel_usd' },
  });

  const post = async (body: Record<string, unknown>) => {
    const result = await api(token, '/api/posting/view/posting_view', { method: 'POST', body: JSON.stringify(body) });
    if (result.status >= 300 || !result.json?.data?.id) {
      throw new Error(`posting failed ${result.status} ${JSON.stringify(result.json)}`);
    }
  };

  await post({
    description: 'module1-accept period A',
    value_date: '2026-06-15T00:00:00.000Z',
    posting_date: '2026-06-15T00:00:00.000Z',
    amount: '80',
    kind: 'journal',
    status: 'active',
    debit_account_id: rent,
    credit_account_id: cash,
    entity_id: entityA,
  });
  await post({
    description: 'module1-accept period B',
    value_date: '2026-06-16T00:00:00.000Z',
    posting_date: '2026-06-16T00:00:00.000Z',
    amount: '30',
    kind: 'journal',
    status: 'active',
    debit_account_id: rent,
    credit_account_id: cash,
    entity_id: entityB,
  });
  await post({
    description: 'module1-accept null entity',
    value_date: '2026-06-17T00:00:00.000Z',
    posting_date: '2026-06-17T00:00:00.000Z',
    amount: '5',
    kind: 'journal',
    status: 'active',
    debit_account_id: rent,
    credit_account_id: cash,
    entity_id: null,
  });
  await post({
    description: 'module1-accept opening',
    value_date: '2026-01-01T00:00:00.000Z',
    posting_date: '2026-01-01T00:00:00.000Z',
    amount: '500',
    kind: 'opening',
    status: 'active',
    debit_account_id: cash,
    credit_account_id: equity,
    entity_id: entityA,
  });
  await post({
    description: 'module1-accept fx rated',
    value_date: '2026-06-20T00:00:00.000Z',
    posting_date: '2026-06-20T00:00:00.000Z',
    amount: '100',
    kind: 'journal',
    status: 'active',
    debit_account_id: fxCash,
    credit_account_id: fxEquity,
    entity_id: entityA,
  });
  await post({
    description: 'module1-accept fx missing',
    value_date: '2026-06-21T00:00:00.000Z',
    posting_date: '2026-06-21T00:00:00.000Z',
    amount: '40',
    kind: 'journal',
    status: 'active',
    debit_account_id: rawCash,
    credit_account_id: rawEquity,
    entity_id: entityA,
  });

  const rate = await api(token, '/api/exchange_rate/view/exchange_rate_view', {
    method: 'POST',
    body: JSON.stringify({
      from_currency_id: eur,
      to_currency_id: 'curr_kernel_usd',
      effective_date: '2026-06-30T00:00:00.000Z',
      rate: '2',
      rate_type: 'closing',
    }),
  });
  if (rate.status >= 300) throw new Error(`rate failed ${rate.status} ${JSON.stringify(rate.json)}`);

  const report = async (path: string, entityIds: string[] = []) => {
    const params = new URLSearchParams({ from: FROM, to: TO });
    for (const id of entityIds) params.append('entity_id', id);
    const result = await api(token, `/api/gl/reports/${path}?${params}`);
    if (result.status !== 200) throw new Error(`${path} ${result.status} ${JSON.stringify(result.json)}`);
    return result.json.data;
  };

  const tb = await report('trial-balance');
  const rentRow = tb.rows.find((row: { name?: string }) => row.name === 'Rent Expense');
  const cashRow = tb.rows.find((row: { name?: string }) => row.name === 'Operating Cash');
  const equityRow = tb.rows.find((row: { name?: string }) => row.name === 'Owner Equity');
  record(
    'trial balance debits equal credits',
    near(tb.totals.period_debit, tb.totals.period_credit) && near(rentRow?.period_debit, 115) && near(cashRow?.period_credit, 115),
    `period debit ${tb.totals.period_debit} credit ${tb.totals.period_credit}; rent ${rentRow?.period_debit}; cash credit ${cashRow?.period_credit}`
  );
  record(
    'opening stays out of the period column',
    near(equityRow?.opening_credit, 500) && near(equityRow?.period_debit, 0) && near(equityRow?.period_credit, 0),
    `opening credit ${equityRow?.opening_credit} period debit ${equityRow?.period_debit} period credit ${equityRow?.period_credit}`
  );

  const income = await report('income-statement');
  const classes = new Set(income.rows.map((row: { classification?: string }) => row.classification));
  const incomeRent = income.rows.find((row: { name?: string }) => row.name === 'Rent Expense');
  const incomeCash = income.rows.find((row: { name?: string }) => row.name === 'Operating Cash');
  record(
    'income statement is income and expense only',
    [...classes].every((value) => value === 'income' || value === 'expense') && near(incomeRent?.amount, 115) && !incomeCash,
    `classes ${[...classes].join(',') || 'none'}; rent ${incomeRent?.amount}`
  );

  const onlyB = await report('trial-balance', [entityB]);
  const rentB = onlyB.rows.find((row: { name?: string }) => row.name === 'Rent Expense');
  const cashB = onlyB.rows.find((row: { name?: string }) => row.name === 'Operating Cash');
  record(
    'entity filter excludes the other entity and null entity',
    near(rentB?.period_debit, 30) && near(cashB?.period_credit, 30) && !onlyB.rows.some((row: { name?: string }) => row.name === 'Owner Equity'),
    `rent ${rentB?.period_debit} cash credit ${cashB?.period_credit}`
  );
  record(
    'unfiltered report uses the org reporting currency',
    tb.report_currency === 'USD' && near(rentRow?.period_debit, 115),
    `currency ${tb.report_currency}`
  );

  const listB = await report('posting-list', [entityB]);
  const descriptions = listB.rows.map((row: { description?: string }) => row.description);
  record(
    'posting on entity A is absent when filtered to entity B',
    descriptions.includes('module1-accept period B') && !descriptions.includes('module1-accept period A') && !descriptions.includes('module1-accept null entity'),
    descriptions.filter((item: string) => String(item).startsWith('module1-accept')).join(', ')
  );

  const sheet = await report('balance-sheet');
  const rated = sheet.rows.find((row: { name?: string }) => row.name === 'FX Cash');
  const unrated = sheet.rows.find((row: { name?: string }) => row.name === 'Unrated Cash');
  record(
    'closing rate of 2 doubles the balance',
    near(rated?.closing_balance, 200) && rated?.rate === 2 && rated?.rate_missing === false,
    `closing ${rated?.closing_balance} rate ${rated?.rate} missing ${rated?.rate_missing}`
  );
  record(
    'missing rate keeps the source amount and sets rate_missing',
    near(unrated?.closing_balance, 40) && near(unrated?.source_closing_balance, 40) && unrated?.rate_missing === true && unrated?.rate !== 1,
    `closing ${unrated?.closing_balance} source ${unrated?.source_closing_balance} rate ${unrated?.rate} missing ${unrated?.rate_missing}`
  );

  const failed = checks.filter((check) => !check.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
