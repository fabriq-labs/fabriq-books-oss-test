import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Applies `prisma/seed-agent-templates.sql` via `prisma db execute` (same as setup-db Step 3.5).
 * Uses ON CONFLICT upserts; safe to repeat.
 * Terminal only (`npm run seed-sql-metadata`) — not used by Tenant Admin sync.
 */
export function runSeedAgentTemplatesSql(backendRoot: string): void {
  const sqlPath = path.join(backendRoot, 'prisma', 'seed-agent-templates.sql');
  const schemaPath = path.join(backendRoot, 'prisma', 'schema');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`seed-agent-templates.sql not found at ${sqlPath}`);
  }
  const cmd = `npx prisma db execute --schema "${schemaPath}" --file "${sqlPath}"`;
  execSync(cmd, { cwd: backendRoot, env: process.env, stdio: 'inherit' });
}
