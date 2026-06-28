import {
  computeEffectiveStrikeBand,
  DEFAULT_EXPIRY_LIMIT,
  DEFAULT_STRIKE_LIMIT,
  mergeQuotesIntoChain,
  trimOptionChain,
  type EffectiveOptionFilters,
} from '../../lib/integrations/broker/option_chain/option_chain_trim';
import type { BrokerOptionChainDTO } from '../../lib/integrations/broker/connectors/types';

function buildChain(strikeCounts: number[]): BrokerOptionChainDTO {
  const options = strikeCounts.map((count, idx) => {
    const d = new Date();
    d.setMonth(d.getMonth() + idx + 1);
    d.setDate(17);
    const strikes = Array.from({ length: count }, (_, i) => ({
      strikePrice: 120 + i,
      callSymbolId: 1000 + idx * 100 + i,
      putSymbolId: 2000 + idx * 100 + i,
    }));
    return {
      expiryDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-17T00:00:00-05:00`,
      optionExerciseType: 'American',
      chainPerRoot: [{ root: 'VFV', multiplier: 100, strikes }],
    };
  });
  return { underlyingSymbolId: 1001, underlyingSymbol: 'VFV.TO', options };
}

describe('option_chain_trim', () => {
  it('defaults call strike band to ATM through +20% OTM', () => {
    const band = computeEffectiveStrikeBand({ lastPrice: 100, optionType: 'Call' });
    expect(band.minStrike).toBe(100);
    expect(band.maxStrike).toBe(120);
  });

  it('limits expiries and strikes per defaults', () => {
    const chain = buildChain([20, 20, 20, 20, 20]);
    const filters: EffectiveOptionFilters = {
      optionType: 'Call',
      minStrike: 120,
      maxStrike: 140,
      expiryOffset: 0,
      expiryLimit: DEFAULT_EXPIRY_LIMIT,
      strikeOffset: 0,
      strikeLimit: DEFAULT_STRIKE_LIMIT,
      includeQuotes: true,
    };
    const result = trimOptionChain(chain, filters);
    expect(result.chain.length).toBe(DEFAULT_EXPIRY_LIMIT);
    expect(result.chain.every((e) => e.strikes.length <= DEFAULT_STRIKE_LIMIT)).toBe(true);
    expect(result.truncation.moreAvailable).toBe(true);
  });

  it('merges quotes by symbol id', () => {
    const chain = buildChain([3]);
    const filters: EffectiveOptionFilters = {
      optionType: 'Call',
      minStrike: 120,
      maxStrike: 125,
      expiryOffset: 0,
      expiryLimit: 1,
      strikeOffset: 0,
      strikeLimit: 3,
      includeQuotes: true,
    };
    const trimmed = trimOptionChain(chain, filters);
    const merged = mergeQuotesIntoChain(
      trimmed,
      [{ symbolId: 1000, bidPrice: 1.2, askPrice: 1.3, lastTradePrice: 1.25 }],
      'Call'
    );
    expect(merged.chain[0].strikes[0].quote?.bidPrice).toBe(1.2);
    expect(merged.truncation.chainStats.quotesReturned).toBe(1);
  });
});
