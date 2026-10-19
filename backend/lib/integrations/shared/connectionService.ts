/**
 * Create / update source_system rows for ERP connections (Phase 2).
 * connection_config is encrypted by Prisma middleware on write.
 */

import prisma from '../../../src/lib/prisma';
import type { ConnectionConfig } from './erp-connection-loader';

export type UpsertQuickBooksConnectionInput = {
  orgId: string;
  userId?: string;
  name?: string;
  entityId?: string | null;
  oauth: ConnectionConfig['oauth'];
  /** When set, update this row; otherwise upsert by (org_id, system_type). */
  connectionId?: string;
  isActive?: boolean;
};

function sanitizeConnection(row: {
  id: string;
  org_id: string;
  system_type: string;
  name: string;
  is_active: boolean;
  entity_id: string | null;
  last_sync_at: Date | null;
  last_sync_status: unknown;
  created_at: Date;
  modified_at: Date;
  connection_config?: unknown;
  extraction_config?: unknown;
}) {
  const cfg = row.connection_config as ConnectionConfig | null;
  const extraction = row.extraction_config as Record<string, unknown> | null;
  return {
    id: row.id,
    org_id: row.org_id,
    system_type: row.system_type,
    name: row.name,
    is_active: row.is_active,
    entity_id: row.entity_id,
    last_sync_at: row.last_sync_at,
    last_sync_status: row.last_sync_status,
    created_at: row.created_at,
    modified_at: row.modified_at,
    has_oauth: Boolean(cfg?.oauth?.client_id && cfg?.oauth?.refresh_token),
    oauth_environment: cfg?.oauth?.environment ?? null,
    realm_id: cfg?.oauth?.realm_id ?? null,
    has_extraction_config: Boolean(
      extraction && typeof extraction === 'object' && extraction.type === 'airbyte'
    ),
  };
}

export async function listConnections(orgId: string) {
  const rows = await prisma.source_system.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: 'desc' },
  });
  return rows.map(sanitizeConnection);
}

export async function getConnection(orgId: string, connectionId: string) {
  const row = await prisma.source_system.findUnique({ where: { id: connectionId } });
  if (!row || row.org_id !== orgId) return null;
  return sanitizeConnection(row);
}

export async function upsertQuickBooksConnection(input: UpsertQuickBooksConnectionInput) {
  const { orgId, userId, oauth, connectionId, entityId, isActive = true } = input;
  if (!oauth.client_id || !oauth.client_secret || !oauth.refresh_token || !oauth.realm_id) {
    throw new Error(
      'oauth requires client_id, client_secret, refresh_token, and realm_id for QuickBooks'
    );
  }

  const name = input.name?.trim() || 'QuickBooks Online';
  const connection_config = {
    oauth: {
      client_id: oauth.client_id,
      client_secret: oauth.client_secret,
      refresh_token: oauth.refresh_token,
      realm_id: oauth.realm_id,
      environment: oauth.environment || 'production',
    },
  };

  if (connectionId) {
    const existing = await prisma.source_system.findUnique({ where: { id: connectionId } });
    if (!existing || existing.org_id !== orgId) {
      throw new Error('Connection not found');
    }
    const updated = await prisma.source_system.update({
      where: { id: connectionId },
      data: {
        name,
        is_active: isActive,
        entity_id: entityId === undefined ? undefined : entityId,
        connection_config: connection_config as object,
        modified_by: userId ?? undefined,
      },
    });
    return sanitizeConnection(updated);
  }

  const updated = await prisma.source_system.upsert({
    where: {
      org_id_system_type: {
        org_id: orgId,
        system_type: 'quickbooks',
      },
    },
    create: {
      org_id: orgId,
      system_type: 'quickbooks',
      name,
      is_active: isActive,
      entity_id: entityId ?? null,
      connection_config: connection_config as object,
      created_by: userId ?? undefined,
      modified_by: userId ?? undefined,
    },
    update: {
      name,
      is_active: isActive,
      entity_id: entityId === undefined ? undefined : entityId,
      connection_config: connection_config as object,
      modified_by: userId ?? undefined,
    },
  });
  return sanitizeConnection(updated);
}
