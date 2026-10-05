import { z } from 'zod';
import { LLMService } from '../../../lib/llm';
import logger from '../../../utils/logger';
import type {
  EnrichBatchItem,
  EnrichContext,
  EnrichedIdentity,
  TransactionIdentityEnricher,
} from '../types';
import { toMerchantKey } from '../types';
import { MERCHANT_KEY_CANON_RULES, MERCHANT_KEY_FEW_SHOTS } from '../merchantKeyCanonPrompt';
import { LegacyNormalizeAdapter } from './legacyNormalizeAdapter';

const MAX_LLM_NORMALIZE_BATCH = 40;

/** Task key → LLM_MODEL_MERCHANT_KEY (falls back to LLM_MODEL). */
export const MERCHANT_KEY_LLM_TASK = 'merchant_key';

const normalizeBatchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().describe('Echo the input id unchanged'),
      merchant_key: z
        .string()
        .describe(
          'Shortest stable lowercase brand core (e.g. "soul fish", "marathon"). Expand truncations; drop cafe/restaurant/#n; never city-only.'
        ),
    })
  ),
});

type NormalizeBatchResult = z.infer<typeof normalizeBatchSchema>;

const SYSTEM_PROMPT = `You produce a stable merchant identity key from bank transaction descriptions for exact historical matching.

${MERCHANT_KEY_CANON_RULES}

${MERCHANT_KEY_FEW_SHOTS}

Return exactly one item per input id; echo each id unchanged.`;

/**
 * LLM merchant key normalizer.
 * Uses LLM_MODEL_MERCHANT_KEY when set, else LLM_MODEL, via
 * LLMService.generateStructuredObjectTraced. On failure → LegacyNormalizeAdapter.
 */
export class LlmNormalizeAdapter implements TransactionIdentityEnricher {
  readonly id = 'llm' as const;
  private readonly legacy = new LegacyNormalizeAdapter();
  private readonly llm = LLMService.getInstance();

  supports(_ctx: EnrichContext): boolean {
    return Boolean(process.env.LLM_PROVIDER?.trim() && process.env.LLM_MODEL?.trim());
  }

  async enrichBatch(
    items: EnrichBatchItem[],
    ctx: EnrichContext
  ): Promise<Map<string, EnrichedIdentity>> {
    if (items.length === 0) return new Map();

    const legacyMap = await this.legacy.enrichBatch(items, ctx);

    try {
      const out = new Map<string, EnrichedIdentity>();

      for (let i = 0; i < items.length; i += MAX_LLM_NORMALIZE_BATCH) {
        const chunk = items.slice(i, i + MAX_LLM_NORMALIZE_BATCH);
        const userPrompt = `Return the canonical merchant_key for each transaction (shortest stable brand core; see system rules + examples):

${chunk
  .map((item) => `- id=${item.id} | description=${JSON.stringify(item.description ?? '')}`)
  .join('\n')}

Return exactly ${chunk.length} items.`;

        const { object, llmModel } = await this.llm.generateStructuredObjectTraced<NormalizeBatchResult>({
          task: MERCHANT_KEY_LLM_TASK,
          schema: normalizeBatchSchema,
          system: SYSTEM_PROMPT,
          prompt: userPrompt,
          temperature: 0,
          orgId: ctx.orgId,
          userId: ctx.userId,
          queryType: 'merchant_key_normalize',
          question: `Normalize merchant_key for ${chunk.length} postings`,
          modelName: 'posting',
          applied: false,
          inputSummary: `merchant_key normalize batch=${chunk.length}`,
        });

        const byId = new Map(object.items.map((row) => [row.id, row]));
        for (const item of chunk) {
          const row = byId.get(item.id);
          const key = toMerchantKey(row?.merchant_key);
          if (key) {
            out.set(item.id, {
              merchantKey: key,
              displayName: key,
              provider: 'llm',
              confidence: 0.85,
            });
          } else {
            out.set(item.id, legacyMap.get(item.id)!);
          }
        }

        logger.debug('LLM normalize chunk complete', {
          orgId: ctx.orgId,
          llmModel,
          chunkSize: chunk.length,
        });
      }

      logger.info('LLM normalize identity batch complete', {
        orgId: ctx.orgId,
        count: items.length,
        llmHits: [...out.values()].filter((v) => v.provider === 'llm').length,
      });

      return out;
    } catch (error: any) {
      logger.warn('LLM normalize failed; falling back to LegacyNormalizeAdapter', {
        orgId: ctx.orgId,
        error: error?.message ?? String(error),
        count: items.length,
      });
      return legacyMap;
    }
  }
}
