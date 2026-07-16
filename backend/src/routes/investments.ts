import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware';
import type { AuthContext } from '../auth/types';
import { createBrokerConnector } from '../lib/integrations/broker/connectors';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

function getAuthContext(req: Request): AuthContext | null {
  const auth = (req as any).context?.auth as AuthContext | undefined;
  if (!auth?.user?.id || !auth.user.org_id) return null;
  return auth;
}

export function createInvestmentsRouter(): Router {
  const router = Router();

  /**
   * POST /api/investments/option-quote
   * Fetch live Greeks + market data from Questrade for an open option holding.
   * Body: { instrument_id: string }
   *
   * Called once by the frontend when the position detail modal opens. The result is
   * used both for the Greeks panel and passed into the LLM chat as modelContext —
   * the LLM never fetches quotes itself (see backend/prisma/seed-agent-model-tools.sql,
   * model_name 'instrument': no tools configured).
   */
  router.post('/option-quote', authMiddleware, async (req: Request, res: Response) => {
    const auth = getAuthContext(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const orgId = auth.user.org_id;

    const { instrument_id } = req.body as { instrument_id?: string };
    if (!instrument_id) return res.status(400).json({ error: 'instrument_id is required' });

    try {
      const instrument = await prisma.instrument.findFirst({
        where: { id: instrument_id },
        select: { external_symbol_id: true, symbol: true },
      });

      if (!instrument?.external_symbol_id) {
        return res.status(404).json({ error: 'Instrument not found or has no Questrade symbol ID' });
      }

      const connection = await prisma.source_system.findFirst({
        where: { org_id: orgId, system_type: 'questrade', is_active: true },
        orderBy: { last_sync_at: 'desc' },
        select: { id: true },
      });

      if (!connection) return res.status(404).json({ error: 'No active Questrade connection' });

      const { connector } = await createBrokerConnector(connection.id);
      await connector.ensureAuth();

      if (!connector.getOptionQuotes) {
        return res.status(501).json({ error: 'Broker connector does not support option quotes' });
      }

      const quotes = await connector.getOptionQuotes({ optionIds: [instrument.external_symbol_id] });
      const quote = quotes[0] ?? null;

      return res.json({ quote });
    } catch (error) {
      logger.error('Failed to fetch option quote', { error, instrument_id, orgId });
      return res.status(500).json({ error: 'Failed to fetch live quote from Questrade' });
    }
  });

  return router;
}
