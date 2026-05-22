/**
 * Applies SQL views from prisma/migration/views.sql (account_hierarchy, account_balances, etc.).
 *
 * Run standalone: npm run apply-views
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

function getBackendRoot(): string {
  return resolve(__dirname, '..', '..', '..');
}

function getPrismaDir(): string {
  return join(getBackendRoot(), 'prisma');
}

export function applyDatabaseViews(): void {
  const backendRoot = getBackendRoot();
  const prismaDir = getPrismaDir();
  const viewsSqlPath = join(prismaDir, 'migration', 'views.sql');
  const schemaPath = join(prismaDir, 'schema');

  if (!existsSync(viewsSqlPath)) {
    throw new Error(`views.sql not found at ${viewsSqlPath}`);
  }

  const command = `npx prisma db execute --schema "${schemaPath}" --file "${viewsSqlPath}"`;
  console.log('📐 Applying database views from migration/views.sql...');
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
