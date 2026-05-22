import prisma from '../lib/prisma';
import { applyDatabaseViews } from '../../prisma/apply-database-views';

let viewsEnsured = false;

/**
 * Ensure reporting views exist (account_hierarchy, account_balances, etc.).
 * No-op after first successful check/apply per process.
 */
export async function ensureDatabaseViews(): Promise<void> {
  if (viewsEnsured) {
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1 FROM account_hierarchy LIMIT 1`;
    viewsEnsured = true;
    return;
  } catch {
    // View missing — apply from views.sql
  }

  console.log('📐 account_hierarchy view missing — applying database views...');
  applyDatabaseViews();
  viewsEnsured = true;
}
