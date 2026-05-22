/**
 * Applies SQL views from prisma/migration/views.sql (account_hierarchy, account_balances, etc.).
 *
 * Run standalone:
 *   npx ts-node prisma/apply-database-views.ts
 *
 * Also invoked from setup-metadata.ts, setup-db.js, and server startup (ensureDatabaseViews).
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const backendRoot = join(__dirname, '..');
const viewsSqlPath = join(__dirname, 'migration', 'views.sql');
const schemaPath = join(__dirname, 'schema');

export function applyDatabaseViews(): void {
  if (!existsSync(viewsSqlPath)) {
    throw new Error(`views.sql not found at ${viewsSqlPath}`);
  }

  const command = `npx prisma db execute --schema "${schemaPath}" --file "${viewsSqlPath}"`;
  console.log(`📐 Applying database views from migration/views.sql...`);
  console.log(`   Command: ${command}`);

  execSync(command, {
    stdio: 'inherit',
    cwd: backendRoot,
  });

  console.log('✅ Database views applied (account_hierarchy, account_balances, v_posting_legs, ...)');
}

if (require.main === module) {
  try {
    applyDatabaseViews();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to apply database views:', error);
    process.exit(1);
  }
}
