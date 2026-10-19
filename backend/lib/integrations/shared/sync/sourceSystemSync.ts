import prisma from '../../../../src/lib/prisma';
import logger from '../../../../src/utils/logger';
import {
  buildIntegrationSyncUrl,
  mapUpstreamHttpStatus,
  messageFromIntegrationResponse,
  postJsonWithApiKey,
  resolveSyncServiceBaseUrl,
} from './http';
import { isSyncableSystemType, parseSyncMode, type SyncMode } from './types';

const MSGS = {
  invalidSyncMode: 'Invalid sync_mode. Use full_sync | transform_only | extract_only',
  notFound: 'Connection not found',
  forbidden: 'Forbidden',
  unsupportedSystem: 'Sync is only supported for QuickBooks and Zoho Books connections',
  noIntegrationUrl: 'Integration sync is not configured (SYNC_SERVICE_URL)',
  noUserApiKey: 'User API key not found. Generate an API key first (POST /api/auth/generate-api-key).',
  genericFailure: 'Integration sync failed',
  requestFailed: 'Sync request failed',
} as const;

export type SourceSystemSyncResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

function jsonError(httpStatus: number, message: string): SourceSystemSyncResult {
  return { httpStatus, body: { success: false, message } };
}

async function persistLastSync(
  connectionId: string,
  lastSyncStatus: Record<string, unknown>
): Promise<void> {
  await prisma.source_system.update({
    where: { id: connectionId },
    data: {
      last_sync_status: lastSyncStatus as object,
      last_sync_at: new Date(),
    },
  });
}

function buildInProgressPayload(syncMode: SyncMode) {
  return {
    status: 'in_progress' as const,
    message: 'Sync in progress',
    sync_mode: syncMode,
    started_at: new Date().toISOString(),
  };
}

/**
 * Queue ERP forward sync via the in-container Python sync service.
 * Sends the stored user.api_key hash as X-API-Key (Python matches it exactly).
 */
export async function executeSourceSystemSync(params: {
  connectionId: string;
  orgId: string;
  userId: string;
  syncModeRaw: unknown;
}): Promise<SourceSystemSyncResult> {
  const { connectionId, orgId, userId, syncModeRaw } = params;

  const syncMode = parseSyncMode(syncModeRaw);
  if (!syncMode) {
    return jsonError(400, MSGS.invalidSyncMode);
  }

  try {
    const row = await prisma.source_system.findUnique({ where: { id: connectionId } });
    if (!row) return jsonError(404, MSGS.notFound);
    if (row.org_id !== orgId) return jsonError(403, MSGS.forbidden);
    if (!isSyncableSystemType(row.system_type)) return jsonError(400, MSGS.unsupportedSystem);

    const baseUrl = resolveSyncServiceBaseUrl();
    if (!baseUrl) return jsonError(503, MSGS.noIntegrationUrl);

    const userRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { api_key: true },
    });
    const syncApiKey = userRow?.api_key?.trim();
    if (!syncApiKey) return jsonError(400, MSGS.noUserApiKey);

    const url = buildIntegrationSyncUrl(baseUrl);
    const payload = {
      org_id: row.org_id,
      system_type: row.system_type,
      connection_id: connectionId,
      sync_mode: syncMode,
    };

    const inProgress = buildInProgressPayload(syncMode);
    await persistLastSync(connectionId, inProgress);

    const { ok, status, data } = await postJsonWithApiKey(url, syncApiKey, payload);

    if (!ok) {
      const message = messageFromIntegrationResponse(data, status);
      const detailPayload =
        data && typeof data === 'object' && 'detail' in (data as object)
          ? (data as { detail: unknown }).detail
          : data;
      const errStatus = { status: 'error' as const, message, detail: detailPayload };
      await persistLastSync(connectionId, errStatus as unknown as Record<string, unknown>);
      return {
        httpStatus: mapUpstreamHttpStatus(status),
        body: { success: false, ...errStatus },
      };
    }

    return {
      httpStatus: 200,
      body: {
        success: true,
        data: {
          ...inProgress,
          queue_response: data,
        },
      },
    };
  } catch (error: unknown) {
    const err = error as { message?: string };
    const message = err?.message || MSGS.genericFailure;
    logger.error('Integration sync error:', error);
    try {
      await persistLastSync(connectionId, {
        status: 'error',
        message: err?.message || MSGS.requestFailed,
      });
    } catch {
      /* ignore */
    }
    return jsonError(500, message);
  }
}
