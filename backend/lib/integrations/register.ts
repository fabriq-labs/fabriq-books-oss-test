import { Request, Response, Router } from 'express';
import { authMiddleware } from '../../src/auth/middleware';
import logger from '../../src/utils/logger';
import { QuickBooksAPIClient } from './quickbooks/quickbooks_api_client';
import {
  getConnection,
  setDefaultPurchaseAccount,
  setExtractionConfig,
  upsertQuickBooksConnection,
} from './shared/connectionService';
import {
  getErpConnectionById,
  getErpConnectionConfig,
} from './shared/erp-connection-loader';
import { executeSourceSystemSync } from './shared/sync/sourceSystemSync';
import { testErpConnection } from './shared/test-connection';

function orgUser(req: Request): { orgId: string; userId: string } | { error: string } {
  const orgId = req.context?.auth?.user?.org_id;
  const userId = req.context?.auth?.user?.id;
  if (!orgId || !userId) return { error: 'Unauthorized' };
  return { orgId, userId };
}

/**
 * Side-effect routes for ERP connections.
 * List/detail CRUD uses metadata Master + source_system_view.
 * These routes must mount before generic /:model handlers.
 */
export function registerIntegrationsRoutes(router: Router): void {
  const int = Router();
  int.use(authMiddleware);

  /**
   * Redacted connection flags (has_oauth, realm, Airbyte) — secrets never returned.
   * List/CRUD stay on /api/source_system/view/source_system_view.
   */
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
   * Upsert QuickBooks OAuth (encrypted connection_config) + optional purchase account.
   * Prefer this over view write when rotating secrets.
   */
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
        defaultPurchaseAccountId:
          body.default_purchase_account_id !== undefined
            ? body.default_purchase_account_id
            : undefined,
        defaultPurchaseAccountName:
          body.default_purchase_account_name !== undefined
            ? body.default_purchase_account_name
            : undefined,
      });
      res.status(200).json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save connection';
      const status = message === 'Connection not found' ? 404 : 400;
      logger.error('upsert connection failed', { error: message });
      res.status(status).json({ success: false, error: message });
    }
  });

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
        const loaded = await getErpConnectionById(auth.orgId, connectionId);
        oauth = loaded.connection_config.oauth;
      } else if ((!oauth || typeof oauth !== 'object') && !connectionId) {
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

  /** Fetch QBO Accounts Payable accounts for default purchase account picker. */
  int.post(
    '/actions/source_system/:id/fetch-expense-accounts',
    async (req: Request, res: Response) => {
      const auth = orgUser(req);
      if ('error' in auth) {
        res.status(401).json({ success: false, message: auth.error });
        return;
      }
      try {
        const connectionId = req.params.id;
        const loaded = await getErpConnectionById(auth.orgId, connectionId);
        if (loaded.system_type.toLowerCase() !== 'quickbooks') {
          res.status(400).json({
            success: false,
            message: 'Expense account fetch is only supported for QuickBooks',
          });
          return;
        }
        const oauth = loaded.connection_config.oauth;
        const client = new QuickBooksAPIClient({
          client_id: oauth.client_id,
          client_secret: oauth.client_secret,
          refresh_token: oauth.refresh_token,
          realm_id: oauth.realm_id || '',
          environment: oauth.environment || 'production',
          connectionId,
        });
        const accounts = await client.getExpenseAccounts();
        res.status(200).json({ success: true, data: accounts });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to fetch expense accounts';
        logger.error('fetch-expense-accounts failed', { error: message });
        const status =
          message === 'Connection not found' ? 404 : message.includes('inactive') ? 400 : 500;
        res.status(status).json({ success: false, message });
      }
    }
  );

  /** Persist default purchase account without rotating OAuth. */
  int.post('/source_system/:id/default-purchase-account', async (req: Request, res: Response) => {
    const auth = orgUser(req);
    if ('error' in auth) {
      res.status(401).json({ success: false, error: auth.error });
      return;
    }
    try {
      const accountId = String(req.body?.account_id || req.body?.default_purchase_account_id || '').trim();
      const accountName = String(
        req.body?.account_name || req.body?.default_purchase_account_name || ''
      ).trim();
      if (!accountId || !accountName) {
        res.status(400).json({ success: false, error: 'account_id and account_name are required' });
        return;
      }
      const data = await setDefaultPurchaseAccount({
        orgId: auth.orgId,
        connectionId: req.params.id,
        accountId,
        accountName,
      });
      res.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save purchase account';
      const status = message === 'Connection not found' ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

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
