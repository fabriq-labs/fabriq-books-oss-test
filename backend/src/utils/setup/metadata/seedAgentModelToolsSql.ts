import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Applies `prisma/seed-agent-model-tools.sql` via `prisma db execute`.
 * Uses ON CONFLICT upserts; safe to repeat.
 */
export function runSeedAgentModelToolsSql(backendRoot: string): void {
  const sqlPath = path.join(backendRoot, 'prisma', 'seed-agent-model-tools.sql');
  const schemaPath = path.join(backendRoot, 'prisma', 'schema');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`seed-agent-model-tools.sql not found at ${sqlPath}`);
  }
  const cmd = `npx prisma db execute --schema "${schemaPath}" --file "${sqlPath}"`;
  execSync(cmd, { cwd: backendRoot, env: process.env, stdio: 'inherit' });
}
