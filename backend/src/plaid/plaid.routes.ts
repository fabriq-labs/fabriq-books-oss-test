import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware';
import { PlaidService } from './plaid.service';
import logger from '../utils/logger';

function getAuth(req: Request) {
  return (req as any).context?.auth;
}

function serviceUnavailable(res: Response, message: string) {
  return res.status(503).json({ error: message });
}

export function createPlaidRouter(): Router {
  const router = Router();
  const plaid = PlaidService.getInstance();

  router.post('/link-token', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const linkToken = await plaid.createLinkToken(auth.user.id, auth.user.org_id);
      return res.json({ link_token: linkToken });
    } catch (err: any) {
      logger.error('Plaid link-token error', { err });
      if (err.message?.includes('not configured')) {
        return serviceUnavailable(res, err.message);
      }
      return res.status(500).json({ error: err.message ?? 'Failed to create link token' });
    }
  });

  router.post('/exchange-token', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { public_token, metadata } = req.body ?? {};
      if (!public_token || typeof public_token !== 'string') {
        return res.status(400).json({ error: 'public_token is required' });
      }
      const item = await plaid.exchangePublicToken(public_token, auth, metadata);
      return res.json({ data: item });
    } catch (err: any) {
      logger.error('Plaid exchange-token error', { err });
      return res.status(500).json({ error: err.message ?? 'Failed to exchange token' });
    }
  });

  router.get('/items', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const items = await plaid.listItems(auth.user.org_id);
      return res.json({ data: items });
    } catch (err: any) {
      logger.error('Plaid list items error', { err });
      return res.status(500).json({ error: err.message ?? 'Failed to list items' });
    }
  });

  router.delete('/items/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      await plaid.deleteItem(req.params.id, auth.user.org_id);
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Plaid delete item error', { err });
      const status = err.message?.includes('not found') ? 404 : 500;
      return res.status(status).json({ error: err.message ?? 'Failed to disconnect' });
    }
  });

  router.post('/sync/:itemId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await plaid.syncItemById(req.params.itemId, auth);
      return res.json({ data: result });
    } catch (err: any) {
      logger.error('Plaid sync error', { err });
      const status = err.message?.includes('not found') ? 404 : 500;
      return res.status(status).json({ error: err.message ?? 'Sync failed' });
    }
  });

  router.put('/items/:itemId/accounts/:plaidAccountId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { fabriq_account_id } = req.body ?? {};
      await plaid.updateAccountMapping(
        req.params.itemId,
        req.params.plaidAccountId,
        fabriq_account_id ?? null,
        auth.user.org_id,
      );
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Plaid account mapping error', { err });
      const status = err.message?.includes('not found') ? 404 : 500;
      return res.status(status).json({ error: err.message ?? 'Failed to update mapping' });
    }
  });

  // Webhook — no auth; Plaid calls this directly
  router.post('/webhook', async (req: Request, res: Response) => {
    const { webhook_type, webhook_code, item_id } = req.body ?? {};
    logger.info('Plaid webhook received', { webhook_type, webhook_code, item_id });

    if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE' && item_id) {
      plaid.syncItemByPlaidItemId(item_id).catch((err) => {
        logger.error('Plaid webhook sync failed', { item_id, err });
      });
    }

    return res.sendStatus(200);
  });

  return router;
}
