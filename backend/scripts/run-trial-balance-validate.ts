#!/usr/bin/env ts-node
/**
 * Run trial balance for org_knack-global-pvt-ltd and validate row count vs account_hierarchy.
 * FY 2024-2025: 2024-04-01 to 2025-03-31
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { getTrialBalance } from '../src/lib/reports/perfin';

const ORG_ID = 'org_knack-global-pvt-ltd';
const FROM = '2024-04-01';
const TO = '2025-03-31';

async function main() {
  const rows = await getTrialBalance(FROM, TO, ORG_ID);
  const withActivity = rows.filter(
    (r) => Number(r.total_debits) !== 0 || Number(r.total_credits) !== 0
  );
  const sumDebits = rows.reduce((s, r) => s + Number(r.total_debits), 0);
  const sumCredits = rows.reduce((s, r) => s + Number(r.total_credits), 0);

  console.log('Trial balance row count:', rows.length);
  console.log('Expected (account_hierarchy count for org): 391');
  console.log('Rows with non-zero debits/credits:', withActivity.length);
  console.log('Sum total_debits:', sumDebits, '| Sum total_credits:', sumCredits);
  console.log('Sample (first 5 rows):');
  console.table(rows.slice(0, 5));
  if (withActivity.length > 0) {
    console.log('Sample (non-zero activity, first 5):');
    console.table(withActivity.slice(0, 5));
  }
  console.log('Sample (last 3 rows):');
  console.table(rows.slice(-3));
  process.exit(rows.length === 391 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
