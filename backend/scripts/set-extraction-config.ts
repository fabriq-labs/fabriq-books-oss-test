#!/usr/bin/env ts-node
/**
 * Store Airbyte extraction_config in source_system.
 *
 * Usage:
 *   ts-node scripts/set-extraction-config.ts --source-system-id <id> --airbyte-connection-id <uuid> [--airbyte-api-base https://api.airbyte.com]
 *
 * Credentials are read from env:
 *   AIRBYTE_CLIENT_ID
 *   AIRBYTE_CLIENT_SECRET
 */

import prisma from '../src/lib/prisma';
import logger from '../src/utils/logger';

type CliArgs = {
  sourceSystemId?: string;
  airbyteConnectionId?: string;
  airbyteApiBase?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!k?.startsWith('--')) continue;
    if (!v || v.startsWith('--')) continue;
    if (k === '--source-system-id') out.sourceSystemId = v;
    if (k === '--airbyte-connection-id') out.airbyteConnectionId = v;
    if (k === '--airbyte-api-base') out.airbyteApiBase = v;
  }
  return out;
}

function requireValue(name: string, value?: string): string {
  const cleaned = value?.trim();
  if (!cleaned) {
    throw new Error(`${name} is required`);
  }
  return cleaned;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const sourceSystemId = requireValue('--source-system-id', args.sourceSystemId);
  const airbyteConnectionId = requireValue('--airbyte-connection-id', args.airbyteConnectionId);
  const clientId = requireValue('AIRBYTE_CLIENT_ID', process.env.AIRBYTE_CLIENT_ID);
  const clientSecret = requireValue('AIRBYTE_CLIENT_SECRET', process.env.AIRBYTE_CLIENT_SECRET);
  const apiBase = args.airbyteApiBase?.trim() || process.env.AIRBYTE_API_BASE?.trim();

  const row = await prisma.source_system.findUnique({
    where: { id: sourceSystemId },
    select: { id: true, org_id: true, name: true, system_type: true },
  });
  if (!row) {
    throw new Error(`source_system not found: ${sourceSystemId}`);
  }

  const extractionConfig: Record<string, unknown> = {
    type: 'airbyte',
    client_id: clientId,
    client_secret: clientSecret,
    connection_id: airbyteConnectionId,
  };
  if (apiBase) {
    extractionConfig.api_base = apiBase;
  }

  await prisma.source_system.update({
    where: { id: sourceSystemId },
    data: {
      extraction_config: extractionConfig as any,
    },
  });

  logger.info('✅ extraction_config saved', {
    sourceSystemId: row.id,
    orgId: row.org_id,
    name: row.name,
    systemType: row.system_type,
    extractionType: 'airbyte',
    hasClientId: true,
    hasClientSecret: true,
    airbyteConnectionId,
    apiBase: apiBase || 'https://api.airbyte.com',
  });
}

main()
  .catch((err: any) => {
    logger.error('Failed to set extraction_config', {
      error: err?.message || String(err),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

