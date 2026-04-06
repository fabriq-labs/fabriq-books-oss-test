/**
 * Setup script for currency_master.
 * Loads from Excel/CSV (currency_master.csv) and upserts records. Status defaults to "Active" when empty.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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

/**
 * Load currency_master from CSV and upsert each row.
 * CSV columns: id, base_currency, from_currency, currency_value, name, status, org_id
 * status defaults to "Active" when empty.
 */
export async function setupCurrencyMaster(csvPath: string): Promise<void> {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Currency master CSV not found: ${csvPath}`);
  }
  const rows = await loadCsvData(csvPath);
  const effectiveFrom = new Date();

  for (const row of rows) {
    const id = row.id?.trim();
    const org_id = row.org_id?.trim();
    if (!id || !org_id) {
      console.warn(`  ⚠️  Skipping row missing id or org_id:`, row);
      continue;
    }
    const status = (row.status?.trim() || 'Active') as string;
    const currency_value =
      row.currency_value != null && row.currency_value !== ''
        ? parseFloat(row.currency_value)
        : 1;

    await prisma.currency_master.upsert({
      where: { id },
      update: {
        base_currency: row.base_currency,
        from_currency: row.from_currency,
        effective_from: row.effective_from ? new Date(row.effective_from) : effectiveFrom,
        currency_value,
        status,
        name: row.name?.trim() || null,
        org_id,
        modified_at: new Date(),
      },
      create: {
        id,
        base_currency: row.base_currency,
        from_currency: row.from_currency,
        effective_from: row.effective_from ? new Date(row.effective_from) : effectiveFrom,
        currency_value,
        status,
        name: row.name?.trim() || null,
        org_id,
      },
    });
  }
}

/** Run when executed as script: npx ts-node prisma/setup-currency-master.ts <path-to-csv> */
async function main() {
  const csvPath =
    process.env.CURRENCY_MASTER_CSV ||
    process.argv[2] ||
    path.join(__dirname, 'setup-IN', 'currency_master.csv');
  console.log(`Setting up currency master from: ${csvPath}`);
  await setupCurrencyMaster(csvPath);
  console.log('  ✓ Currency master setup complete');
  await prisma.$disconnect();
}

const isRunDirect = require.main === module;
if (isRunDirect) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
