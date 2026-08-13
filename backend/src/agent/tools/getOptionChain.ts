/**
 * Agent tool — live Questrade option chain (wraps MCP get_option_chain handler).
 * Used by holding / options analysis chat for roll screening.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import { runGetOptionChain } from '../../mcp/tools/getOptionChainTool';
import logger from '../../utils/logger';

export const getOptionChainAgentSchema = z.object({
  symbol: z
    .string()
    .describe('Underlying ticker symbol, e.g. ACN or VFV.TO (not the option contract symbol).'),
  option_type: z
    .enum(['Call', 'Put'])
    .optional()
    .describe('Option side. Defaults to Call (typical for covered-call / call rolls).'),
  expiry_date: z
    .string()
    .optional()
    .describe('Pin to a single expiry YYYY-MM-DD when the user names a target roll month.'),
  min_strike: z
    .number()
    .optional()
    .describe('Minimum strike. Defaults to ATM for calls.'),
  max_strike: z
    .number()
    .optional()
    .describe('Maximum strike. Defaults to +20% OTM for calls.'),
  expiry_limit: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe('Max expiries to return (default 4).'),
  strike_limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe('Max strikes per expiry (default 15).'),
  include_quotes: z
    .boolean()
    .optional()
    .describe('Include live quotes/Greeks (default true). Set false for structure-only.'),
  description: z
    .string()
    .describe('Short reason for this chain lookup (e.g. "roll ACN Aug 170C to Sep").'),
});

export function getOptionChainTool(auth: AuthContext) {
  return tool({
    description:
      'Fetch a live Questrade option chain for an underlying symbol (expiries, strikes, quotes/Greeks). ' +
      'Use when the user asks to roll a short option to a future expiry and/or different strike, ' +
      'or to compare candidate contracts. Pass the underlying equity ticker (from modelContext.underlyingSymbol), not the option contract symbol.',
    parameters: getOptionChainAgentSchema,
    execute: async (params) => {
      const { description, ...chainParams } = params;
      logger.info('getOptionChain tool invoked', {
        symbol: chainParams.symbol,
        description,
        userId: auth.user?.id,
      });
      try {
        const result = await runGetOptionChain(auth, chainParams);
        return { ...result, description };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('getOptionChain tool failed', { error: message, symbol: chainParams.symbol });
        return {
          tool: 'get_option_chain',
          success: false,
          error: message,
          description,
        };
      }
    },
  });
}
