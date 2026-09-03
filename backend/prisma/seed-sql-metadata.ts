/**
 * Terminal-only: apply prisma/seed-currencies.sql, seed-agent-templates.sql,
 * and seed-agent-model-tools.sql through Prisma (same path as Super Admin sync).
 *
 * Usage (from backend/):
 *   npm run seed-sql-metadata
 *
 * Views + prompt templates: npm run sync-metadata (or Super Admin → Sync metadata).
 */
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { runSeedCurrenciesSql } from '../src/utils/setup/metadata/seedCurrenciesSql';
import { runSeedAgentTemplatesSql } from '../src/utils/setup/metadata/seedAgentTemplatesSql';
import { runSeedAgentModelToolsSql } from '../src/utils/setup/metadata/seedAgentModelToolsSql';

function getBackendRootDir(): string {
  return path.resolve(__dirname, '..');
}

export async function main(): Promise<void> {
  const backendRoot = getBackendRootDir();
  const prisma = new PrismaClient();
  try {
    console.log('💱 Seeding global currencies (prisma/seed-currencies.sql)...');
    const currencyRows = await runSeedCurrenciesSql(backendRoot, prisma);
    console.log(`✅ Currencies seed complete (${currencyRows} rows).`);
    console.log('');
    console.log('🤖 Seeding system agent templates (prisma/seed-agent-templates.sql)...');
    const agentRows = await runSeedAgentTemplatesSql(backendRoot, prisma);
    console.log(`✅ Agent templates seed complete (${agentRows} rows).`);
    console.log('');
    console.log('🧰 Seeding agent model tools (prisma/seed-agent-model-tools.sql)...');
    const toolRows = await runSeedAgentModelToolsSql(backendRoot, prisma);
    console.log(`✅ Agent model tools seed complete (${toolRows} rows).`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
