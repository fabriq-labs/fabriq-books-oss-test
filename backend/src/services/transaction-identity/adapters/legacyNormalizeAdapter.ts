import { normalizeDescription } from '../../../agent/handlers/erp/utils/categorizationUtils';
import type {
  EnrichBatchItem,
  EnrichContext,
  EnrichedIdentity,
  TransactionIdentityEnricher,
} from '../types';

/**
 * Wraps existing normalizeDescription behavior.
 * merchantKey === today's stripped narrative string.
 */
export class LegacyNormalizeAdapter implements TransactionIdentityEnricher {
  readonly id = 'legacy_normalize' as const;

  supports(_ctx: EnrichContext): boolean {
    return true;
  }

  async enrichBatch(
    items: EnrichBatchItem[],
    _ctx: EnrichContext
  ): Promise<Map<string, EnrichedIdentity>> {
    const out = new Map<string, EnrichedIdentity>();
    for (const item of items) {
      const merchantKey = normalizeDescription(item.description);
      out.set(item.id, {
        merchantKey,
        displayName: item.description?.trim() || undefined,
        provider: 'legacy_normalize',
        confidence: merchantKey ? 0.7 : 0,
      });
    }
    return out;
  }
}
