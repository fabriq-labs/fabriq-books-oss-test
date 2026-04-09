/**
 * Seed `currency` from CSV (modern or legacy currency_master-shaped files).
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../src/lib/prisma';

const csv = require('csv-parser');

interface CsvRow {
  [key: string]: string;
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

export interface ParsedCurrencyRow {
  id?: string;
  code: string;
  name: string;
  symbol: string | null;
  decimal_places: number;
  is_active: boolean;
  org_id: string;
}

/** Normalize one CSV row (supports currency.csv or legacy currency_master.csv). */
export function parseCurrencyRow(row: CsvRow): ParsedCurrencyRow | null {
  const org_id = row.org_id?.trim();
  const legacyCode = row.base_currency?.trim() || row.from_currency?.trim();
  const code = (row.code?.trim() || legacyCode || '').toUpperCase();
  if (!code || !org_id) {
    return null;
  }

  const id = row.id?.trim() || undefined;
  const name = row.name?.trim() || code;
  const symbol = row.symbol?.trim() || null;
  const decimal_places = row.decimal_places
    ? parseInt(row.decimal_places, 10)
    : 2;
  const is_active =
    row.is_active === 'false'
      ? false
      : row.status
        ? row.status === 'Active'
        : true;

  return { id, code, name, symbol, decimal_places, is_active, org_id };
}

/**
 * Upsert currencies from CSV before entity / item FKs.
 *
 * Modern CSV: id?,code,name,symbol,decimal_places,is_active,org_id
 * Legacy (currency_master): id,base_currency,from_currency,currency_value,name,status,org_id
 */
export async function setupCurrency(csvPath: string): Promise<void> {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Currency CSV not found: ${csvPath}`);
  }

  const rows = await loadCsvData(csvPath);

  for (const row of rows) {
    const parsed = parseCurrencyRow(row);
    if (!parsed) {
      console.warn(`  ⚠️  Skipping row missing code or org_id:`, row);
      continue;
    }

    const { id, code, name, symbol, decimal_places, is_active, org_id } =
      parsed;

    const existing = await prisma.currency.findUnique({ where: { code } });
    if (existing) {
      await prisma.currency.update({
        where: { code },
        data: {
          name,
          symbol,
          decimal_places,
          is_active,
          org_id,
        },
      });
    } else {
      await prisma.currency.create({
        data: {
          ...(id ? { id } : {}),
          code,
          name,
          symbol,
          decimal_places,
          is_active,
          org_id,
        },
      });
    }
  }
}

async function main() {
  const csvPath =
    process.env.CURRENCY_CSV ||
    process.argv[2] ||
    path.join(__dirname, 'setup-IN', 'currency.csv');
  console.log(`Setting up currencies from: ${csvPath}`);
  await setupCurrency(csvPath);
  console.log('  ✓ Currency setup complete');
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
