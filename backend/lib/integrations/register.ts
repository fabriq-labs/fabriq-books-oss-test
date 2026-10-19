import { Request, Response, Router } from 'express';
import { authMiddleware } from '../../src/auth/middleware';
import logger from '../../src/utils/logger';
import {
  getConnection,
  listConnections,
  setExtractionConfig,
  upsertQuickBooksConnection,
} from './shared/connectionService';
import { getErpConnectionConfig } from './shared/erp-connection-loader';
import { executeSourceSystemSync } from './shared/sync/sourceSystemSync';
import { testErpConnection } from './shared/test-connection';

function orgUser(req: Request): { orgId: string; userId: string } | { error: string } {
  const orgId = req.context?.auth?.user?.org_id;
  const userId = req.context?.auth?.user?.id;
  if (!orgId || !userId) return { error: 'Unauthorized' };
  return { orgId, userId };
}

/**
 * Mount ERP connection + sync routes on the main /api router.
 * Must run before generic /:model handlers so `:id/sync` is not treated as a relation.
 */
export function registerIntegrationsRoutes(router: Router): void {
  const int = Router();
  int.use(authMiddleware);

  /** List connections for the caller's org (secrets redacted). */
  int.get('/source_system/connections', async (req: Request, res: Response) => {
    const auth = orgUser(req);
    if ('error' in auth) {
      res.status(401).json({ success: false, error: auth.error });
      return;
    }
    try {
      const data = await listConnections(auth.orgId);
      res.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to list connections';
      logger.error('list connections failed', { error: message });
      res.status(500).json({ success: false, error: message });
    }
  });

  /** Upsert QuickBooks connection (encrypted connection_config). */
  int.post('/source_system/connections', async (req: Request, res: Response) => {
    const auth = orgUser(req);
    if ('error' in auth) {
      res.status(401).json({ success: false, error: auth.error });
      return;
    }
    try {
      const body = req.body ?? {};
      const systemType = String(body.system_type || 'quickbooks').toLowerCase();
      if (systemType !== 'quickbooks') {
        res.status(400).json({
          success: false,
          error: 'Only system_type=quickbooks is supported for connection upsert on books Phase 2',
        });
        return;
      }
      const oauth = body.oauth ?? body.connection_config?.oauth;
      if (!oauth || typeof oauth !== 'object') {
        res.status(400).json({ success: false, error: 'oauth object is required' });
        return;
      }
      const data = await upsertQuickBooksConnection({
        orgId: auth.orgId,
        userId: auth.userId,
        name: body.name,
        entityId: body.entity_id,
        connectionId: body.connection_id || body.id,
        isActive: body.is_active !== false,
        oauth,
      });
      res.status(200).json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save connection';
      const status = message === 'Connection not found' ? 404 : 400;
      logger.error('upsert connection failed', { error: message });
      res.status(status).json({ success: false, error: message });
    }
  });

  /** Connection detail (secrets redacted). */
  int.get('/source_system/connections/:id', async (req: Request, res: Response) => {
    const auth = orgUser(req);
    if ('error' in auth) {
      res.status(401).json({ success: false, error: auth.error });
      return;
    }
    try {
      const data = await getConnection(auth.orgId, req.params.id);
      if (!data) {
        res.status(404).json({ success: false, error: 'Connection not found' });
        return;
      }
      res.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load connection';
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * Test QBO (or other) credentials before/after save.
   * Body: { system_type, oauth?, connection_id? }
   * If connection_id is set and oauth omitted, loads oauth from DB.
   */
  int.post('/source_system/test-connection', async (req: Request, res: Response) => {
    const auth = orgUser(req);
    if ('error' in auth) {
      res.status(401).json({ success: false, error: auth.error });
      return;
    }
    try {
      const systemType = String(req.body?.system_type || 'quickbooks').toLowerCase();
      let oauth = req.body?.oauth;
      const connectionId = req.body?.connection_id as string | undefined;

      if ((!oauth || typeof oauth !== 'object') && connectionId) {
        const cfg = await getErpConnectionConfig(auth.orgId, systemType);
        oauth = cfg.oauth;
      }
      if (!oauth || typeof oauth !== 'object') {
        res.status(400).json({
          success: false,
          error: 'oauth credentials or connection_id with saved oauth required',
        });
        return;
      }

      const result = await testErpConnection(systemType, oauth, connectionId);
      res.status(result.success ? 200 : 400).json({
        success: result.success,
        message: result.message,
        data: result.data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Test connection failed';
      logger.error('test-connection failed', { error: message });
      res.status(400).json({ success: false, error: message });
    }
  });

  /** Attach Airbyte extraction_config (encrypted) for forward sync. */
  int.post('/source_system/:id/extraction-config', async (req: Request, res: Response) => {
    const auth = orgUser(req);
    if ('error' in auth) {
      res.status(401).json({ success: false, error: auth.error });
      return;
    }
    try {
      const body = req.body ?? {};
      const airbyteConnectionId = String(body.airbyte_connection_id || body.connection_id || '').trim();
      const clientId = String(body.client_id || '').trim();
      const clientSecret = String(body.client_secret || '').trim();
      const apiBase = body.api_base ? String(body.api_base).trim() : undefined;
      if (!airbyteConnectionId || !clientId || !clientSecret) {
        res.status(400).json({
          success: false,
          error: 'airbyte_connection_id, client_id, and client_secret are required',
        });
        return;
      }
      const data = await setExtractionConfig({
        orgId: auth.orgId,
        connectionId: req.params.id,
        airbyteConnectionId,
        clientId,
        clientSecret,
        apiBase,
      });
      res.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save extraction config';
      const status = message === 'Connection not found' ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

  /** Trigger Airbyte + dbt sync (proxies to loopback sync_service). */
  int.post('/source_system/:id/sync', async (req: Request, res: Response) => {
    const auth = orgUser(req);
    if ('error' in auth) {
      res.status(401).json({ success: false, error: auth.error });
      return;
    }
    const result = await executeSourceSystemSync({
      connectionId: req.params.id,
      orgId: auth.orgId,
      userId: auth.userId,
      syncModeRaw: req.body?.sync_mode,
    });
    res.status(result.httpStatus).json(result.body);
  });

  router.use(int);
}
