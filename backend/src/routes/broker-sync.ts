import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware';
import type { AuthContext } from '../auth/types';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { getPortfolio, runBrokerSync } from '../lib/integrations/broker/sync/broker_sync_service';
import { BrokerConnectionConfig } from '../lib/integrations/broker/connectors/types';

function getAuthContext(req: Request): AuthContext | null {
  const auth = (req as any).context?.auth as AuthContext | undefined;
  if (!auth?.user?.id || !auth.user.org_id) {
    return null;
  }
  return auth;
}

const SUPPORTED_SYSTEM_TYPES = ['questrade'];
const QUESTRADE_TOKEN_ENDPOINT = 'https://login.questrade.com/oauth2/token';

export function createBrokerSyncRouter(): Router {
  const router = Router();

  /** POST /api/broker-sync/connections — create or update a broker connection. */
  router.post('/connections', authMiddleware, async (req: Request, res: Response) => {
    const context = getAuthContext(req);
    if (!context) return res.status(401).json({ error: 'Unauthorized' });
    const orgId = context.user.org_id;

    const { system_type, name, refresh_token, api_server, token_endpoint } = req.body as {
      system_type?: string;
      name?: string;
      refresh_token?: string;
      api_server?: string;
      token_endpoint?: string;
    };

    const systemType = (system_type || 'questrade').toLowerCase();
    if (!SUPPORTED_SYSTEM_TYPES.includes(systemType)) {
      return res.status(400).json({ error: `Unsupported broker type: ${systemType}` });
    }
    if (!refresh_token || typeof refresh_token !== 'string') {
      return res.status(400).json({ error: 'refresh_token (Personal Access Token) is required' });
    }

    const config: BrokerConnectionConfig = {
      oauth: {
        refresh_token,
        api_server,
        token_endpoint: token_endpoint || QUESTRADE_TOKEN_ENDPOINT,
      },
    };

    try {
      const existing = await prisma.source_system.findFirst({
        where: { org_id: orgId, system_type: systemType },
      });

      const connection = existing
        ? await prisma.source_system.update({
            where: { id: existing.id },
            data: {
              name: name || existing.name,
              connection_config: config as unknown as object,
              is_active: true,
              modified_by: context.user.id,
            },
          })
        : await prisma.source_system.create({
            data: {
              org_id: orgId,
              system_type: systemType,
              name: name || 'Questrade',
              connection_config: config as unknown as object,
              created_by: context.user.id,
            },
          });

      return res.status(existing ? 200 : 201).json({ id: connection.id, system_type: systemType });
    } catch (error) {
      logger.error('Failed to create broker connection', error);
      return res.status(500).json({ error: 'Failed to create broker connection' });
    }
  });

  /** DELETE /api/broker-sync/connections/:id — deactivate a broker connection. */
  router.delete('/connections/:id', authMiddleware, async (req: Request, res: Response) => {
    const context = getAuthContext(req);
    if (!context) return res.status(401).json({ error: 'Unauthorized' });

    const connection = await prisma.source_system.findFirst({
      where: { id: req.params.id, org_id: context.user.org_id },
    });
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    await prisma.source_system.update({
      where: { id: connection.id },
      data: { is_active: false, modified_by: context.user.id },
    });
    return res.status(204).send();
  });

  /** POST /api/broker-sync/run — run a manual forward sync. */
  router.post('/run', authMiddleware, async (req: Request, res: Response) => {
    const context = getAuthContext(req);
    if (!context) return res.status(401).json({ error: 'Unauthorized' });
    const orgId = context.user.org_id;

    const connectionId = (req.body as { connection_id?: string }).connection_id;
    const connection = connectionId
      ? await prisma.source_system.findFirst({ where: { id: connectionId, org_id: orgId, is_active: true } })
      : await prisma.source_system.findFirst({
          where: { org_id: orgId, system_type: 'questrade', is_active: true },
        });

    if (!connection) {
      return res.status(404).json({ error: 'No active broker connection found' });
    }

    try {
      const report = await runBrokerSync(connection.id, orgId);
      const httpStatus = report.status === 'reauth_required' ? 409 : report.status === 'failed' ? 502 : 200;
      return res.status(httpStatus).json(report);
    } catch (error) {
      logger.error('Broker sync run failed', error);
      return res.status(500).json({ error: 'Broker sync run failed' });
    }
  });

  /** GET /api/broker-sync/status — last sync status for the org's broker connections. */
  router.get('/status', authMiddleware, async (req: Request, res: Response) => {
    const context = getAuthContext(req);
    if (!context) return res.status(401).json({ error: 'Unauthorized' });

    const connections = await prisma.source_system.findMany({
      where: { org_id: context.user.org_id, system_type: { in: SUPPORTED_SYSTEM_TYPES } },
      select: {
        id: true,
        system_type: true,
        name: true,
        is_active: true,
        last_sync_at: true,
        last_sync_status: true,
      },
    });
    return res.json({ connections });
  });

  /** GET /api/broker-sync/portfolio — holdings with net worth in org base currency. */
  router.get('/portfolio', authMiddleware, async (req: Request, res: Response) => {
    const context = getAuthContext(req);
    if (!context) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const portfolio = await getPortfolio(context.user.org_id);
      return res.json(portfolio);
    } catch (error) {
      logger.error('Failed to build portfolio summary', error);
      return res.status(500).json({ error: 'Failed to build portfolio summary' });
    }
  });

  return router;
}
