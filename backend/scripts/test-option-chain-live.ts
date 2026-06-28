#!/usr/bin/env npx ts-node --transpile-only
/**
 * Smoke-test get_option_chain against the live Questrade API.
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/test-option-chain-live.ts VFV.TO
 *   npx ts-node --transpile-only scripts/test-option-chain-live.ts AAPL --connection-id=srcsys_...
 *
 * Requires:
 * - backend/.env with DATABASE_URL
 * - Active Questrade source_system row with valid refresh token
 * - option_chain_cache table (npx prisma db push)
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import prisma from '../src/lib/prisma';
import { fetchOptionChainForOrg } from '../src/mcp/tools/getOptionChain';

async function main() {
  const symbol = process.argv[2] ?? 'VFV.TO';
  const connectionArg = process.argv.find((a) => a.startsWith('--connection-id='));
  const connectionIdOverride = connectionArg?.split('=')[1];

  const connection = connectionIdOverride
    ? await prisma.source_system.findFirst({
        where: { id: connectionIdOverride, system_type: 'questrade', is_active: true },
      })
    : await prisma.source_system.findFirst({
        where: { system_type: 'questrade', is_active: true },
        orderBy: { modified_at: 'desc' },
      });

  if (!connection) {
    console.error('No active Questrade connection found.');
    process.exit(1);
  }

  console.log(`Testing live option chain for ${symbol} via connection ${connection.id} (org ${connection.org_id})`);

  const result = await fetchOptionChainForOrg(connection.org_id, connection.id, {
    symbol,
    include_quotes: true,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
