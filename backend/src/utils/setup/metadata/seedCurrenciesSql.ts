import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Applies `prisma/seed-currencies.sql` via `prisma db execute` (same as setup-db Step 1.7).
 * Uses ON CONFLICT (code) DO UPDATE; safe to repeat.
 */
export function runSeedCurrenciesSql(backendRoot: string): void {
  const sqlPath = path.join(backendRoot, 'prisma', 'seed-currencies.sql');
  const schemaPath = path.join(backendRoot, 'prisma', 'schema');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`seed-currencies.sql not found at ${sqlPath}`);
  }
  const cmd = `npx prisma db execute --schema "${schemaPath}" --file "${sqlPath}"`;
  execSync(cmd, { cwd: backendRoot, env: process.env, stdio: 'inherit' });
}
