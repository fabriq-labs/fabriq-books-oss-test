import prisma from '../../../prisma';
import logger from '../../../../utils/logger';
import type { BrokerOptionChainDTO } from '../connectors/types';
import { countChainStats } from '../connectors/questrade/questrade_option_mappers';

const TORONTO_TZ = 'America/Toronto';

export function torontoDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TORONTO_TZ });
}

export interface OptionChainCacheHit {
  hit: true;
  chain: BrokerOptionChainDTO;
  refreshedAt: Date;
  source: 'db';
}

export interface OptionChainCacheMiss {
  hit: false;
}

export type OptionChainCacheLookup = OptionChainCacheHit | OptionChainCacheMiss;

export async function getCachedOptionChain(
  orgId: string,
  connectionId: string,
  underlyingSymbolId: number
): Promise<OptionChainCacheLookup> {
  const row = await prisma.option_chain_cache.findUnique({
    where: {
      connection_id_underlying_symbol_id: {
        connection_id: connectionId,
        underlying_symbol_id: underlyingSymbolId,
      },
    },
  });

  if (!row || row.org_id !== orgId) {
    return { hit: false };
  }

  const today = torontoDateKey(new Date());
  if (torontoDateKey(row.refreshed_at) !== today) {
    return { hit: false };
  }

  return {
    hit: true,
    chain: row.chain_json as unknown as BrokerOptionChainDTO,
    refreshedAt: row.refreshed_at,
    source: 'db',
  };
}

export async function upsertOptionChainCache(params: {
  orgId: string;
  connectionId: string;
  underlyingSymbol: string;
  underlyingSymbolId: number;
  chain: BrokerOptionChainDTO;
}): Promise<Date> {
  const stats = countChainStats(params.chain);
  const row = await prisma.option_chain_cache.upsert({
    where: {
      connection_id_underlying_symbol_id: {
        connection_id: params.connectionId,
        underlying_symbol_id: params.underlyingSymbolId,
      },
    },
    create: {
      org_id: params.orgId,
      connection_id: params.connectionId,
      underlying_symbol: params.underlyingSymbol,
      underlying_symbol_id: params.underlyingSymbolId,
      chain_json: params.chain as unknown as object,
      expiry_count: stats.expiryCount,
      strike_count: stats.strikeCount,
    },
    update: {
      org_id: params.orgId,
      underlying_symbol: params.underlyingSymbol,
      chain_json: params.chain as unknown as object,
      expiry_count: stats.expiryCount,
      strike_count: stats.strikeCount,
      refreshed_at: new Date(),
    },
  });

  logger.info('Option chain cache upserted', {
    connectionId: params.connectionId,
    underlyingSymbol: params.underlyingSymbol,
    expiryCount: stats.expiryCount,
    strikeCount: stats.strikeCount,
  });

  return row.refreshed_at;
}

export async function invalidateOptionChainCache(
  connectionId: string,
  underlyingSymbolId: number
): Promise<void> {
  await prisma.option_chain_cache.deleteMany({
    where: { connection_id: connectionId, underlying_symbol_id: underlyingSymbolId },
  });
  logger.info('Option chain cache invalidated', { connectionId, underlyingSymbolId });
}
