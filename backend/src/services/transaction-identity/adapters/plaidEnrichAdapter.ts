import {
  EnrichTransactionDirection,
  type ClientProvidedTransaction,
} from 'plaid';
import { getPlaidClient, isPlaidConfigured } from '../../../plaid/plaid.client';
import logger from '../../../utils/logger';
import type {
  EnrichBatchItem,
  EnrichContext,
  EnrichedIdentity,
  TransactionIdentityEnricher,
} from '../types';
import { toMerchantKey } from '../types';
import { LegacyNormalizeAdapter } from './legacyNormalizeAdapter';

const MAX_ENRICH_BATCH = 100;

/**
 * Plaid Enrich adapter. Selected when CATEGORIZE_MERCHANT_KEY_PROVIDER=plaid.
 * Same PLAID_CLIENT_ID / PLAID_SECRET as Transactions.
 * On API failure, falls back to Legacy for that batch.
 */
export class PlaidEnrichAdapter implements TransactionIdentityEnricher {
  readonly id = 'plaid_enrich' as const;
  private readonly legacy = new LegacyNormalizeAdapter();

  supports(_ctx: EnrichContext): boolean {
    return isPlaidConfigured();
  }

  async enrichBatch(
    items: EnrichBatchItem[],
    ctx: EnrichContext
  ): Promise<Map<string, EnrichedIdentity>> {
    if (items.length === 0) return new Map();

    const legacyMap = await this.legacy.enrichBatch(items, ctx);

    try {
      const client = getPlaidClient();
      const accountType = ctx.accountType ?? 'depository';
      const out = new Map<string, EnrichedIdentity>();

      for (let i = 0; i < items.length; i += MAX_ENRICH_BATCH) {
        const chunk = items.slice(i, i + MAX_ENRICH_BATCH);
        const transactions: ClientProvidedTransaction[] = chunk.map((item) => ({
          id: item.id,
          description: item.description?.trim() || 'UNKNOWN',
          amount: Math.abs(item.amount ?? 0),
          direction:
            item.direction === 'INFLOW'
              ? EnrichTransactionDirection.Inflow
              : EnrichTransactionDirection.Outflow,
          iso_currency_code: (item.currency ?? 'USD').toUpperCase(),
        }));

        const response = await client.transactionsEnrich({
          account_type: accountType,
          transactions,
        });

        const enriched = response.data.enriched_transactions ?? [];
        const byId = new Map(enriched.map((t) => [t.id, t]));

        for (const item of chunk) {
          const row = byId.get(item.id);
          const merchantName = row?.enrichments?.merchant_name?.trim() || null;
          if (merchantName) {
            out.set(item.id, {
              merchantKey: toMerchantKey(merchantName),
              displayName: merchantName,
              provider: 'plaid_enrich',
              confidence: 0.95,
            });
          } else {
            out.set(item.id, legacyMap.get(item.id)!);
          }
        }
      }

      logger.info('Plaid Enrich identity batch complete', {
        orgId: ctx.orgId,
        count: items.length,
        plaidHits: [...out.values()].filter((v) => v.provider === 'plaid_enrich').length,
      });

      return out;
    } catch (error: any) {
      logger.warn('Plaid Enrich failed; falling back to LegacyNormalizeAdapter', {
        orgId: ctx.orgId,
        error: error?.response?.data ?? error?.message ?? String(error),
        count: items.length,
      });
      return legacyMap;
    }
  }
}
