/**
 * Terminal-only: apply prisma/seed-currencies.sql and prisma/seed-agent-templates.sql
 * via `npx prisma db execute` (requires npm/npx — not for Tenant Admin / container UI).
 *
 * Usage (from backend/):
 *   npm run seed-sql-metadata
 *
 * Views + prompt templates: npm run sync-metadata (or Tenant Admin → Sync metadata).
 */
import * as path from 'path';
import { runSeedCurrenciesSql } from '../src/utils/setup/metadata/seedCurrenciesSql';
import { runSeedAgentTemplatesSql } from '../src/utils/setup/metadata/seedAgentTemplatesSql';

function getBackendRootDir(): string {
  return path.resolve(__dirname, '..');
}

export function main(): void {
  const backendRoot = getBackendRootDir();
  console.log('💱 Seeding global currencies (prisma/seed-currencies.sql)...');
  runSeedCurrenciesSql(backendRoot);
  console.log('✅ Currencies seed complete.');
  console.log('');
  console.log('🤖 Seeding system agent templates (prisma/seed-agent-templates.sql)...');
  runSeedAgentTemplatesSql(backendRoot);
  console.log('✅ Agent templates seed complete.');
}

if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
