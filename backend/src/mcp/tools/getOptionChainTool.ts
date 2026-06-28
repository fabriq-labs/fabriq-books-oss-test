import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import {
  getOptionChainHandler,
  type GetOptionChainParams,
} from './getOptionChain';

export const getOptionChainSchema = {
  symbol: z.string().describe('Underlying ticker symbol, e.g. VFV.TO or AAPL.'),
  option_type: z
    .enum(['Call', 'Put'])
    .optional()
    .describe('Option side. Defaults to Call for covered-call screening.'),
  expiry_date: z
    .string()
    .optional()
    .describe('Pin to a single expiry (YYYY-MM-DD). Overrides expiry_offset/limit.'),
  min_strike: z.number().optional().describe('Minimum strike price. Defaults to ATM for calls.'),
  max_strike: z.number().optional().describe('Maximum strike price. Defaults to +20% OTM for calls.'),
  expiry_offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Skip first N expiries after sorting (Fabriq pagination). Default 0.'),
  expiry_limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Max expiries to return. Default 4, hard max 8.'),
  strike_offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Skip first N strikes in the strike band. Default 0.'),
  strike_limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Max strikes per expiry. Default 15, hard max 25.'),
  include_quotes: z
    .boolean()
    .optional()
    .describe('When false, return chain structure only without live quote POST. Default true.'),
  connection_id: z
    .string()
    .optional()
    .describe('Optional source_system id when the org has multiple Questrade connections.'),
};

export type GetOptionChainToolParams = z.infer<z.ZodObject<typeof getOptionChainSchema>>;

export { getOptionChainHandler };

export function createGetOptionChainHandler(auth: AuthContext) {
  const orgId = auth.user?.org_id;
  if (!orgId) {
    return async () => {
      throw new Error('Auth context missing org_id');
    };
  }
  return getOptionChainHandler(orgId);
}

export async function runGetOptionChain(auth: AuthContext, params: GetOptionChainParams) {
  return createGetOptionChainHandler(auth)(params);
}
