import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthContext } from '../auth/types';
import { listAccountsHandler } from './tools/listAccounts';
import { getTrialBalanceHandler, getTrialBalanceSchema } from './tools/getTrialBalance';
import { getPortfolioSummaryHandler, getPortfolioSummarySchema } from './tools/getPortfolioSummary';
import {
  createGetOptionChainHandler,
  getOptionChainSchema,
} from './tools/getOptionChainTool';
import { getOptionsIncomeHandler, getOptionsIncomeSchema } from './tools/getOptionsIncome';

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
        'Investment portfolio: equity holdings, options, cash balances, and per-account totals in report_currency (default CAD). By default returns cached data from the last broker sync. Set latest=true to sync from Questrade first. For covered-call analysis, use equity symbols from data.equity with get_option_chain; check data.options for existing short option positions. For period premium / open-options income analysis, use get_options_income instead.',
      inputSchema: getPortfolioSummarySchema,
    },
    async (params: { latest?: boolean; report_currency?: string; connection_id?: string }) => {
      const result = await getPortfolioSummaryHandler(auth)(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(
    'get_option_chain',
    {
      description:
        'Live Questrade option chain for an underlying symbol with trimmed expiries/strikes and optional quotes/Greeks. Defaults: Call options, strikes from ATM to +20% OTM, next 4 expiries, max 15 strikes per expiry. Chain skeleton is cached same-day (America/Toronto); quotes are always live. Use after get_portfolio_summary for covered-call screening.',
      inputSchema: getOptionChainSchema,
    },
    async (params: {
      symbol: string;
      option_type?: 'Call' | 'Put';
      expiry_date?: string;
      min_strike?: number;
      max_strike?: number;
      expiry_offset?: number;
      expiry_limit?: number;
      strike_offset?: number;
      strike_limit?: number;
      include_quotes?: boolean;
      connection_id?: string;
    }) => {
      const result = await createGetOptionChainHandler(auth)(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(
    'get_options_income',
    {
      description:
        'Options income report from trade history: period premium cash flows and marks on open option positions (default), or closed round-trip realized P/L. Defaults to section=open and report_currency=USD. Prefer this for premium/income analysis of open shorts/longs; use get_portfolio_summary.data.options for a point-in-time holdings snapshot only. Open may have multiple transaction rows per instrument — group by instrument_id when counting positions.',
      inputSchema: getOptionsIncomeSchema,
    },
    async (params: {
      from_date?: string;
      to_date?: string;
      report_currency?: string;
      section?: 'open' | 'closed' | 'all';
      account_id?: string;
      connection_id?: string;
      legal_entity_id?: string;
    }) => {
      const result = await getOptionsIncomeHandler(auth)(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerPrompt(
    'covered_call_candidates',
    {
      title: 'Covered call candidate screening',
      description:
        'Analyze portfolio equity holdings and screen for covered-call opportunities using get_portfolio_summary and get_option_chain.',
      argsSchema: {
        report_currency: z
          .string()
          .optional()
          .describe('Portfolio report currency. Defaults to CAD.'),
        connection_id: z
          .string()
          .optional()
          .describe('Optional Questrade connection id.'),
        risk_level: z
          .enum(['conservative', 'moderate', 'aggressive'])
          .optional()
          .describe('Risk preference for delta/DTE heuristics. Default moderate.'),
      },
    },
    async (args: { report_currency?: string; connection_id?: string; risk_level?: string }) => {
      const risk = args.risk_level ?? 'moderate';
      const deltaHint =
        risk === 'conservative'
          ? '0.15–0.25'
          : risk === 'aggressive'
            ? '0.30–0.45'
            : '0.20–0.35';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Screen my portfolio for covered-call opportunities.

Steps:
1. Call get_portfolio_summary with latest=true${args.report_currency ? ` and report_currency=${args.report_currency}` : ''}${args.connection_id ? ` and connection_id=${args.connection_id}` : ''}.
2. From data.equity, select symbols with quantity >= 100 (round lots) and no existing short call on the same underlying in data.options.
3. For each eligible symbol, call get_option_chain with symbol set to the equity ticker (Call options; default strike band is fine).
4. Rank candidates by premium yield (bid/last vs underlying price), prefer 30–45 DTE, target delta ${deltaHint}, and meaningful open interest.
5. Summarize top 3 candidates with strike, expiry, premium, delta, and shares available to cover.`,
            },
          },
        ],
      };
    }
  );

  return server;
}
