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

  router.get('/config', authMiddleware, async (_req: Request, res: Response) => {
    try {
      return res.json(plaid.getConfig());
    } catch (err: any) {
      logger.error('Plaid config error', { err });
      return res.status(500).json({ error: err.message ?? 'Failed to load Plaid config' });
    }
  });

  router.get('/institutions/search', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const institutions = await plaid.searchInstitutions(q);
      return res.json({ data: institutions });
    } catch (err: any) {
      logger.error('Plaid institutions search error', { err });
      if (err.message?.includes('not configured')) {
        return serviceUnavailable(res, err.message);
      }
      return res.status(500).json({ error: err.message ?? 'Institution search failed' });
    }
  });

  router.post('/sandbox/connect', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { institution_id, institution_name, legal_entity_id } = req.body ?? {};
      if (!institution_id || typeof institution_id !== 'string') {
        return res.status(400).json({ error: 'institution_id is required' });
      }
      const item = await plaid.sandboxConnect(
        institution_id,
        typeof institution_name === 'string' ? institution_name : null,
        auth,
        typeof legal_entity_id === 'string' ? legal_entity_id : undefined,
      );
      return res.json({ data: item });
    } catch (err: any) {
      logger.error('Plaid sandbox connect error', { err });
      const status = err.message?.includes('only available') ? 400 : 500;
      return res.status(status).json({ error: err.message ?? 'Sandbox connect failed' });
    }
  });

  router.post('/link-token', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const institutionId =
        typeof req.body?.institution_id === 'string' ? req.body.institution_id : undefined;
      const linkToken = await plaid.createLinkToken(auth.user.id, auth.user.org_id, institutionId);
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
      const { public_token, metadata, legal_entity_id } = req.body ?? {};
      if (!public_token || typeof public_token !== 'string') {
        return res.status(400).json({ error: 'public_token is required' });
      }
      const item = await plaid.exchangePublicToken(public_token, auth, {
        ...metadata,
        legal_entity_id: legal_entity_id ?? metadata?.legal_entity_id,
      });
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

  router.get('/items/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const item = await plaid.getItemSummary(req.params.id, auth.user.org_id);
      return res.json({ data: item });
    } catch (err: any) {
      logger.error('Plaid get item error', { err });
      const status = err.message?.includes('not found') ? 404 : 500;
      return res.status(status).json({ error: err.message ?? 'Failed to get item' });
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

  router.post('/items/:itemId/accounts/:plaidAccountId/sync', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await plaid.syncItemAccount(
        req.params.itemId,
        req.params.plaidAccountId,
        auth,
      );
      return res.json({ data: result });
    } catch (err: any) {
      logger.error('Plaid account sync error', { err });
      const status = err.message?.includes('not found') ? 404 : 500;
      return res.status(status).json({ error: err.message ?? 'Account sync failed' });
    }
  });

  router.post('/items/:itemId/import-accounts', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { plaid_account_ids } = req.body ?? {};
      if (
        !Array.isArray(plaid_account_ids) ||
        plaid_account_ids.length === 0 ||
        !plaid_account_ids.every((id) => typeof id === 'string' && id.length > 0)
      ) {
        return res.status(400).json({ error: 'plaid_account_ids must be a non-empty string array' });
      }
      const result = await plaid.importAccounts(
        req.params.itemId,
        plaid_account_ids,
        auth,
      );
      return res.json({ data: result });
    } catch (err: any) {
      logger.error('Plaid import accounts error', { err });
      const status = err.message?.includes('not found') ? 404 : 500;
      return res.status(status).json({ error: err.message ?? 'Failed to import accounts' });
    }
  });

  router.put('/items/:itemId/accounts/:plaidAccountId/link', authMiddleware, async (req: Request, res: Response) => {
    try {
      const auth = getAuth(req);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { fabriq_account_id } = req.body ?? {};
      if (!fabriq_account_id || typeof fabriq_account_id !== 'string') {
        return res.status(400).json({ error: 'fabriq_account_id is required' });
      }
      const result = await plaid.linkPlaidAccount(
        req.params.itemId,
        req.params.plaidAccountId,
        fabriq_account_id,
        auth,
      );
      return res.json({ data: result });
    } catch (err: any) {
      logger.error('Plaid account link error', { err });
      const status = err.message?.includes('not found') ? 404 : 400;
      return res.status(status).json({ error: err.message ?? 'Failed to link account' });
    }
  });

  // Webhook — disabled; push sync not used (on-demand only). Reserved for future use.
  router.post('/webhook', (_req: Request, res: Response) => {
    return res.sendStatus(404);
  });

  return router;
}
