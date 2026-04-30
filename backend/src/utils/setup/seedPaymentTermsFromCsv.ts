import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../lib/prisma';
const csv = require('csv-parser');

interface CsvRow {
  [key: string]: string;
}

interface SeedPaymentTermsFromCsvOptions {
  prismaClient?: typeof prisma;
  csvPath?: string;
  orgIdOverride?: string;
  legalEntityIdOverride?: string | null;
  profileLabel?: string;
}

interface SeedCounts {
  created: number;
  updated: number;
  total: number;
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

export async function seedPaymentTermsFromCsv(
  options: SeedPaymentTermsFromCsvOptions = {}
): Promise<SeedCounts> {
  const {
    prismaClient = prisma,
    csvPath = path.join(path.resolve(__dirname, '..', '..', '..'), 'prisma', 'setup-IN', 'payment_terms.csv'),
    orgIdOverride,
    legalEntityIdOverride,
    profileLabel = 'indian-demo',
  } = options;

  console.log(`📋 Loading payment terms from CSV (${profileLabel})...`);
  const paymentTermsData = await loadCsvData(csvPath);
  let created = 0;
  let updated = 0;

  for (const row of paymentTermsData) {
    const existing = await prismaClient.payment_terms.findUnique({
      where: { id: row.id },
      select: { id: true },
    });

    const orgId = orgIdOverride ?? row.org_id;
    const legalEntityId =
      legalEntityIdOverride !== undefined ? legalEntityIdOverride : row.legal_entity_id || null;

    await prismaClient.payment_terms.upsert({
      where: { id: row.id },
      update: {
        payment_terms: row.payment_terms,
        description: row.description,
        no_of_days: row.no_of_days ? parseInt(row.no_of_days, 10) : null,
        org_id: orgId,
        legal_entity_id: legalEntityId,
      },
      create: {
        id: row.id,
        payment_terms: row.payment_terms,
        description: row.description,
        no_of_days: row.no_of_days ? parseInt(row.no_of_days, 10) : null,
        org_id: orgId,
        legal_entity_id: legalEntityId,
      },
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  console.log(`  ✓ Loaded ${paymentTermsData.length} payment terms`);
  return { created, updated, total: paymentTermsData.length };
}
