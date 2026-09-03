import * as path from 'path';
import type { PrismaClient } from '@prisma/client';
import { executeSqlFile } from './executeSqlFile';

/**
 * Applies `prisma/seed-currencies.sql`.
 * Uses ON CONFLICT (code) DO UPDATE; safe to repeat. No `npx` / Prisma CLI.
 */
export async function runSeedCurrenciesSql(
  backendRoot: string,
  prisma: PrismaClient
): Promise<number> {
  const sqlPath = path.join(backendRoot, 'prisma', 'seed-currencies.sql');
  return executeSqlFile(prisma, sqlPath);
}
