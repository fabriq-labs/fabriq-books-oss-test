import { normalizeDescription } from '../../../agent/handlers/erp/utils/categorizationUtils';
import { LLMService } from '../../../lib/llm';
import * as plaidClient from '../../../plaid/plaid.client';
import { LegacyNormalizeAdapter } from '../adapters/legacyNormalizeAdapter';
import { LlmNormalizeAdapter } from '../adapters/llmNormalizeAdapter';
import { PlaidEnrichAdapter } from '../adapters/plaidEnrichAdapter';
import { resolveIdentityEnricher, resolveMerchantKeyProviderEnv } from '../router';
import { normalizeCountryToRegion, toMerchantKey } from '../types';

const KRISPY_DESC =
  'DEBIT CARD PURCHASE-PIN 12-27-24 MEMPHIS TN 2356 KRISPY KREME #1234';

describe('normalizeCountryToRegion', () => {
  it('maps US/USA/CA/Canada to US_CA', () => {
    expect(normalizeCountryToRegion('US')).toBe('US_CA');
    expect(normalizeCountryToRegion('Canada')).toBe('US_CA');
  });

  it('maps other countries to OTHER', () => {
    expect(normalizeCountryToRegion('IN')).toBe('OTHER');
  });
});

describe('LegacyNormalizeAdapter', () => {
  const adapter = new LegacyNormalizeAdapter();
  const ctx = { orgId: 'org_test', country: 'IN' };

  it('merchantKey equals normalizeDescription output', async () => {
    const map = await adapter.enrichBatch([{ id: 'p1', description: KRISPY_DESC }], ctx);
    expect(map.get('p1')!.provider).toBe('legacy_normalize');
    expect(map.get('p1')!.merchantKey).toBe(normalizeDescription(KRISPY_DESC));
  });
});

describe('resolveMerchantKeyProviderEnv / resolveIdentityEnricher', () => {
  const prev = process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER;
  const prevLlmProvider = process.env.LLM_PROVIDER;
  const prevLlmModel = process.env.LLM_MODEL;

  afterEach(() => {
    if (prev === undefined) delete process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER;
    else process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER = prev;
    if (prevLlmProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevLlmProvider;
    if (prevLlmModel === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = prevLlmModel;
    jest.restoreAllMocks();
  });

  it('defaults to legacy', () => {
    delete process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER;
    expect(resolveMerchantKeyProviderEnv()).toBe('legacy');
    expect(resolveIdentityEnricher({ orgId: 'o', country: 'US' }).id).toBe('legacy_normalize');
  });

  it('CATEGORIZE_MERCHANT_KEY_PROVIDER=plaid → Plaid when configured', () => {
    process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER = 'plaid';
    jest.spyOn(plaidClient, 'isPlaidConfigured').mockReturnValue(true);
    expect(resolveIdentityEnricher({ orgId: 'o', country: 'US' }).id).toBe('plaid_enrich');
  });

  it('CATEGORIZE_MERCHANT_KEY_PROVIDER=plaid without credentials → Legacy', () => {
    process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER = 'plaid';
    jest.spyOn(plaidClient, 'isPlaidConfigured').mockReturnValue(false);
    expect(resolveIdentityEnricher({ orgId: 'o', country: 'US' }).id).toBe('legacy_normalize');
  });

  it('CATEGORIZE_MERCHANT_KEY_PROVIDER=llm → Llm when LLM configured', () => {
    process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER = 'llm';
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    expect(resolveIdentityEnricher({ orgId: 'o', country: 'US' }).id).toBe('llm');
  });

  it('CATEGORIZE_MERCHANT_KEY_PROVIDER=llm without LLM config → Legacy', () => {
    process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER = 'llm';
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    expect(resolveIdentityEnricher({ orgId: 'o', country: 'IN' }).id).toBe('legacy_normalize');
  });
});

describe('PlaidEnrichAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps merchant_name to merchantKey', async () => {
    jest.spyOn(plaidClient, 'isPlaidConfigured').mockReturnValue(true);
    jest.spyOn(plaidClient, 'getPlaidClient').mockReturnValue({
      transactionsEnrich: jest.fn().mockResolvedValue({
        data: {
          enriched_transactions: [
            { id: 'p1', enrichments: { merchant_name: 'Krispy Kreme' } },
          ],
        },
      }),
    } as any);

    const adapter = new PlaidEnrichAdapter();
    const map = await adapter.enrichBatch(
      [{ id: 'p1', description: KRISPY_DESC, amount: 12.5, direction: 'OUTFLOW' }],
      { orgId: 'o', country: 'US' }
    );

    expect(map.get('p1')!.provider).toBe('plaid_enrich');
    expect(map.get('p1')!.merchantKey).toBe(toMerchantKey('Krispy Kreme'));
  });

  it('falls back to Legacy when Enrich API throws', async () => {
    jest.spyOn(plaidClient, 'isPlaidConfigured').mockReturnValue(true);
    jest.spyOn(plaidClient, 'getPlaidClient').mockReturnValue({
      transactionsEnrich: jest.fn().mockRejectedValue(new Error('PRODUCT_NOT_READY')),
    } as any);

    const adapter = new PlaidEnrichAdapter();
    const map = await adapter.enrichBatch(
      [{ id: 'p1', description: KRISPY_DESC }],
      { orgId: 'o', country: 'US' }
    );

    expect(map.get('p1')!.provider).toBe('legacy_normalize');
    expect(map.get('p1')!.merchantKey).toBe(normalizeDescription(KRISPY_DESC));
  });
});

describe('LlmNormalizeAdapter', () => {
  const prevProvider = process.env.LLM_PROVIDER;
  const prevModel = process.env.LLM_MODEL;

  afterEach(() => {
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
    if (prevModel === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = prevModel;
    jest.restoreAllMocks();
  });

  it('supports when LLM_PROVIDER and LLM_MODEL are set', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    expect(new LlmNormalizeAdapter().supports({ orgId: 'o', country: 'US' })).toBe(true);
  });

  it('uses LLMService.generateStructuredObjectTraced and maps merchant_key', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    const llm = LLMService.getInstance();
    const spy = jest.spyOn(llm, 'generateStructuredObjectTraced').mockResolvedValue({
      object: {
        items: [{ id: 'p1', merchant_key: 'Krispy Kreme' }],
      },
      usage: { promptTokens: 10, completionTokens: 5 },
      llmModel: 'gpt-4o-mini',
      durationMs: 12,
    } as any);

    const adapter = new LlmNormalizeAdapter();
    const map = await adapter.enrichBatch(
      [{ id: 'p1', description: KRISPY_DESC }],
      { orgId: 'o', userId: 'u1', country: 'US' }
    );

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].orgId).toBe('o');
    expect(spy.mock.calls[0][0].userId).toBe('u1');
    expect(spy.mock.calls[0][0].queryType).toBe('merchant_key_normalize');
    expect(spy.mock.calls[0][0].task).toBe('merchant_key');
    expect(map.get('p1')!.provider).toBe('llm');
    expect(map.get('p1')!.merchantKey).toBe(toMerchantKey('Krispy Kreme'));
  });

  it('falls back to Legacy when generateStructuredObjectTraced throws', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    jest
      .spyOn(LLMService.getInstance(), 'generateStructuredObjectTraced')
      .mockRejectedValue(new Error('rate limit'));

    const adapter = new LlmNormalizeAdapter();
    const map = await adapter.enrichBatch(
      [{ id: 'p1', description: KRISPY_DESC }],
      { orgId: 'o', country: 'US' }
    );

    expect(map.get('p1')!.provider).toBe('legacy_normalize');
    expect(map.get('p1')!.merchantKey).toBe(normalizeDescription(KRISPY_DESC));
  });
});
