/**
 * Chart of accounts seed.
 *
 * Templates are the production operating charts:
 *   backend/lib/gl/charts/us-ca.json  — setup-US_CA, currency USD
 *   backend/lib/gl/charts/india.json  — setup-IN, currency INR
 *
 * Those two trees are the same 53 accounts. The geo chooses the currency
 * written on each row. One organization gets one chart: a later seed with
 * the other geo updates the shared codes.
 *
 * Kernel names: classification is lowercase, account_types is the old `type`
 * list in lowercase, currency_id points at currency. Re-runs upsert on
 * (org_id, code) and leave balances, account numbers, and entity links alone.
 */
import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import prisma from '../../src/lib/prisma';

const ORG_SYSTEM = 'org_system';
const SOURCE_SYSTEM = 'chart_seed';

const CLASSIFICATION = {
  Assets: 'asset',
  Liabilities: 'liability',
  Equity: 'equity',
  Income: 'income',
  Expense: 'expense',
} as const;

type KernelClassification = (typeof CLASSIFICATION)[keyof typeof CLASSIFICATION];

export const CHARTS = {
  'us-ca': {
    file: 'us-ca.json',
    currencyCode: 'USD',
    currencyId: 'curr_kernel_usd',
    currencyName: 'US Dollar',
    symbol: '$',
  },
  india: {
    file: 'india.json',
    currencyCode: 'INR',
    currencyId: 'curr_kernel_inr',
    currencyName: 'Indian Rupee',
    symbol: '₹',
  },
} as const;

export type ChartGeo = keyof typeof CHARTS;

type AccountTemplate = {
  name: string;
  classification: string;
  types?: string[];
  code?: string;
  children?: AccountTemplate[];
};

export type SeedChartResult = {
  geo: ChartGeo;
  orgId: string;
  currencyCode: string;
  currencyId: string;
  created: number;
  existing: number;
  total: number;
  byClassification: Record<KernelClassification, number>;
};

function isChartGeo(value: string): value is ChartGeo {
  return Object.prototype.hasOwnProperty.call(CHARTS, value);
}

export function parseChartGeo(value: string | undefined): ChartGeo {
  if (value && isChartGeo(value)) return value;
  const choices = Object.keys(CHARTS).join(', ');
  throw new Error(`Chart geo must be one of: ${choices}`);
}

function loadTemplate(geo: ChartGeo): AccountTemplate[] {
  const file = path.join(__dirname, 'charts', CHARTS[geo].file);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as AccountTemplate[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Chart template ${CHARTS[geo].file} is empty`);
  }
  return parsed;
}

function classificationOf(value: string): KernelClassification {
  const mapped = CLASSIFICATION[value as keyof typeof CLASSIFICATION];
  if (!mapped) {
    throw new Error(`Unknown account classification "${value}"`);
  }
  return mapped;
}

function accountTypesOf(types: string[] | undefined): string[] {
  return (types ?? []).map((type) => type.trim().toLowerCase()).filter(Boolean);
}

function accountId(orgId: string, code: string): string {
  const id = `acco_${orgId}_${code}`.replace(/[^a-zA-Z0-9_]/g, '_');
  if (id.length > 50) {
    throw new Error(`Account id is longer than 50 characters: ${id}`);
  }
  return id;
}

async function ensureCurrency(geo: ChartGeo, db: PrismaClient): Promise<string> {
  const spec = CHARTS[geo];
  const existing = await db.currency.findUnique({ where: { code: spec.currencyCode } });
  if (existing) return existing.id;

  const created = await db.currency.create({
    data: {
      id: spec.currencyId,
      code: spec.currencyCode,
      name: spec.currencyName,
      symbol: spec.symbol,
      decimal_places: 2,
      is_active: true,
      org_id: ORG_SYSTEM,
    },
  });
  return created.id;
}

export async function seedChartOfAccounts(
  geoInput: string,
  orgId: string,
  db: PrismaClient = prisma
): Promise<SeedChartResult> {
  const geo = parseChartGeo(geoInput);
  const org = await db.org.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) {
    throw new Error(`Organization ${orgId} does not exist. Run setup:kernel first.`);
  }

  const currencyId = await ensureCurrency(geo, db);
  const template = loadTemplate(geo);
  let created = 0;
  let existing = 0;
  const byClassification: Record<KernelClassification, number> = {
    asset: 0,
    liability: 0,
    equity: 0,
    income: 0,
    expense: 0,
  };

  async function upsertNode(node: AccountTemplate, parentId: string | null): Promise<void> {
    if (!node.code) {
      throw new Error(`Chart account "${node.name}" is missing a code`);
    }
    const code = node.code;
    const classification = classificationOf(node.classification);
    const account_types = accountTypesOf(node.types);
    const source_record_id = `${geo}:${code}`;
    const current = await db.account.findUnique({
      where: { org_id_code: { org_id: orgId, code } },
      select: { id: true },
    });

    const data = {
      name: node.name,
      classification,
      account_types,
      parent_account_id: parentId,
      currency_id: currencyId,
      source_system_id: SOURCE_SYSTEM,
      source_record_id,
    };

    const row = current
      ? await db.account.update({
          where: { id: current.id },
          data,
          select: { id: true },
        })
      : await db.account.create({
          data: {
            id: accountId(orgId, code),
            org_id: orgId,
            code,
            is_active: true,
            ...data,
          },
          select: { id: true },
        });

    if (current) existing += 1;
    else created += 1;
    byClassification[classification] += 1;

    for (const child of node.children ?? []) {
      await upsertNode(child, row.id);
    }
  }

  for (const node of template) {
    await upsertNode(node, null);
  }

  return {
    geo,
    orgId,
    currencyCode: CHARTS[geo].currencyCode,
    currencyId,
    created,
    existing,
    total: created + existing,
    byClassification,
  };
}
