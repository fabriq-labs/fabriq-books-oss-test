/**
 * Live Questrade option chain integration tests.
 *
 * Hits the real Questrade API (OAuth + market data endpoints). Requires:
 * - DATABASE_URL with a source_system row containing a valid refresh token
 * - option_chain_cache table (run prisma db push)
 * - DATABASE_URL must be the same DB that contains your connection (jest uses .env.test by default)
 *
 * Prefer the standalone script (uses backend/.env directly):
 *   cd backend && npx ts-node --transpile-only scripts/test-option-chain-live.ts VFV.TO
 *
 * Run via jest:
 *   QUESTRADE_USE_LIVE=true \
 *   QUESTRADE_CONNECTION_ID=<source_system_id> \
 *   QUESTRADE_ORG_ID=<org_id> \
 *   QUESTRADE_OPTION_SYMBOL=VFV.TO \
 *   npm test -- --testPathPattern="option-chain-live"
 */

import { fetchOptionChainForOrg } from '../../mcp/tools/getOptionChain';

const USE_LIVE = process.env.QUESTRADE_USE_LIVE === 'true';
const LIVE_CONNECTION_ID = process.env.QUESTRADE_CONNECTION_ID ?? '';
const LIVE_ORG_ID = process.env.QUESTRADE_ORG_ID ?? '';
const OPTION_SYMBOL = process.env.QUESTRADE_OPTION_SYMBOL ?? 'VFV.TO';

jest.setTimeout(120000);

const describeLive = USE_LIVE && LIVE_CONNECTION_ID && LIVE_ORG_ID ? describe : describe.skip;

describeLive('Option chain (live Questrade API)', () => {
  it('fetches option chain skeleton and live quotes via real HTTP', async () => {
    const result = await fetchOptionChainForOrg(LIVE_ORG_ID, LIVE_CONNECTION_ID, {
      symbol: OPTION_SYMBOL,
      include_quotes: true,
    });

    expect(result.success).toBe(true);
    expect(result.underlying?.symbol).toBeTruthy();
    expect(result.underlying?.lastPrice).toBeGreaterThan(0);
    expect(result.chain?.length).toBeGreaterThan(0);

    const strikesWithQuotes = result.chain!.flatMap((e) => e.strikes).filter((s) => s.quote != null);
    expect(strikesWithQuotes.length).toBeGreaterThan(0);

    console.log('Live option chain sample:', {
      symbol: result.underlying?.symbol,
      cache: result.cache,
      expiries: result.chain?.length,
      quotesReturned: result.truncation?.chainStats.quotesReturned,
      firstStrike: result.chain?.[0]?.strikes?.[0],
    });
  });

  it('returns chain structure without quote POST when include_quotes=false', async () => {
    const result = await fetchOptionChainForOrg(LIVE_ORG_ID, LIVE_CONNECTION_ID, {
      symbol: OPTION_SYMBOL,
      include_quotes: false,
    });

    expect(result.success).toBe(true);
    expect(result.chain?.length).toBeGreaterThan(0);
    expect(result.truncation?.chainStats.quotesReturned).toBe(0);
    for (const expiry of result.chain ?? []) {
      for (const strike of expiry.strikes) {
        expect(strike.quote).toBeUndefined();
      }
    }
  });
});
