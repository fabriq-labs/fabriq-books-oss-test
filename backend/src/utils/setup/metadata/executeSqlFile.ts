import * as fs from 'fs';
import type { PrismaClient } from '@prisma/client';

/**
 * Split a SQL script into statements. Honors:
 * - `--` line comments
 * - single-quoted strings
 * - PostgreSQL dollar quotes (`$$`, `$tag$`)
 *
 * Prisma `$executeRawUnsafe` uses the extended query protocol, which rejects
 * multiple commands in one string (42601).
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let dollarTag: string | null = null;

  const startsDollarQuote = (idx: number): string | null => {
    if (sql[idx] !== '$') {
      return null;
    }
    let j = idx + 1;
    while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) {
      j++;
    }
    if (j < sql.length && sql[j] === '$') {
      return sql.slice(idx, j + 1);
    }
    return null;
  };

  while (i < sql.length) {
    const ch = sql[i];

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    if (inSingle) {
      buf += ch;
      if (ch === "'" && sql[i + 1] === "'") {
        buf += "'";
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i++;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') {
        i++;
      }
      continue;
    }

    const tag = startsDollarQuote(i);
    if (tag) {
      dollarTag = tag;
      buf += tag;
      i += tag.length;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      buf += ch;
      i++;
      continue;
    }

    if (ch === ';') {
      const stmt = buf.trim();
      if (stmt) {
        statements.push(stmt);
      }
      buf = '';
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  const tail = buf.trim();
  if (tail) {
    statements.push(tail);
  }
  return statements;
}

/**
 * Run a repo SQL seed file through the live Prisma connection.
 * Avoids `npx prisma db execute` so Super Admin / Docker can apply seeds.
 */
export async function executeSqlFile(prisma: PrismaClient, sqlPath: string): Promise<number> {
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) {
    throw new Error(`SQL file is empty: ${sqlPath}`);
  }
  let rows = 0;
  for (const stmt of statements) {
    rows += await prisma.$executeRawUnsafe(stmt);
  }
  return rows;
}
