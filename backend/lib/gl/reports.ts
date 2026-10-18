import { Prisma } from '@prisma/client';
import prisma from '../../src/lib/prisma';

export class ReportInputError extends Error {}

export type ReportParams = {
  orgId: string;
  from: string;
  to: string;
  entityIds: string[];
  currencyId?: string;
};

type SourceRow = {
  account_id: string;
  code: string | null;
  name: string | null;
  classification: string | null;
  account_types: string[] | null;
  currency_id: string | null;
  currency_code: string | null;
  opening_debit: unknown;
  opening_credit: unknown;
  period_debit: unknown;
  period_credit: unknown;
};

type RateRow = {
  from_currency_id: string;
  rate_type: string;
  rate: unknown;
  effective_date: Date | string;
};

type Rates = {
  average: Map<string, number>;
  closingEnd: Map<string, number>;
  closingOpen: Map<string, number>;
};

type Converted = {
  amount: number;
  rate: number | null;
  rate_missing: boolean;
};

const CASH_TYPES = new Set(['bank', 'checking', 'savings', 'cash', 'clearing', 'bank_cash']);
const FINANCING_TYPES = new Set(['capital', 'loan', 'dividend', 'equity', 'debt']);
const INVESTING_TYPES = new Set(['fixed_asset', 'investment', 'accum_depr', 'deposit']);

function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function dayOf(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function typesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((part) => String(part).trim().toLowerCase()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((part) => part.trim().replace(/^"|"$/g, '').toLowerCase())
      .filter(Boolean);
  }
  return [trimmed.toLowerCase()];
}

function entityOnPosting(entityIds: string[]): Prisma.Sql {
  if (entityIds.length === 0) return Prisma.empty;
  return Prisma.sql`AND p.entity_id = ANY(${entityIds})`;
}

function signed(classification: string | null, debit: number, credit: number): number {
  if (classification === 'asset' || classification === 'expense') return debit - credit;
  if (classification === 'liability' || classification === 'equity' || classification === 'income') return credit - debit;
  return debit - credit;
}

async function reportCurrency(orgId: string, currencyId?: string) {
  if (currencyId) {
    const found = await prisma.currency.findFirst({
      where: {
        OR: [{ id: currencyId }, { code: { equals: currencyId, mode: 'insensitive' } }],
      },
    });
    if (!found) throw new ReportInputError('Unknown currency_id');
    return found;
  }
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { basecurrency_id: true, base_currency: true, currency: true },
  });
  if (!org) throw new ReportInputError('Organization not found');
  if (org.currency) return org.currency;
  if (org.base_currency) {
    const found = await prisma.currency.findFirst({
      where: { code: { equals: org.base_currency, mode: 'insensitive' } },
    });
    if (found) return found;
  }
  throw new ReportInputError('Organization has no reporting currency');
}

async function loadRates(orgId: string, reportCurrencyId: string, from: string, to: string): Promise<Rates> {
  const rows = await prisma.$queryRaw<RateRow[]>`
    SELECT from_currency_id, rate_type::text AS rate_type, rate, effective_date
    FROM exchange_rate
    WHERE org_id = ${orgId}
      AND to_currency_id = ${reportCurrencyId}
      AND rate_type::text IN ('average', 'closing')
      AND effective_date <= ${to}::date
    ORDER BY effective_date DESC
  `;
  const rates: Rates = {
    average: new Map(),
    closingEnd: new Map(),
    closingOpen: new Map(),
  };
  for (const row of rows) {
    const rate = num(row.rate);
    if (!(rate > 0)) continue;
    const key = row.from_currency_id;
    const effective = dayOf(row.effective_date);
    if (row.rate_type === 'average' && !rates.average.has(key)) rates.average.set(key, rate);
    if (row.rate_type === 'closing' && !rates.closingEnd.has(key)) rates.closingEnd.set(key, rate);
    if (row.rate_type === 'closing' && effective < from && !rates.closingOpen.has(key)) {
      rates.closingOpen.set(key, rate);
    }
  }
  return rates;
}

function convert(amount: number, currencyId: string | null, reportCurrencyId: string, rate: number | undefined): Converted {
  if (!currencyId || currencyId === reportCurrencyId) {
    return { amount: round4(amount), rate: 1, rate_missing: false };
  }
  if (amount === 0) return { amount: 0, rate: rate ?? null, rate_missing: false };
  if (rate == null) return { amount: round4(amount), rate: null, rate_missing: true };
  return { amount: round4(amount * rate), rate, rate_missing: false };
}

async function loadSources(params: ReportParams): Promise<SourceRow[]> {
  const entitySql = entityOnPosting(params.entityIds);
  return prisma.$queryRaw<SourceRow[]>`
    WITH legs AS (
      SELECT
        p.debit_account_id AS account_id,
        p.amount AS debit_amount,
        0::numeric AS credit_amount,
        CASE WHEN p.kind = 'opening' THEN 'opening' ELSE 'period' END AS bucket
      FROM posting p
      WHERE p.org_id = ${params.orgId}
        AND p.debit_account_id IS NOT NULL
        AND p.amount IS NOT NULL
        AND p.status::text = 'active'
        AND COALESCE(p.kind, '') NOT IN ('duplicate', 'reversal')
        AND (
          (p.kind = 'opening' AND (p.value_date IS NULL OR p.value_date::date <= ${params.to}::date))
          OR (
            COALESCE(p.kind, '') <> 'opening'
            AND p.value_date IS NOT NULL
            AND p.value_date::date BETWEEN ${params.from}::date AND ${params.to}::date
          )
        )
        ${entitySql}
      UNION ALL
      SELECT
        p.credit_account_id AS account_id,
        0::numeric AS debit_amount,
        p.amount AS credit_amount,
        CASE WHEN p.kind = 'opening' THEN 'opening' ELSE 'period' END AS bucket
      FROM posting p
      WHERE p.org_id = ${params.orgId}
        AND p.credit_account_id IS NOT NULL
        AND p.amount IS NOT NULL
        AND p.status::text = 'active'
        AND COALESCE(p.kind, '') NOT IN ('duplicate', 'reversal')
        AND (
          (p.kind = 'opening' AND (p.value_date IS NULL OR p.value_date::date <= ${params.to}::date))
          OR (
            COALESCE(p.kind, '') <> 'opening'
            AND p.value_date IS NOT NULL
            AND p.value_date::date BETWEEN ${params.from}::date AND ${params.to}::date
          )
        )
        ${entitySql}
    )
    SELECT
      a.id AS account_id,
      a.code,
      a.name,
      a.classification::text AS classification,
      a.account_types,
      a.currency_id,
      c.code AS currency_code,
      COALESCE(SUM(l.debit_amount) FILTER (WHERE l.bucket = 'opening'), 0) AS opening_debit,
      COALESCE(SUM(l.credit_amount) FILTER (WHERE l.bucket = 'opening'), 0) AS opening_credit,
      COALESCE(SUM(l.debit_amount) FILTER (WHERE l.bucket = 'period'), 0) AS period_debit,
      COALESCE(SUM(l.credit_amount) FILTER (WHERE l.bucket = 'period'), 0) AS period_credit
    FROM account a
    JOIN legs l ON l.account_id = a.id
    LEFT JOIN currency c ON c.id = a.currency_id
    WHERE a.org_id = ${params.orgId}
    GROUP BY a.id, a.code, a.name, a.classification, a.account_types, a.currency_id, c.code
    ORDER BY a.code NULLS LAST, a.name
  `;
}

function envelope(params: ReportParams, currency: { id: string; code: string }) {
  return {
    report_currency: currency.code,
    report_currency_id: currency.id,
    from: params.from,
    to: params.to,
    entity_ids: params.entityIds,
  };
}

function isCashAccount(types: string[], name: string | null): boolean {
  if (types.some((type) => CASH_TYPES.has(type))) return true;
  const label = (name || '').toLowerCase();
  return (
    label.includes('cash on hand') ||
    label.includes('checking account') ||
    label.includes('savings account') ||
    label.includes('undeposited funds')
  );
}

function activityOf(classification: string | null, types: string[], name: string | null): 'operating' | 'investing' | 'financing' {
  if (classification === 'equity' || types.some((type) => FINANCING_TYPES.has(type))) return 'financing';
  const label = (name || '').toLowerCase();
  if (label.includes('equity') || label.includes('loan') || label.includes('capital') || label.includes('borrowing')) {
    return 'financing';
  }
  if (types.some((type) => INVESTING_TYPES.has(type))) return 'investing';
  if (label.includes('fixed asset') || label.includes('investment') || label.includes('property') || label.includes('equipment')) {
    return 'investing';
  }
  return 'operating';
}

export async function getTrialBalance(params: ReportParams) {
  const currency = await reportCurrency(params.orgId, params.currencyId);
  const [sources, rates] = await Promise.all([
    loadSources(params),
    loadRates(params.orgId, currency.id, params.from, params.to),
  ]);
  const rows = sources.map((row) => {
    const openingDebit = num(row.opening_debit);
    const openingCredit = num(row.opening_credit);
    const periodDebit = num(row.period_debit);
    const periodCredit = num(row.period_credit);
    const openRate = rates.closingOpen.get(row.currency_id ?? '');
    const periodRate = rates.average.get(row.currency_id ?? '');
    const openingDebitFx = convert(openingDebit, row.currency_id, currency.id, openRate);
    const openingCreditFx = convert(openingCredit, row.currency_id, currency.id, openRate);
    const periodDebitFx = convert(periodDebit, row.currency_id, currency.id, periodRate);
    const periodCreditFx = convert(periodCredit, row.currency_id, currency.id, periodRate);
    const rateMissing = openingDebitFx.rate_missing || openingCreditFx.rate_missing || periodDebitFx.rate_missing || periodCreditFx.rate_missing;
    return {
      account_id: row.account_id,
      code: row.code,
      name: row.name,
      classification: row.classification,
      account_currency: row.currency_code,
      opening_debit: openingDebitFx.amount,
      opening_credit: openingCreditFx.amount,
      period_debit: periodDebitFx.amount,
      period_credit: periodCreditFx.amount,
      opening_rate: openingDebitFx.rate ?? openingCreditFx.rate,
      period_rate: periodDebitFx.rate ?? periodCreditFx.rate,
      rate_missing: rateMissing,
    };
  });
  const totals = rows.reduce(
    (sum, row) => ({
      opening_debit: round4(sum.opening_debit + row.opening_debit),
      opening_credit: round4(sum.opening_credit + row.opening_credit),
      period_debit: round4(sum.period_debit + row.period_debit),
      period_credit: round4(sum.period_credit + row.period_credit),
    }),
    { opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 0 }
  );
  return { ...envelope(params, currency), rows, totals };
}

export async function getIncomeStatement(params: ReportParams) {
  const currency = await reportCurrency(params.orgId, params.currencyId);
  const [sources, rates] = await Promise.all([
    loadSources(params),
    loadRates(params.orgId, currency.id, params.from, params.to),
  ]);
  const rows = sources
    .filter((row) => row.classification === 'income' || row.classification === 'expense')
    .map((row) => {
      const source = signed(row.classification, num(row.period_debit), num(row.period_credit));
      const converted = convert(source, row.currency_id, currency.id, rates.average.get(row.currency_id ?? ''));
      return {
        account_id: row.account_id,
        code: row.code,
        name: row.name,
        classification: row.classification,
        account_currency: row.currency_code,
        amount: converted.amount,
        source_amount: round4(source),
        rate: converted.rate,
        rate_missing: converted.rate_missing,
      };
    })
    .filter((row) => row.source_amount !== 0);
  return { ...envelope(params, currency), rows };
}

export async function getBalanceSheet(params: ReportParams) {
  const currency = await reportCurrency(params.orgId, params.currencyId);
  const [sources, rates] = await Promise.all([
    loadSources(params),
    loadRates(params.orgId, currency.id, params.from, params.to),
  ]);
  const rows = sources
    .filter((row) => row.classification === 'asset' || row.classification === 'liability' || row.classification === 'equity')
    .map((row) => {
      const openingSource = signed(row.classification, num(row.opening_debit), num(row.opening_credit));
      const closingSource = signed(
        row.classification,
        num(row.opening_debit) + num(row.period_debit),
        num(row.opening_credit) + num(row.period_credit)
      );
      const opening = convert(openingSource, row.currency_id, currency.id, rates.closingOpen.get(row.currency_id ?? ''));
      const closing = convert(closingSource, row.currency_id, currency.id, rates.closingEnd.get(row.currency_id ?? ''));
      return {
        account_id: row.account_id,
        code: row.code,
        name: row.name,
        classification: row.classification,
        account_currency: row.currency_code,
        opening_balance: opening.amount,
        closing_balance: closing.amount,
        source_opening_balance: round4(openingSource),
        source_closing_balance: round4(closingSource),
        opening_rate: opening.rate,
        rate: closing.rate,
        rate_missing: opening.rate_missing || closing.rate_missing,
      };
    })
    .filter((row) => row.source_opening_balance !== 0 || row.source_closing_balance !== 0);
  return { ...envelope(params, currency), rows };
}

type MovementRow = {
  amount: unknown;
  debit_id: string;
  debit_name: string | null;
  debit_classification: string | null;
  debit_types: string[] | null;
  debit_currency_id: string | null;
  credit_id: string;
  credit_name: string | null;
  credit_classification: string | null;
  credit_types: string[] | null;
  credit_currency_id: string | null;
};

export async function getCashFlowStatement(params: ReportParams) {
  const currency = await reportCurrency(params.orgId, params.currencyId);
  const entitySql = entityOnPosting(params.entityIds);
  const [sources, rates, movements] = await Promise.all([
    loadSources(params),
    loadRates(params.orgId, currency.id, params.from, params.to),
    prisma.$queryRaw<MovementRow[]>`
      SELECT
        p.amount,
        d.id AS debit_id,
        d.name AS debit_name,
        d.classification::text AS debit_classification,
        d.account_types AS debit_types,
        d.currency_id AS debit_currency_id,
        c.id AS credit_id,
        c.name AS credit_name,
        c.classification::text AS credit_classification,
        c.account_types AS credit_types,
        c.currency_id AS credit_currency_id
      FROM posting p
      JOIN account d ON d.id = p.debit_account_id AND d.org_id = p.org_id
      JOIN account c ON c.id = p.credit_account_id AND c.org_id = p.org_id
      WHERE p.org_id = ${params.orgId}
        AND p.amount IS NOT NULL
        AND p.status::text = 'active'
        AND COALESCE(p.kind, '') NOT IN ('opening', 'duplicate', 'reversal')
        AND p.value_date IS NOT NULL
        AND p.value_date::date BETWEEN ${params.from}::date AND ${params.to}::date
        ${entitySql}
    `,
  ]);

  const grouped = new Map<string, {
    activity: 'operating' | 'investing' | 'financing';
    account_id: string;
    account_name: string | null;
    net_cash: number;
    rate_missing: boolean;
  }>();

  for (const movement of movements) {
    const amount = num(movement.amount);
    const debitCash = isCashAccount(typesOf(movement.debit_types), movement.debit_name);
    const creditCash = isCashAccount(typesOf(movement.credit_types), movement.credit_name);
    if (debitCash === creditCash) continue;
    const cashCurrency = debitCash ? movement.debit_currency_id : movement.credit_currency_id;
    const contraId = debitCash ? movement.credit_id : movement.debit_id;
    const contraName = debitCash ? movement.credit_name : movement.debit_name;
    const contraClass = debitCash ? movement.credit_classification : movement.debit_classification;
    const contraTypes = typesOf(debitCash ? movement.credit_types : movement.debit_types);
    const delta = debitCash ? amount : -amount;
    const converted = convert(delta, cashCurrency, currency.id, rates.average.get(cashCurrency ?? ''));
    const activity = activityOf(contraClass, contraTypes, contraName);
    const key = `${activity}:${contraId}`;
    const current = grouped.get(key) ?? {
      activity,
      account_id: contraId,
      account_name: contraName,
      net_cash: 0,
      rate_missing: false,
    };
    current.net_cash = round4(current.net_cash + converted.amount);
    current.rate_missing = current.rate_missing || converted.rate_missing;
    grouped.set(key, current);
  }

  const rows = [...grouped.values()].filter((row) => row.net_cash !== 0);
  const totals = { operating: 0, investing: 0, financing: 0 };
  for (const row of rows) totals[row.activity] = round4(totals[row.activity] + row.net_cash);

  let openingCash = 0;
  let closingCash = 0;
  let cashRateMissing = false;
  for (const row of sources) {
    if (!isCashAccount(typesOf(row.account_types), row.name)) continue;
    const openingSource = num(row.opening_debit) - num(row.opening_credit);
    const closingSource = num(row.opening_debit) + num(row.period_debit) - (num(row.opening_credit) + num(row.period_credit));
    const opening = convert(openingSource, row.currency_id, currency.id, rates.closingOpen.get(row.currency_id ?? ''));
    const closing = convert(closingSource, row.currency_id, currency.id, rates.closingEnd.get(row.currency_id ?? ''));
    openingCash = round4(openingCash + opening.amount);
    closingCash = round4(closingCash + closing.amount);
    cashRateMissing = cashRateMissing || opening.rate_missing || closing.rate_missing;
  }

  return {
    ...envelope(params, currency),
    summary: {
      opening_cash: openingCash,
      closing_cash: closingCash,
      net_change: round4(totals.operating + totals.investing + totals.financing),
      operating_total: totals.operating,
      investing_total: totals.investing,
      financing_total: totals.financing,
      rate_missing: cashRateMissing || rows.some((row) => row.rate_missing),
    },
    rows,
  };
}

type PostingListRow = {
  id: string;
  value_date: Date | string | null;
  name: string | null;
  description: string | null;
  amount: unknown;
  kind: string | null;
  entity_id: string | null;
  entity_name: string | null;
  debit_account_id: string | null;
  debit_account_name: string | null;
  debit_account_code: string | null;
  debit_currency_id: string | null;
  debit_currency: string | null;
  credit_account_id: string | null;
  credit_account_name: string | null;
  credit_account_code: string | null;
  credit_currency_id: string | null;
  credit_currency: string | null;
};

export async function getPostingList(params: ReportParams) {
  const currency = await reportCurrency(params.orgId, params.currencyId);
  const entitySql = entityOnPosting(params.entityIds);
  const [rows, rates] = await Promise.all([
    prisma.$queryRaw<PostingListRow[]>`
      SELECT
        p.id,
        p.value_date,
        p.name,
        p.description,
        p.amount,
        p.kind,
        p.entity_id,
        e.name AS entity_name,
        d.id AS debit_account_id,
        d.name AS debit_account_name,
        d.code AS debit_account_code,
        d.currency_id AS debit_currency_id,
        dc.code AS debit_currency,
        c.id AS credit_account_id,
        c.name AS credit_account_name,
        c.code AS credit_account_code,
        c.currency_id AS credit_currency_id,
        cc.code AS credit_currency
      FROM posting p
      LEFT JOIN account d ON d.id = p.debit_account_id
      LEFT JOIN account c ON c.id = p.credit_account_id
      LEFT JOIN currency dc ON dc.id = d.currency_id
      LEFT JOIN currency cc ON cc.id = c.currency_id
      LEFT JOIN entity e ON e.id = p.entity_id
      WHERE p.org_id = ${params.orgId}
        AND p.status::text = 'active'
        AND COALESCE(p.kind, '') NOT IN ('duplicate', 'reversal')
        AND p.value_date IS NOT NULL
        AND p.value_date::date BETWEEN ${params.from}::date AND ${params.to}::date
        ${entitySql}
      ORDER BY p.value_date, p.id
      LIMIT 1000
    `,
    loadRates(params.orgId, currency.id, params.from, params.to),
  ]);

  return {
    ...envelope(params, currency),
    rows: rows.map((row) => {
      const source = num(row.amount);
      const currencyId = row.debit_currency_id || row.credit_currency_id;
      const rate = row.kind === 'opening'
        ? rates.closingOpen.get(currencyId ?? '')
        : rates.average.get(currencyId ?? '');
      const converted = convert(source, currencyId, currency.id, rate);
      return {
        id: row.id,
        value_date: row.value_date ? dayOf(row.value_date) : null,
        name: row.name,
        description: row.description,
        kind: row.kind,
        entity_id: row.entity_id,
        entity_name: row.entity_name,
        debit_account_id: row.debit_account_id,
        debit_account_name: row.debit_account_name,
        debit_account_code: row.debit_account_code,
        credit_account_id: row.credit_account_id,
        credit_account_name: row.credit_account_name,
        credit_account_code: row.credit_account_code,
        account_currency: row.debit_currency || row.credit_currency,
        amount: round4(source),
        converted_amount: converted.amount,
        rate: converted.rate,
        rate_missing: converted.rate_missing,
      };
    }),
  };
}
