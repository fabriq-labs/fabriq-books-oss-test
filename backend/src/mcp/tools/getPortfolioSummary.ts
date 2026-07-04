import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import { runBrokerSync } from '../../lib/integrations/broker/sync/broker_sync_service';
import { run_report } from '../../lib/reports';
import type { PortfolioSummaryResult } from '../../lib/reports/investments';
import { resolveBrokerConnection } from './brokerConnection';

const DEFAULT_REPORT_CURRENCY = 'CAD';

export const getPortfolioSummarySchema = {
  latest: z
    .boolean()
    .optional()
    .describe(
      'When true, sync holdings from the broker before returning the portfolio. Defaults to false (use cached data from the last sync).'
    ),
  report_currency: z
    .string()
    .optional()
    .describe('Reporting currency ISO code or currency id. Defaults to CAD.'),
  connection_id: z
    .string()
    .optional()
    .describe('Optional source_system id to scope holdings to one broker connection.'),
};

export type GetPortfolioSummaryParams = z.infer<z.ZodObject<typeof getPortfolioSummarySchema>>;

export function getPortfolioSummaryHandler(auth: AuthContext) {
  return async (params: GetPortfolioSummaryParams) => {
    const orgId = auth.user?.org_id;
    if (!orgId) throw new Error('Auth context missing org_id');

    const latest = params.latest === true;
    const reportCurrency = params.report_currency ?? DEFAULT_REPORT_CURRENCY;

    let sync = null;
    if (latest) {
      const connection = await resolveBrokerConnection(orgId, params.connection_id);
      if (!connection) {
        throw new Error('No active broker connection found');
      }
      sync = await runBrokerSync(connection.id, orgId);
    }

    const data = (await run_report(auth, 'portfolio_summary', {
      report_currency: reportCurrency,
      connection_id: params.connection_id,
    })) as PortfolioSummaryResult;

    const syncFailed = sync != null && (sync.status === 'failed' || sync.status === 'reauth_required');

    return {
      tool: 'get_portfolio_summary',
      success: !syncFailed,
      synced: latest,
      sync,
      filters: {
        latest,
        report_currency: reportCurrency,
        connection_id: params.connection_id ?? null,
      },
      equityCount: data.equity.length,
      optionsCount: data.options.length,
      cashCount: data.cash.length,
      summary: {
        report_currency: data.report_currency,
        total_market_value: data.total_market_value,
        total_cash: data.total_cash,
        total_equity: data.total_equity,
        last_sync_at: data.last_sync_at,
        accounts: data.accounts,
      },
      data,
    };
  };
}
