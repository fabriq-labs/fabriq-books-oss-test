import * as path from 'path';
import type { PrismaClient } from '@prisma/client';
import { executeSqlFile } from './executeSqlFile';

/**
 * Applies `prisma/seed-agent-model-tools.sql`.
 * Uses ON CONFLICT upserts; safe to repeat. No `npx` / Prisma CLI.
 */
export async function runSeedAgentModelToolsSql(
  backendRoot: string,
  prisma: PrismaClient
): Promise<number> {
  const sqlPath = path.join(backendRoot, 'prisma', 'seed-agent-model-tools.sql');
  return executeSqlFile(prisma, sqlPath);
}
