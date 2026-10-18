import { Request, Response, Router } from 'express';
import { authMiddleware } from '../../src/auth/middleware';
import logger from '../../src/utils/logger';
import { OpeningBalanceError, saveOpeningBalances } from './openingBalances';
import {
  ReportInputError,
  ReportParams,
  getBalanceSheet,
  getCashFlowStatement,
  getIncomeStatement,
  getPostingList,
  getTrialBalance,
} from './reports';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function readList(value: unknown): string[] {
  if (value == null || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw.map((part) => String(part).trim()).filter(Boolean);
}

function readParams(req: Request): ReportParams | { error: string } {
  const orgId = req.context?.auth?.user?.org_id;
  if (!orgId) return { error: 'Unauthorized' };
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!isDate(from) || !isDate(to)) return { error: 'from and to are required dates (YYYY-MM-DD)' };
  if (from > to) return { error: 'from must be on or before to' };
  const entityIds = readList(req.query.entity_id);
  if (entityIds.some((id) => id.length > 50)) return { error: 'entity_id is invalid' };
  const currencyRaw = req.query.currency_id;
  const currencyId = currencyRaw == null || currencyRaw === '' ? undefined : String(currencyRaw).trim();
  if (currencyId && currencyId.length > 50) return { error: 'currency_id is invalid' };
  return { orgId, from, to, entityIds, currencyId };
}

function sendReport(handler: (params: ReportParams) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    const params = readParams(req);
    if ('error' in params) {
      const status = params.error === 'Unauthorized' ? 401 : 400;
      res.status(status).json({ success: false, error: params.error });
      return;
    }
    try {
      const data = await handler(params);
      res.json({ success: true, data });
    } catch (error: unknown) {
      if (error instanceof ReportInputError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Report failed';
      logger.error('GL report failed', { message });
      res.status(500).json({ success: false, error: message });
    }
  };
}

export function registerGlRoutes(router: Router): void {
  const gl = Router();
  gl.use(authMiddleware);
  gl.get('/reports/trial-balance', sendReport(getTrialBalance));
  gl.get('/reports/income-statement', sendReport(getIncomeStatement));
  gl.get('/reports/balance-sheet', sendReport(getBalanceSheet));
  gl.get('/reports/cash-flow', sendReport(getCashFlowStatement));
  gl.get('/reports/posting-list', sendReport(getPostingList));
  gl.post('/opening-balances', async (req: Request, res: Response) => {
    const orgId = req.context?.auth?.user?.org_id;
    if (!orgId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    try {
      const data = await saveOpeningBalances(orgId, req.context?.auth?.user?.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error: unknown) {
      if (error instanceof OpeningBalanceError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Opening balances failed';
      logger.error('Opening balances failed', { message });
      res.status(500).json({ success: false, error: message });
    }
  });
  router.use('/gl', gl);
}
