import { mapOptionChain, mapOptionQuote, countChainStats } from '../../lib/integrations/broker/connectors/questrade/questrade_option_mappers';
import { QT_OPTION_CHAIN_VFV, QT_OPTION_QUOTES_VFV } from './fixtures/questrade-responses';

describe('questrade_option_mappers', () => {
  it('maps option chain response', () => {
    const chain = mapOptionChain(1001, QT_OPTION_CHAIN_VFV, 'VFV.TO');
    expect(chain.underlyingSymbolId).toBe(1001);
    expect(chain.options.length).toBeGreaterThan(0);
    expect(chain.options[0].chainPerRoot[0].strikes[0].callSymbolId).toBeDefined();
  });

  it('maps option quotes', () => {
    const quote = mapOptionQuote(QT_OPTION_QUOTES_VFV.optionQuotes[0]);
    expect(quote.symbolId).toBe(900100);
    expect(quote.delta).toBe(0.42);
  });

  it('counts chain stats', () => {
    const chain = mapOptionChain(1001, QT_OPTION_CHAIN_VFV, 'VFV.TO');
    const stats = countChainStats(chain);
    expect(stats.expiryCount).toBe(chain.options.length);
    expect(stats.strikeCount).toBeGreaterThan(0);
  });
});
