import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '@prisma/client';
import { executeSqlFile } from './executeSqlFile';

/**
 * Applies `prisma/seed-agent-templates.sql` (and tax-package template if present).
 * Uses ON CONFLICT upserts; safe to repeat. No `npx` / Prisma CLI.
 */
export async function runSeedAgentTemplatesSql(
  backendRoot: string,
  prisma: PrismaClient
): Promise<number> {
  const sqlPath = path.join(backendRoot, 'prisma', 'seed-agent-templates.sql');
  let rows = await executeSqlFile(prisma, sqlPath);

  const taxPackage = path.join(backendRoot, 'prisma', 'seed-tax-package-template.sql');
  if (fs.existsSync(taxPackage)) {
    rows += await executeSqlFile(prisma, taxPackage);
  }
  return rows;
}
