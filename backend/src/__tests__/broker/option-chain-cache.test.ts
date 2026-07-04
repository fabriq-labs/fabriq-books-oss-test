import {
  getCachedOptionChain,
  invalidateOptionChainCache,
  torontoDateKey,
  upsertOptionChainCache,
} from '../../lib/integrations/broker/option_chain/option_chain_cache_service';
import type { BrokerOptionChainDTO } from '../../lib/integrations/broker/connectors/types';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    option_chain_cache: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import prisma from '../../lib/prisma';

const mockChain: BrokerOptionChainDTO = {
  underlyingSymbolId: 1001,
  underlyingSymbol: 'VFV.TO',
  options: [],
};

describe('option_chain_cache_service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns cache hit for same Toronto calendar day', async () => {
    const refreshedAt = new Date();
    (prisma.option_chain_cache.findUnique as jest.Mock).mockResolvedValue({
      org_id: 'org_1',
      chain_json: mockChain,
      refreshed_at: refreshedAt,
    });

    const result = await getCachedOptionChain('org_1', 'conn_1', 1001);
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.chain.underlyingSymbol).toBe('VFV.TO');
    }
  });

  it('returns miss when refreshed on a prior day', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    (prisma.option_chain_cache.findUnique as jest.Mock).mockResolvedValue({
      org_id: 'org_1',
      chain_json: mockChain,
      refreshed_at: yesterday,
    });

    const result = await getCachedOptionChain('org_1', 'conn_1', 1001);
    expect(result.hit).toBe(false);
  });

  it('upserts cache row', async () => {
    const now = new Date();
    (prisma.option_chain_cache.upsert as jest.Mock).mockResolvedValue({ refreshed_at: now });
    const refreshedAt = await upsertOptionChainCache({
      orgId: 'org_1',
      connectionId: 'conn_1',
      underlyingSymbol: 'VFV.TO',
      underlyingSymbolId: 1001,
      chain: mockChain,
    });
    expect(refreshedAt).toEqual(now);
    expect(prisma.option_chain_cache.upsert).toHaveBeenCalled();
  });

  it('invalidates cache row', async () => {
    await invalidateOptionChainCache('conn_1', 1001);
    expect(prisma.option_chain_cache.deleteMany).toHaveBeenCalledWith({
      where: { connection_id: 'conn_1', underlying_symbol_id: 1001 },
    });
  });

  it('formats Toronto date key', () => {
    expect(torontoDateKey(new Date('2026-06-28T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
