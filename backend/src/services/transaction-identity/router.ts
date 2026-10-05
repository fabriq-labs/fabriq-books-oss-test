import logger from '../../utils/logger';
import { isPlaidConfigured } from '../../plaid/plaid.client';
import { LegacyNormalizeAdapter } from './adapters/legacyNormalizeAdapter';
import { LlmNormalizeAdapter } from './adapters/llmNormalizeAdapter';
import { PlaidEnrichAdapter } from './adapters/plaidEnrichAdapter';
import type { EnrichContext, TransactionIdentityEnricher } from './types';

const plaidAdapter = new PlaidEnrichAdapter();
const llmAdapter = new LlmNormalizeAdapter();
const legacyAdapter = new LegacyNormalizeAdapter();

export type MerchantKeyProviderEnv = 'plaid' | 'llm' | 'legacy';

/**
 * CATEGORIZE_MERCHANT_KEY_PROVIDER=plaid|llm|legacy (default: legacy).
 * Replaces PLAID_ENRICH_ENABLED / IDENTITY_ENRICHER_FORCE.
 */
export function resolveMerchantKeyProviderEnv(): MerchantKeyProviderEnv {
  const raw = (process.env.CATEGORIZE_MERCHANT_KEY_PROVIDER ?? 'legacy').trim().toLowerCase();
  if (raw === 'plaid' || raw === 'plaid_enrich') return 'plaid';
  if (raw === 'llm' || raw === 'llm_normalize') return 'llm';
  if (raw === 'legacy' || raw === 'legacy_normalize') return 'legacy';
  logger.warn('Unknown CATEGORIZE_MERCHANT_KEY_PROVIDER; using legacy', { value: raw });
  return 'legacy';
}

/**
 * Resolve identity enricher for a categorization batch from CATEGORIZE_MERCHANT_KEY_PROVIDER.
 */
export function resolveIdentityEnricher(ctx: EnrichContext): TransactionIdentityEnricher {
  const provider = resolveMerchantKeyProviderEnv();

  if (provider === 'plaid') {
    if (!isPlaidConfigured()) {
      logger.warn(
        'CATEGORIZE_MERCHANT_KEY_PROVIDER=plaid but PLAID_CLIENT_ID/SECRET missing; falling back to legacy',
        { orgId: ctx.orgId }
      );
      return legacyAdapter;
    }
    return plaidAdapter;
  }

  if (provider === 'llm') {
    if (!llmAdapter.supports(ctx)) {
      logger.warn(
        'CATEGORIZE_MERCHANT_KEY_PROVIDER=llm but LLM_PROVIDER/LLM_MODEL missing; falling back to legacy',
        { orgId: ctx.orgId }
      );
      return legacyAdapter;
    }
    return llmAdapter;
  }

  return legacyAdapter;
}
