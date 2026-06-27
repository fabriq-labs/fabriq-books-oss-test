import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthContext } from '../auth/types';
import { listAccountsHandler } from './tools/listAccounts';
import { getTrialBalanceHandler, getTrialBalanceSchema } from './tools/getTrialBalance';
import { getPortfolioSummaryHandler, getPortfolioSummarySchema } from './tools/getPortfolioSummary';

/**
 * Creates a new McpServer with all tools registered for the given auth context.
 *
 * A fresh server is created per request so that the auth context (org_id,
 * permissions) is safely captured in each tool's closure. No shared mutable
 * state between requests.
 */
export function createMcpServer(auth: AuthContext): McpServer {
  const server = new McpServer({
    name: 'fabriq',
    version: '1.0.0',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(
    'list_accounts',
    {
      description:
        'Search accounts in the chart of accounts. Use name for a partial name search (case-insensitive contains) and/or code for an exact code lookup. Returns up to 10 results.',
      inputSchema: {
        name: z.string().optional().describe('Partial account name — case-insensitive contains search.'),
        code: z.string().optional().describe('Exact account code — case-insensitive equals search.'),
      },
    },
    async (params: { name?: string; code?: string }) => {
      const result = await listAccountsHandler(auth)(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(
    'get_trial_balance',
    {
      description:
        'Generate a trial balance report for a date range. Use list_accounts first to resolve account names, bank names, or informal terms like ICICI into account_id.',
      inputSchema: getTrialBalanceSchema,
    },
    async (params: {
      start_date?: string;
      end_date?: string;
      account_id?: string;
      currency_id?: string;
      legal_entity_id?: string;
    }) => {
      const result = await getTrialBalanceHandler(auth)(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(
    'get_portfolio_summary',
    {
      description:
        'Investment portfolio: equity holdings, options, cash balances, and per-account totals in report_currency (default CAD). By default returns cached data from the last broker sync. Set latest=true to sync from Questrade first. Check last_sync_at for freshness; use latest=true when the user needs up-to-date prices or positions.',
      inputSchema: getPortfolioSummarySchema,
    },
    async (params: { latest?: boolean; report_currency?: string; connection_id?: string }) => {
      const result = await getPortfolioSummaryHandler(auth)(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  return server;
}
