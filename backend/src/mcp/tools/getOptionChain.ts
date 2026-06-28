import logger from '../../utils/logger';
import { createBrokerConnector } from '../../lib/integrations/broker/connectors';
import {
  getCachedOptionChain,
  invalidateOptionChainCache,
  upsertOptionChainCache,
} from '../../lib/integrations/broker/option_chain/option_chain_cache_service';
import {
  computeEffectiveStrikeBand,
  DEFAULT_EXPIRY_LIMIT,
  DEFAULT_STRIKE_LIMIT,
  mergeQuotesIntoChain,
  trimOptionChain,
  type EffectiveOptionFilters,
  type OptionSide,
  type TrimResult,
} from '../../lib/integrations/broker/option_chain/option_chain_trim';
import type { BrokerConnector } from '../../lib/integrations/broker/connectors/types';
import { BrokerOptionChainDTO, ReauthRequiredError } from '../../lib/integrations/broker/connectors/types';

export interface GetOptionChainParams {
  symbol: string;
  option_type?: OptionSide;
  expiry_date?: string;
  min_strike?: number;
  max_strike?: number;
  expiry_offset?: number;
  expiry_limit?: number;
  strike_offset?: number;
  strike_limit?: number;
  include_quotes?: boolean;
  connection_id?: string;
}

export interface QuoteExpiryError {
  expiryDate: string;
  error: string;
}

export interface GetOptionChainResult {
  tool: 'get_option_chain';
  success: boolean;
  error?: string;
  underlying?: {
    symbol: string;
    symbolId: number;
    lastPrice: number | null;
    currency: string | null;
  };
  cache?: {
    hit: boolean;
    refreshedAt: string | null;
    source: 'db' | 'questrade';
  };
  filters?: EffectiveOptionFilters;
  truncation?: TrimResult['truncation'];
  quoteErrors?: QuoteExpiryError[];
  chain?: TrimResult['chain'];
}

function assertOptionConnector(connector: BrokerConnector): asserts connector is BrokerConnector & {
  searchSymbol: NonNullable<BrokerConnector['searchSymbol']>;
  getQuotes: NonNullable<BrokerConnector['getQuotes']>;
  getOptionChain: NonNullable<BrokerConnector['getOptionChain']>;
  getOptionQuotes: NonNullable<BrokerConnector['getOptionQuotes']>;
} {
  if (
    !connector.searchSymbol ||
    !connector.getQuotes ||
    !connector.getOptionChain ||
    !connector.getOptionQuotes
  ) {
    throw new Error('Broker connector does not support option chain APIs');
  }
}

async function loadSkeleton(params: {
  orgId: string;
  connectionId: string;
  connector: BrokerConnector;
  underlyingSymbolId: number;
  underlyingSymbol: string;
  forceRefresh?: boolean;
}): Promise<{ chain: BrokerOptionChainDTO; cacheHit: boolean; refreshedAt: Date; source: 'db' | 'questrade' }> {
  assertOptionConnector(params.connector);

  if (!params.forceRefresh) {
    const cached = await getCachedOptionChain(params.orgId, params.connectionId, params.underlyingSymbolId);
    if (cached.hit) {
      return {
        chain: cached.chain,
        cacheHit: true,
        refreshedAt: cached.refreshedAt,
        source: 'db',
      };
    }
  } else {
    await invalidateOptionChainCache(params.connectionId, params.underlyingSymbolId);
  }

  const chain = await params.connector.getOptionChain(params.underlyingSymbolId, params.underlyingSymbol);
  if (chain.options.length === 0) {
    return {
      chain,
      cacheHit: false,
      refreshedAt: new Date(),
      source: 'questrade',
    };
  }

  const refreshedAt = await upsertOptionChainCache({
    orgId: params.orgId,
    connectionId: params.connectionId,
    underlyingSymbol: params.underlyingSymbol,
    underlyingSymbolId: params.underlyingSymbolId,
    chain,
  });

  return { chain, cacheHit: false, refreshedAt, source: 'questrade' };
}

const OPTION_QUOTE_BATCH_SIZE = 50;

async function fetchQuotesForTrimmedChain(
  connector: BrokerConnector,
  trimResult: TrimResult,
  optionType: OptionSide
): Promise<{ trimResult: TrimResult; quoteErrors: QuoteExpiryError[] }> {
  assertOptionConnector(connector);
  const quoteErrors: QuoteExpiryError[] = [];
  const allQuotes: import('../../lib/integrations/broker/connectors/types').BrokerOptionQuoteDTO[] = [];
  const optionIds = trimResult.expectedQuoteSymbolIds;

  for (let i = 0; i < optionIds.length; i += OPTION_QUOTE_BATCH_SIZE) {
    const batch = optionIds.slice(i, i + OPTION_QUOTE_BATCH_SIZE);
    try {
      const quotes = await connector.getOptionQuotes({ optionIds: batch });
      allQuotes.push(...quotes);
    } catch (err) {
      quoteErrors.push({
        expiryDate: `batch_${i / OPTION_QUOTE_BATCH_SIZE + 1}`,
        error: (err as Error).message,
      });
    }
  }

  const merged = mergeQuotesIntoChain(trimResult, allQuotes, optionType);
  return { trimResult: merged, quoteErrors };
}

function isQuoteCoverageLow(trimResult: TrimResult, expectedCount: number): boolean {
  if (expectedCount === 0) return false;
  const returned = trimResult.truncation.chainStats.quotesReturned;
  return returned === 0 || returned < expectedCount * 0.5;
}

export async function fetchOptionChainForOrg(
  orgId: string,
  connectionId: string,
  params: GetOptionChainParams
): Promise<GetOptionChainResult> {
  const startedAt = Date.now();
  const optionType: OptionSide = params.option_type ?? 'Call';
  const includeQuotes = params.include_quotes !== false;

  const { connector } = await createBrokerConnector(connectionId);
  assertOptionConnector(connector);

  const symbolRow = await connector.searchSymbol(params.symbol);
  if (!symbolRow) {
    return { tool: 'get_option_chain', success: false, error: 'SYMBOL_NOT_FOUND' };
  }

  const quotes = await connector.getQuotes([symbolRow.symbolId]);
  const underlyingQuote = quotes[0];
  const lastPrice = underlyingQuote?.lastTradePrice ?? null;

  if (lastPrice == null || lastPrice <= 0) {
    return { tool: 'get_option_chain', success: false, error: 'UNDERLYING_PRICE_UNAVAILABLE' };
  }

  const { minStrike, maxStrike, reasons: strikeReasons } = computeEffectiveStrikeBand({
    lastPrice,
    optionType,
    minStrike: params.min_strike,
    maxStrike: params.max_strike,
  });

  const effectiveFilters: EffectiveOptionFilters = {
    optionType,
    minStrike,
    maxStrike,
    expiryDate: params.expiry_date,
    expiryOffset: params.expiry_offset ?? 0,
    expiryLimit: params.expiry_limit ?? DEFAULT_EXPIRY_LIMIT,
    strikeOffset: params.strike_offset ?? 0,
    strikeLimit: params.strike_limit ?? DEFAULT_STRIKE_LIMIT,
    includeQuotes,
  };

  let skeletonLoad = await loadSkeleton({
    orgId,
    connectionId,
    connector,
    underlyingSymbolId: symbolRow.symbolId,
    underlyingSymbol: symbolRow.symbol,
  });

  if (skeletonLoad.chain.options.length === 0) {
    return { tool: 'get_option_chain', success: false, error: 'NO_OPTIONS' };
  }

  let trimResult = trimOptionChain(skeletonLoad.chain, effectiveFilters);
  trimResult.truncation.reasons.push(...strikeReasons);

  let quoteErrors: QuoteExpiryError[] = [];
  if (includeQuotes && trimResult.expectedQuoteSymbolIds.length > 0) {
    let quoteFetch = await fetchQuotesForTrimmedChain(connector, trimResult, optionType);
    trimResult = quoteFetch.trimResult;
    quoteErrors = quoteFetch.quoteErrors;

    if (
      isQuoteCoverageLow(trimResult, trimResult.expectedQuoteSymbolIds.length) &&
      skeletonLoad.source === 'db'
    ) {
      logger.warn('Option quote coverage low on cached skeleton; invalidating and retrying', {
        symbol: symbolRow.symbol,
        expected: trimResult.expectedQuoteSymbolIds.length,
        returned: trimResult.truncation.chainStats.quotesReturned,
      });
      skeletonLoad = await loadSkeleton({
        orgId,
        connectionId,
        connector,
        underlyingSymbolId: symbolRow.symbolId,
        underlyingSymbol: symbolRow.symbol,
        forceRefresh: true,
      });
      trimResult = trimOptionChain(skeletonLoad.chain, effectiveFilters);
      trimResult.truncation.reasons.push(...strikeReasons, 'skeleton_cache_invalidated_quote_retry');
      quoteFetch = await fetchQuotesForTrimmedChain(connector, trimResult, optionType);
      trimResult = quoteFetch.trimResult;
      quoteErrors = quoteFetch.quoteErrors;
    }
  }

  logger.info('get_option_chain completed', {
    symbol: symbolRow.symbol,
    cacheHit: skeletonLoad.cacheHit,
    durationMs: Date.now() - startedAt,
    expiriesReturned: trimResult.truncation.chainStats.expiriesReturned,
    quotesReturned: trimResult.truncation.chainStats.quotesReturned,
  });

  return {
    tool: 'get_option_chain',
    success: true,
    underlying: {
      symbol: symbolRow.symbol,
      symbolId: symbolRow.symbolId,
      lastPrice,
      currency: underlyingQuote?.currencyCode ?? symbolRow.currencyCode ?? null,
    },
    cache: {
      hit: skeletonLoad.cacheHit,
      refreshedAt: skeletonLoad.refreshedAt.toISOString(),
      source: skeletonLoad.source,
    },
    filters: effectiveFilters,
    truncation: trimResult.truncation,
    quoteErrors: quoteErrors.length > 0 ? quoteErrors : undefined,
    chain: trimResult.chain,
  };
}

export function getOptionChainHandler(orgId: string) {
  return async (params: GetOptionChainParams): Promise<GetOptionChainResult> => {
    const { resolveBrokerConnection } = await import('./brokerConnection');
    const connection = await resolveBrokerConnection(orgId, params.connection_id);
    if (!connection) {
      return { tool: 'get_option_chain', success: false, error: 'NO_BROKER_CONNECTION' };
    }

    try {
      return await fetchOptionChainForOrg(orgId, connection.id, params);
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        return { tool: 'get_option_chain', success: false, error: 'REAUTH_REQUIRED' };
      }
      throw err;
    }
  };
}
