/**
 * Phase 2 smoke: encryption middleware + connection upsert (no live QBO/Airbyte).
 *
 *   cd backend && npm run smoke:integrations-phase2
 *
 * Requires DATABASE_URL and ERP_CONFIG_ENCRYPTION_KEY.
 */

import crypto from 'crypto';
import prisma from '../src/lib/prisma';
import { decryptConfig, encryptConfig } from '../lib/integrations/shared/encryption';
import { upsertQuickBooksConnection } from '../lib/integrations/shared/connectionService';

function ensureEncryptionKey(): void {
  if (process.env.ERP_CONFIG_ENCRYPTION_KEY) return;
  process.env.ERP_CONFIG_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  console.warn('ERP_CONFIG_ENCRYPTION_KEY was unset; using ephemeral key for this smoke run');
}

async function main() {
  ensureEncryptionKey();

  const roundtrip = encryptConfig({ oauth: { client_id: 'smoke' } });
  const decoded = decryptConfig(roundtrip);
  if ((decoded as { oauth?: { client_id?: string } }).oauth?.client_id !== 'smoke') {
    throw new Error('encrypt/decrypt roundtrip failed');
  }
  console.log('ok: encrypt/decrypt roundtrip');

  const org = await prisma.org.findFirst({ select: { id: true } });
  if (!org) {
    throw new Error('No org row found — run setup:kernel / seed first');
  }

  const saved = await upsertQuickBooksConnection({
    orgId: org.id,
    name: 'Smoke QBO',
    oauth: {
      client_id: 'cid',
      client_secret: 'csec',
      refresh_token: 'rtok',
      realm_id: '12345',
      environment: 'sandbox',
    },
  });
  console.log('ok: upsert connection', saved.id);

  const raw = await prisma.$queryRawUnsafe<Array<{ connection_config: unknown }>>(
    `SELECT connection_config FROM source_system WHERE id = $1`,
    saved.id
  );
  const stored = raw[0]?.connection_config;
  if (typeof stored !== 'string' || !String(stored).includes(':')) {
    // Json column may return string or the driver may wrap it
    const asStr = typeof stored === 'string' ? stored : JSON.stringify(stored);
    if (!asStr.includes(':')) {
      throw new Error(`expected encrypted connection_config string, got ${typeof stored}`);
    }
  }
  console.log('ok: connection_config encrypted at rest');

  const loaded = await prisma.source_system.findUnique({ where: { id: saved.id } });
  const cfg = loaded?.connection_config as { oauth?: { client_id?: string; realm_id?: string } };
  if (cfg?.oauth?.client_id !== 'cid' || cfg?.oauth?.realm_id !== '12345') {
    throw new Error(`middleware decrypt failed: ${JSON.stringify(cfg)}`);
  }
  console.log('ok: middleware decrypt on read');

  await prisma.source_system.update({
    where: { id: saved.id },
    data: {
      extraction_config: {
        type: 'airbyte',
        client_id: 'ab_id',
        client_secret: 'ab_sec',
        connection_id: 'ab_conn_uuid',
      } as object,
    },
  });
  const withExt = await prisma.source_system.findUnique({ where: { id: saved.id } });
  const ext = withExt?.extraction_config as { type?: string; connection_id?: string };
  if (ext?.type !== 'airbyte' || ext?.connection_id !== 'ab_conn_uuid') {
    throw new Error(`extraction_config decrypt failed: ${JSON.stringify(ext)}`);
  }
  console.log('ok: extraction_config encrypt/decrypt');

  // cleanup smoke row
  await prisma.source_system.delete({ where: { id: saved.id } });
  console.log('Phase 2 smoke passed');
}

main()
  .catch((err) => {
    console.error('Phase 2 smoke failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
