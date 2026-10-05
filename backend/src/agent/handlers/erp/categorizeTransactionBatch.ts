/**
 * Categorize Transaction Batch Handler (v2 - Optimized)
 *
 * AI-powered batch categorization with two key optimizations:
 * 1. Historical matching: Uses past approved transactions to skip LLM calls
 * 2. Bulk LLM calls: Processes multiple transactions in a single LLM call
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { getModel, getModelId } from '../../../lib/ai/modelProvider';
import { extractCacheUsage, extractCostUsd } from '../../../lib/ai/usage';
import { ERPMethodHandler } from './types';
import { ERPConnector } from '../../../lib/integrations/connectors/types';
import { AuthContext } from '../../../auth/types';
import logger from '../../../utils/logger';
import { aiActivityLogger } from '../../utils/aiActivityLogger';
import { llmTraceLogger } from '../../../lib/llm-trace-logger';
import {
  fetchAccountsForCategorization,
  fetchPostingsByIds,
  findExactHistoricalMatches,
  determineTransactionDirection,
  getFieldToUpdate,
  mapConfidenceLevel,
  buildBulkPrompt,
  buildBulkSystemPrompt,
  formatHistoricalMatchReasoning,
  updatePostingWithCategorization,
  resolveUseHistoricalMatching,
  resolveEntityForIdentity,
  validateAccount,
  getAccountById,
  PostingForCategorization,
  AccountsGrouped,
  ConfidenceLevel,
  BulkCategorizationItem,
  HistoricalMapping,
  CATEGORIZATION_CONFIG,
} from './utils/categorizationUtils';
import {
  resolveIdentityEnricher,
  toMerchantKey,
  type MerchantKeyProvider,
} from '../../../services/transaction-identity';

/**
 * Input parameters for batch transaction categorization
 */
interface CategorizeTransactionBatchParams {
  posting_ids?: string[];
  postings?: Array<{
    id: string;
    description: string;
    amount: number;
    value_date: string;
    account_id: string;
    account_name?: string;
    account_type?: string[];
    credit_account_id?: string;
    credit_account_type?: string[];
  }>;
  options?: {
    skip_already_categorized?: boolean; // Skip if counter-account exists (default: true)
    min_confidence?: ConfidenceLevel; // Threshold to auto-apply (default: 'medium')
    dry_run?: boolean; // Return predictions without applying (default: false)
    /** Explicit override; otherwise CATEGORIZE_USE_HISTORICAL_MATCHING env (default true). */
    use_historical_matching?: boolean;
  };
}

/**
 * Result for a single posting in batch
 */
interface BatchPostingResult {
  posting_id: string;
  predicted_account_id: string | null;
  predicted_account_name: string | null;
  confidence: ConfidenceLevel | null;
  confidence_score: number | null;
  reasoning: string | null;
  applied: boolean;
  skipped_reason?: string;
  error?: string;
  /** Persisted / proposed merchant key (debug / dry-run). */
  merchant_key?: string;
  merchant_key_provider?: MerchantKeyProvider | string;
}

/**
 * Summary of batch processing
 */
interface BatchSummary {
  total_processed: number;
  categorized_count: number;
  historical_match_count: number;
  llm_categorized_count: number;
  applied_count: number;
  skipped_count: number;
  skipped_by_reason: Record<string, number>;
  error_count: number;
}

/**
 * Output from batch categorization
 */
interface CategorizeTransactionBatchResult {
  success: boolean;
  data?: {
    results: BatchPostingResult[];
    summary: BatchSummary;
  };
  error?: string;
}

/**
 * Zod schema for bulk LLM response
 */
const bulkCategorizationSchema = z.object({
  categorizations: z.array(
    z.object({
      index: z.number().describe('The 0-based index of the transaction'),
      predicted_account_id: z.string().describe('The ID of the predicted account'),
      confidence_score: z.number().min(0).max(1).describe('Confidence score from 0.0 to 1.0'),
      reasoning: z.string().describe('Brief explanation of why this account was chosen'),
      merchant_key: z
        .string()
        .optional()
        .default('')
        .describe(
          'Shortest stable lowercase brand core (e.g. "soul fish", "marathon"). Expand truncations; drop cafe/restaurant/#n; never city-only.'
        ),
    })
  ),
});

type BulkCategorizationResponse = z.infer<typeof bulkCategorizationSchema>;

/**
 * Get minimum confidence score from level
 */
function getMinConfidenceScore(level: ConfidenceLevel): number {
  switch (level) {
    case 'high':
      return 0.8;
    case 'medium':
      return 0.5;
    case 'low':
      return 0.0;
  }
}

/**
 * Check if posting is already categorized
 */
function isAlreadyCategorized(posting: PostingForCategorization): boolean {
  const direction = determineTransactionDirection(
    posting.amount,
    posting.accountType,
    posting.creditAccountType,
    { strict: true }
  );
  if (direction === 'money_out') {
    return posting.accountId !== null && posting.creditAccountId !== null;
  } else {
    return posting.creditAccountId !== null && posting.accountId !== null;
  }
}

/**
 * Bulk categorize postings using a single LLM call
 */
function formatLlmProviderError(error: unknown): string {
  const err = error as { message?: string; data?: unknown; responseBody?: unknown; cause?: { message?: string } };
  const raw =
    (typeof err?.message === 'string' && err.message.trim()) ||
    (typeof err?.cause?.message === 'string' && err.cause.message.trim()) ||
    'LLM categorization request failed';
  // OpenRouter / AI SDK sometimes prefixes messages with whitespace or tabs
  return raw.replace(/^\s+/, '');
}

async function bulkCategorizeWithLLM(
  postings: PostingForCategorization[],
  accounts: AccountsGrouped,
  orgId: string
): Promise<{
  results: Map<number, BulkCategorizationItem>;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    cachedPromptTokens?: number;
    cacheCreationTokens?: number;
    costUsd?: number;
  };
  errors: string[];
}> {
  const results = new Map<number, BulkCategorizationItem>();
  const errors: string[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCachedPromptTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCostUsd: number | null = null;

  // Process in chunks of BULK_LLM_BATCH_SIZE
  const batchSize = CATEGORIZATION_CONFIG.BULK_LLM_BATCH_SIZE;

  for (let i = 0; i < postings.length; i += batchSize) {
    const chunk = postings.slice(i, i + batchSize);
    const chunkStartIndex = i;

    const systemPrompt = buildBulkSystemPrompt();
    const userPrompt = buildBulkPrompt(chunk, accounts);

    try {
      const llmResult = await generateObject({
        model: getModel('categorization'),
        schema: bulkCategorizationSchema,
        system: systemPrompt,
        prompt: userPrompt,
      });

      // Track token usage (including prompt-cache accounting from provider metadata)
      totalPromptTokens += llmResult.usage?.promptTokens ?? 0;
      totalCompletionTokens += llmResult.usage?.completionTokens ?? 0;
      const chunkCache = extractCacheUsage((llmResult as any).providerMetadata);
      totalCachedPromptTokens += chunkCache.cachedPromptTokens ?? 0;
      totalCacheCreationTokens += chunkCache.cacheCreationTokens ?? 0;
      const chunkCost = extractCostUsd({
        usage: llmResult.usage as any,
        providerMetadata: (llmResult as any).providerMetadata,
        responseBody: (llmResult as any).response?.body,
      });
      if (chunkCost != null) {
        totalCostUsd = (totalCostUsd ?? 0) + chunkCost;
      }

      // Map results back to original indices
      for (const cat of llmResult.object.categorizations) {
        const originalIndex = chunkStartIndex + cat.index;
        results.set(originalIndex, {
          index: originalIndex,
          predicted_account_id: cat.predicted_account_id,
          confidence_score: cat.confidence_score,
          reasoning: cat.reasoning,
          merchant_key: toMerchantKey(cat.merchant_key),
        });
      }

      logger.debug('Bulk LLM categorization chunk completed', {
        chunkStart: i,
        chunkSize: chunk.length,
        resultsCount: llmResult.object.categorizations.length,
      });
    } catch (error: any) {
      const providerError = formatLlmProviderError(error);
      errors.push(providerError);
      logger.error('Bulk LLM categorization chunk failed', {
        chunkStart: i,
        chunkSize: chunk.length,
        error: providerError,
      });
      // Continue with other chunks; caller fails hard if nothing was returned
    }
  }

  return {
    results,
    usage: {
      promptTokens: totalPromptTokens || undefined,
      completionTokens: totalCompletionTokens || undefined,
      cachedPromptTokens: totalCachedPromptTokens || undefined,
      cacheCreationTokens: totalCacheCreationTokens || undefined,
      costUsd: totalCostUsd ?? undefined,
    },
    errors,
  };
}

/**
 * Categorize Transaction Batch Handler
 */
export const categorizeTransactionBatchHandler: ERPMethodHandler = {
  method: 'categorizeTransactionBatch',
  requiresContext: false,
  description:
    'AI-powered batch categorization with historical matching and bulk LLM processing for efficiency.',

  validateParams(
    params?: CategorizeTransactionBatchParams,
    context?: any,
    auth?: AuthContext
  ): CategorizeTransactionBatchParams {
    if (!params) {
      throw new Error('categorizeTransactionBatch requires params with either posting_ids or postings');
    }

    if (!params.posting_ids && !params.postings) {
      throw new Error('categorizeTransactionBatch requires either posting_ids or postings array');
    }

    if (params.posting_ids && params.posting_ids.length === 0) {
      throw new Error('posting_ids array cannot be empty');
    }

    if (params.postings && params.postings.length === 0) {
      throw new Error('postings array cannot be empty');
    }

    // Set default options. Historical matching: explicit caller option overrides
    // CATEGORIZE_USE_HISTORICAL_MATCHING env; unset env defaults to true.
    const options = {
      skip_already_categorized: params.options?.skip_already_categorized ?? true,
      min_confidence: params.options?.min_confidence ?? ('medium' as ConfidenceLevel),
      dry_run: params.options?.dry_run ?? false,
      use_historical_matching: resolveUseHistoricalMatching(
        params.options?.use_historical_matching
      ),
    };

    return { ...params, options };
  },

  async execute(
    connector: ERPConnector,
    params: CategorizeTransactionBatchParams,
    context?: any,
    auth?: AuthContext
  ): Promise<CategorizeTransactionBatchResult> {
    const startTime = Date.now();
    const toolTracker = aiActivityLogger.createToolTracker();

    try {
      if (!auth?.user?.org_id) {
        throw new Error('Organization context is required');
      }

      const orgId = auth.user.org_id;
      const userId = auth.user.id;
      const llmModel = getModelId('categorization');
      // Explicit options.use_historical_matching overrides env; unset → env → default true.
      // Resolve here too: some callers invoke execute() without validateParams().
      const useHistoricalMatching = resolveUseHistoricalMatching(
        params.options?.use_historical_matching
      );

      logger.info('Starting optimized batch transaction categorization', {
        postingIdsCount: params.posting_ids?.length,
        postingsCount: params.postings?.length,
        options: { ...params.options, use_historical_matching: useHistoricalMatching },
        orgId,
      });

      // Step 1: Get all postings
      let postings: PostingForCategorization[] = [];

      if (params.posting_ids) {
        toolTracker.track('fetchPostingsByIds', true);
        postings = await fetchPostingsByIds(params.posting_ids, orgId);

        const foundIds = new Set(postings.map((p) => p.id));
        const missingIds = params.posting_ids.filter((id) => !foundIds.has(id));
        if (missingIds.length > 0) {
          logger.warn('Some posting IDs not found', { missingIds, orgId });
        }
      } else if (params.postings) {
        postings = params.postings.map((p) => ({
          id: p.id,
          description: p.description,
          amount: p.amount,
          valueDate: p.value_date ? new Date(p.value_date) : null,
          accountId: p.account_id ?? null,
          accountName: p.account_name ?? null,
          accountType: p.account_type ?? [],
          creditAccountId: p.credit_account_id ?? null,
          creditAccountName: null,
          creditAccountType: p.credit_account_type ?? [],
          categoryId: null,
          aiCatScore: null,
        }));
      }

      if (postings.length === 0) {
        return {
          success: true,
          data: {
            results: [],
            summary: {
              total_processed: 0,
              categorized_count: 0,
              historical_match_count: 0,
              llm_categorized_count: 0,
              applied_count: 0,
              skipped_count: 0,
              skipped_by_reason: {},
              error_count: 0,
            },
          },
        };
      }

      // Step 2: Fetch available accounts
      toolTracker.track('fetchAccountsForCategorization', true);
      const accounts = await fetchAccountsForCategorization(orgId);

      const totalAccounts =
        accounts.expense.length + accounts.income.length + accounts.asset.length + accounts.liability.length;

      if (totalAccounts === 0) {
        throw new Error('No accounts available for categorization');
      }

      // Step 2b: Resolve merchant keys (only when historical matching is on)
      // Prefer persisted posting.merchant_key; enrich only unkeyed rows (Plaid/Legacy).
      type ResolvedIdentity = {
        merchantKey: string;
        provider: MerchantKeyProvider;
      };
      const identityByPostingId = new Map<string, ResolvedIdentity>();

      if (useHistoricalMatching) {
        const entityIdentity = await resolveEntityForIdentity(orgId);
        const enrichCtx = {
          orgId,
          userId,
          legalEntityId: entityIdentity.legalEntityId,
          country: entityIdentity.country,
          accountType: 'depository' as const,
        };
        const identityEnricher = resolveIdentityEnricher(enrichCtx);
        toolTracker.track(`identityEnricher:${identityEnricher.id}`, true);

        const needsEnrich: PostingForCategorization[] = [];
        for (const p of postings) {
          const stored = toMerchantKey(p.merchantKey);
          if (stored) {
            identityByPostingId.set(p.id, {
              merchantKey: stored,
              provider: (p.merchantKeyProvider as MerchantKeyProvider) || 'legacy_normalize',
            });
          } else {
            needsEnrich.push(p);
          }
        }

        if (needsEnrich.length > 0) {
          const enriched = await identityEnricher.enrichBatch(
            needsEnrich.map((p) => {
              let direction: 'INFLOW' | 'OUTFLOW' = 'OUTFLOW';
              try {
                const d = determineTransactionDirection(
                  p.amount,
                  p.accountType,
                  p.creditAccountType
                );
                direction = d === 'money_in' ? 'INFLOW' : 'OUTFLOW';
              } catch {
                direction = p.amount >= 0 ? 'INFLOW' : 'OUTFLOW';
              }
              return {
                id: p.id,
                description: p.description,
                amount: Math.abs(p.amount),
                direction,
                currency: 'USD',
              };
            }),
            enrichCtx
          );
          for (const [id, identity] of enriched) {
            if (!identity.merchantKey) continue;
            identityByPostingId.set(id, {
              merchantKey: identity.merchantKey,
              provider: identity.provider,
            });
          }
        }

        logger.info('Identity enrichment complete', {
          orgId,
          provider: identityEnricher.id,
          country: entityIdentity.country,
          storedKeys: postings.length - needsEnrich.length,
          enrichedKeys: needsEnrich.length,
          resolved: identityByPostingId.size,
        });
      } else {
        logger.info('Historical matching off — skipping identity enrich (LLM will supply merchant_key)', {
          orgId,
          count: postings.length,
        });
      }

      // Step 3: Exact SQL historical match for resolved keys (no fuzzy)
      let exactMatches = new Map<string, HistoricalMapping>();
      if (useHistoricalMatching && identityByPostingId.size > 0) {
        toolTracker.track('findExactHistoricalMatches', true);
        const keys = [...identityByPostingId.values()].map((v) => v.merchantKey);
        exactMatches = await findExactHistoricalMatches(orgId, keys);
        logger.info('Exact historical matches loaded', {
          orgId,
          queryKeys: keys.length,
          hits: exactMatches.size,
        });
      }

      // Step 4: Process postings - separate into categories
      const results: BatchPostingResult[] = [];
      const postingsNeedingLLM: { posting: PostingForCategorization; originalIndex: number }[] = [];
      let historicalMatchCount = 0;

      for (let i = 0; i < postings.length; i++) {
        const posting = postings[i];
        const identity = identityByPostingId.get(posting.id);
        const merchantKey = identity?.merchantKey ?? '';

        // Check if already categorized
        let postingAlreadyCategorized = false;
        if (params.options?.skip_already_categorized !== false) {
          try {
            postingAlreadyCategorized = isAlreadyCategorized(posting);
          } catch (directionError: any) {
            logger.debug('Step 4: direction detection failed while checking already categorized', {
              postingId: posting.id,
              index: i,
              error: directionError?.message,
              accountType: posting.accountType,
              creditAccountType: posting.creditAccountType,
              amount: posting.amount,
            });
            throw directionError;
          }
        }

        if (postingAlreadyCategorized) {
          logger.debug('Step 4: skipping posting because it is already categorized', {
            postingId: posting.id,
            index: i,
            accountId: posting.accountId,
            creditAccountId: posting.creditAccountId,
          });
          results.push({
            posting_id: posting.id,
            predicted_account_id: null,
            predicted_account_name: null,
            confidence: null,
            confidence_score: null,
            reasoning: null,
            applied: false,
            skipped_reason: 'Already categorized',
            merchant_key: merchantKey || undefined,
            merchant_key_provider: identity?.provider,
          });
          continue;
        }

        // Exact historical match only
        if (useHistoricalMatching && merchantKey) {
          const match = exactMatches.get(merchantKey);
          if (match) {
            logger.debug('Step 4: exact historical match found', {
              postingId: posting.id,
              index: i,
              merchantKey,
              matchedAccountId: match.counterAccountId,
              matchedAccountName: match.counterAccountName,
            });
            const direction = determineTransactionDirection(
              posting.amount,
              posting.accountType,
              posting.creditAccountType,
              { strict: true }
            );
            const fieldToUpdate = getFieldToUpdate(direction);
            const confidenceScore = CATEGORIZATION_CONFIG.HISTORICAL_MATCH_CONFIDENCE;
            const minScore = getMinConfidenceScore(params.options?.min_confidence ?? 'medium');
            const meetsThreshold = confidenceScore >= minScore;
            const shouldApply = !params.options?.dry_run && meetsThreshold;

            let applied = false;
            if (shouldApply) {
              await updatePostingWithCategorization(
                posting.id,
                match.counterAccountId,
                confidenceScore,
                fieldToUpdate,
                userId,
                {
                  merchantKey,
                  merchantKeyProvider: identity?.provider,
                }
              );
              applied = true;
            }

            results.push({
              posting_id: posting.id,
              predicted_account_id: match.counterAccountId,
              predicted_account_name: match.counterAccountName,
              confidence: mapConfidenceLevel(confidenceScore),
              confidence_score: confidenceScore,
              reasoning: formatHistoricalMatchReasoning(
                match.sourceReasoning,
                match.merchantKey || match.descriptionNormalized
              ),
              applied,
              skipped_reason: !meetsThreshold ? `Confidence below threshold` : undefined,
              merchant_key: merchantKey,
              merchant_key_provider: identity?.provider,
            });
            historicalMatchCount++;
            continue;
          }

          logger.debug('Step 4: no exact historical match, queuing for LLM', {
            postingId: posting.id,
            index: i,
            merchantKey,
          });
        } else {
          logger.debug('Step 4: historical match skipped', {
            postingId: posting.id,
            index: i,
            reason: !useHistoricalMatching
              ? 'historical_matching_disabled'
              : 'missing_merchant_key',
            merchantKey,
          });
        }

        // Queue for LLM categorization
        postingsNeedingLLM.push({ posting, originalIndex: i });
        logger.debug('Step 4: posting added to LLM queue', {
          postingId: posting.id,
          index: i,
          llmQueueSize: postingsNeedingLLM.length,
        });
        results.push({
          posting_id: posting.id,
          predicted_account_id: null,
          predicted_account_name: null,
          confidence: null,
          confidence_score: null,
          reasoning: null,
          applied: false,
          merchant_key: merchantKey || undefined,
          merchant_key_provider: identity?.provider,
        });
      }

      // Step 5: Bulk LLM categorization — split by direction so each sub-batch gets
      // only the relevant account subset (A5): money_out → expense+liability,
      // money_in → income+asset.
      let llmTokenUsage: {
        promptTokens?: number;
        completionTokens?: number;
        cachedPromptTokens?: number;
        cacheCreationTokens?: number;
        costUsd?: number;
      } = {};
      let llmCategorizedCount = 0;

      if (postingsNeedingLLM.length > 0) {
        // Direction-filtered account views
        const moneyOutAccounts: AccountsGrouped = {
          expense: accounts.expense,
          income: [],
          asset: [],
          liability: accounts.liability,
        };
        const moneyInAccounts: AccountsGrouped = {
          expense: [],
          income: accounts.income,
          asset: accounts.asset,
          liability: [],
        };

        // Split queue by direction
        const outQueue: { posting: PostingForCategorization; originalIndex: number }[] = [];
        const inQueue: { posting: PostingForCategorization; originalIndex: number }[] = [];

        for (const item of postingsNeedingLLM) {
          const dir = determineTransactionDirection(
            item.posting.amount,
            item.posting.accountType,
            item.posting.creditAccountType,
            { strict: true }
          );
          if (dir === 'money_out') {
            outQueue.push(item);
          } else {
            inQueue.push(item);
          }
        }

        logger.info('Calling LLM for uncategorized postings (direction-split)', {
          moneyOut: outQueue.length,
          moneyIn: inQueue.length,
          batchSize: CATEGORIZATION_CONFIG.BULK_LLM_BATCH_SIZE,
        });

        // Helper: process LLM results back into the results array
        const applyLLMResults = async (
          queue: { posting: PostingForCategorization; originalIndex: number }[],
          llmResults: Map<number, BulkCategorizationItem>,
          usage: {
            promptTokens?: number;
            completionTokens?: number;
            cachedPromptTokens?: number;
            cacheCreationTokens?: number;
            costUsd?: number;
          },
          providerErrors: string[] = []
        ) => {
          llmTokenUsage.promptTokens = (llmTokenUsage.promptTokens ?? 0) + (usage.promptTokens ?? 0);
          llmTokenUsage.completionTokens = (llmTokenUsage.completionTokens ?? 0) + (usage.completionTokens ?? 0);
          llmTokenUsage.cachedPromptTokens = (llmTokenUsage.cachedPromptTokens ?? 0) + (usage.cachedPromptTokens ?? 0);
          llmTokenUsage.cacheCreationTokens = (llmTokenUsage.cacheCreationTokens ?? 0) + (usage.cacheCreationTokens ?? 0);
          if (usage.costUsd != null) {
            llmTokenUsage.costUsd = (llmTokenUsage.costUsd ?? 0) + usage.costUsd;
          }

          const missingPredictionError =
            providerErrors[0] || 'LLM did not return a prediction for this posting';

          for (let llmIndex = 0; llmIndex < queue.length; llmIndex++) {
            const { posting, originalIndex } = queue[llmIndex];
            const llmResult = llmResults.get(llmIndex);

            if (llmResult) {
              const isValidAccount = await validateAccount(llmResult.predicted_account_id, orgId);
              if (!isValidAccount) {
                results[originalIndex] = {
                  posting_id: posting.id,
                  predicted_account_id: llmResult.predicted_account_id,
                  predicted_account_name: null,
                  confidence: mapConfidenceLevel(llmResult.confidence_score),
                  confidence_score: llmResult.confidence_score,
                  reasoning: llmResult.reasoning,
                  applied: false,
                  error: `Invalid account ID: ${llmResult.predicted_account_id}`,
                };
                continue;
              }

              const predictedAccount = await getAccountById(llmResult.predicted_account_id, orgId);
              const confidenceLevel = mapConfidenceLevel(llmResult.confidence_score);
              const minScore = getMinConfidenceScore(params.options?.min_confidence ?? 'medium');
              const meetsThreshold = llmResult.confidence_score >= minScore;
              const shouldApply = !params.options?.dry_run && meetsThreshold;

              const llmMerchantKey = toMerchantKey(llmResult.merchant_key);
              let applied = false;
              if (shouldApply) {
                const direction = determineTransactionDirection(
                  posting.amount,
                  posting.accountType,
                  posting.creditAccountType,
                  { strict: true }
                );
                const fieldToUpdate = getFieldToUpdate(direction);
                await updatePostingWithCategorization(
                  posting.id,
                  llmResult.predicted_account_id,
                  llmResult.confidence_score,
                  fieldToUpdate,
                  userId,
                  llmMerchantKey
                    ? { merchantKey: llmMerchantKey, merchantKeyProvider: 'llm' }
                    : undefined
                );
                applied = true;
              }

              results[originalIndex] = {
                posting_id: posting.id,
                predicted_account_id: llmResult.predicted_account_id,
                predicted_account_name: predictedAccount?.name ?? null,
                confidence: confidenceLevel,
                confidence_score: llmResult.confidence_score,
                reasoning: llmResult.reasoning,
                applied,
                skipped_reason: !meetsThreshold ? `Confidence below threshold` : undefined,
                merchant_key: llmMerchantKey || undefined,
                merchant_key_provider: llmMerchantKey ? 'llm' : undefined,
              };
              llmCategorizedCount++;
            } else {
              results[originalIndex] = {
                posting_id: posting.id,
                predicted_account_id: null,
                predicted_account_name: null,
                confidence: null,
                confidence_score: null,
                reasoning: null,
                applied: false,
                error: missingPredictionError,
              };
            }
          }
        };

        toolTracker.track('bulkCategorizeWithLLM', true);

        if (outQueue.length > 0) {
          const { results: outResults, usage, errors: outErrors } = await bulkCategorizeWithLLM(
            outQueue.map((p) => p.posting),
            moneyOutAccounts,
            orgId
          );
          // Provider/config failures (bad model id, auth, etc.) should fail the batch —
          // do not continue into reconciliation with uncategorized postings.
          if (outErrors.length > 0 && outResults.size === 0) {
            throw new Error(outErrors[0]);
          }
          await applyLLMResults(outQueue, outResults, usage, outErrors);
        }

        if (inQueue.length > 0) {
          const { results: inResults, usage, errors: inErrors } = await bulkCategorizeWithLLM(
            inQueue.map((p) => p.posting),
            moneyInAccounts,
            orgId
          );
          if (inErrors.length > 0 && inResults.size === 0) {
            throw new Error(inErrors[0]);
          }
          await applyLLMResults(inQueue, inResults, usage, inErrors);
        }
      }

      // Step 6: Calculate summary
      const skippedByReason: Record<string, number> = {};
      results.forEach((r) => {
        if (r.skipped_reason) {
          skippedByReason[r.skipped_reason] = (skippedByReason[r.skipped_reason] || 0) + 1;
        }
      });

      const summary: BatchSummary = {
        total_processed: results.length,
        categorized_count: results.filter((r) => r.predicted_account_id !== null).length,
        historical_match_count: historicalMatchCount,
        llm_categorized_count: llmCategorizedCount,
        applied_count: results.filter((r) => r.applied).length,
        skipped_count: results.filter((r) => r.skipped_reason !== undefined).length,
        skipped_by_reason: skippedByReason,
        error_count: results.filter((r) => r.error !== undefined).length,
      };

      const durationMs = Date.now() - startTime;

      // Step 7: Log single aggregated AI activity
      await aiActivityLogger.log({
        orgId,
        userId,
        activityType: 'categorize_transaction_batch',
        modelName: 'posting',
        recordId: undefined,
        llmModel,
        promptTokens: llmTokenUsage.promptTokens,
        completionTokens: llmTokenUsage.completionTokens,
        durationMs,
        stepsCount: Math.ceil(postingsNeedingLLM.length / CATEGORIZATION_CONFIG.BULK_LLM_BATCH_SIZE),
        toolsUsed: toolTracker.getUsage(),
        applied: summary.applied_count > 0,
        inputSummary: `Batch of ${postings.length} postings (${historicalMatchCount} historical, ${postingsNeedingLLM.length} LLM)`,
        reasoning: `Categorized ${summary.categorized_count}, applied ${summary.applied_count}, skipped ${summary.skipped_count}, errors ${summary.error_count}`,
        prediction: {
          summary,
          results_preview: results.slice(0, 5).map((r) => ({
            posting_id: r.posting_id,
            predicted_account_id: r.predicted_account_id,
            applied: r.applied,
          })),
        },
      });

      llmTraceLogger.logTrace({
        orgId,
        userId,
        modelName: 'posting',
        queryType: 'categorize_transaction_batch',
        question: `Batch categorize ${postings.length} postings (${historicalMatchCount} historical, ${postingsNeedingLLM.length} LLM)`,
        llmModel: llmModel,
        result: {
          text: `Categorized ${summary.categorized_count}, applied ${summary.applied_count}, skipped ${summary.skipped_count}, errors ${summary.error_count}`,
          steps: [],
          usage: {
            promptTokens: llmTokenUsage.promptTokens ?? 0,
            completionTokens: llmTokenUsage.completionTokens ?? 0,
            cachedPromptTokens: llmTokenUsage.cachedPromptTokens ?? null,
            cacheCreationTokens: llmTokenUsage.cacheCreationTokens ?? null,
            costUsd: llmTokenUsage.costUsd ?? null,
          },
        },
        durationMs,
        status: 'success',
      }).catch(() => {});

      logger.info('Optimized batch transaction categorization completed', {
        ...summary,
        durationMs,
        avgTimePerPosting: Math.round(durationMs / results.length),
        llmCallsCount: Math.ceil(postingsNeedingLLM.length / CATEGORIZATION_CONFIG.BULK_LLM_BATCH_SIZE),
      });

      return {
        success: true,
        data: {
          results,
          summary,
        },
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      logger.error('Batch transaction categorization failed', {
        error: error.message,
        durationMs,
      });

      if (auth?.user?.org_id) {
        await aiActivityLogger.log({
          orgId: auth.user.org_id,
          userId: auth.user.id,
          activityType: 'categorize_transaction_batch',
          modelName: 'posting',
          llmModel: getModelId('categorization'),
          durationMs,
          toolsUsed: toolTracker.getUsage(),
          applied: false,
          error: error.message,
        });
        llmTraceLogger.logTrace({
          orgId: auth.user.org_id,
          userId: auth.user.id,
          modelName: 'posting',
          queryType: 'categorize_transaction_batch',
          question: 'Batch categorize postings',
          llmModel: getModelId('categorization'),
          result: { text: '', steps: [], usage: { promptTokens: 0, completionTokens: 0 } },
          durationMs,
          status: 'error',
          errorMessage: error.message,
        }).catch(() => {});
      }

      return {
        success: false,
        error: error.message,
      };
    }
  },
};
