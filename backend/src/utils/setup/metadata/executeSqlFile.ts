import * as fs from 'fs';
import type { PrismaClient } from '@prisma/client';

/**
 * Run a repo SQL seed file through the live Prisma connection.
 * Avoids `npx prisma db execute` so Super Admin / Docker can apply seeds.
 *
 * Files must be a single PostgreSQL statement (leading `--` comments are fine).
 * Dollar-quoted strings (`$$`, `$tp$`, …) are passed through unchanged.
 */
export async function executeSqlFile(prisma: PrismaClient, sqlPath: string): Promise<number> {
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8').trim();
  if (!sql) {
    throw new Error(`SQL file is empty: ${sqlPath}`);
  }
  return prisma.$executeRawUnsafe(sql);
}
