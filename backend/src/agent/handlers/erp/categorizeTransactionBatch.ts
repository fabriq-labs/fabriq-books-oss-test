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
import { extractCacheUsage } from '../../../lib/ai/usage';
import { ERPMethodHandler } from './types';
import { ERPConnector } from '../../../lib/integrations/connectors/types';
import { AuthContext } from '../../../auth/types';
import logger from '../../../utils/logger';
import { aiActivityLogger } from '../../utils/aiActivityLogger';
import { llmTraceLogger } from '../../../lib/llm-trace-logger';
import {
  fetchAccountsForCategorization,
  fetchPostingsByIds,
  fetchHistoricalMappings,
  findFuzzyMatch,
  normalizeDescription,
  determineTransactionDirection,
  getFieldToUpdate,
  mapConfidenceLevel,
  buildBulkPrompt,
  buildBulkSystemPrompt,
  updatePostingWithCategorization,
  validateAccount,
  getAccountById,
  PostingForCategorization,
  AccountsGrouped,
  ConfidenceLevel,
  HistoricalMapping,
  BulkCategorizationItem,
  CATEGORIZATION_CONFIG,
} from './utils/categorizationUtils';

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
    use_historical_matching?: boolean; // Use past transactions for matching (default: true)
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
async function bulkCategorizeWithLLM(
  postings: PostingForCategorization[],
  accounts: AccountsGrouped,
  orgId: string
): Promise<{ results: Map<number, BulkCategorizationItem>; usage: { promptTokens?: number; completionTokens?: number; cachedPromptTokens?: number; cacheCreationTokens?: number } }> {
  const results = new Map<number, BulkCategorizationItem>();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCachedPromptTokens = 0;
  let totalCacheCreationTokens = 0;

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

      // Map results back to original indices
      for (const cat of llmResult.object.categorizations) {
        const originalIndex = chunkStartIndex + cat.index;
        results.set(originalIndex, {
          index: originalIndex,
          predicted_account_id: cat.predicted_account_id,
          confidence_score: cat.confidence_score,
          reasoning: cat.reasoning,
        });
      }

      logger.debug('Bulk LLM categorization chunk completed', {
        chunkStart: i,
        chunkSize: chunk.length,
        resultsCount: llmResult.object.categorizations.length,
      });
    } catch (error: any) {
      logger.error('Bulk LLM categorization chunk failed', {
        chunkStart: i,
        chunkSize: chunk.length,
        error: error.message,
      });
      // Continue with other chunks, failed ones will be marked as errors
    }
  }

  return {
    results,
    usage: {
      promptTokens: totalPromptTokens || undefined,
      completionTokens: totalCompletionTokens || undefined,
      cachedPromptTokens: totalCachedPromptTokens || undefined,
      cacheCreationTokens: totalCacheCreationTokens || undefined,
    },
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

    // Set default options
    const options = {
      skip_already_categorized: params.options?.skip_already_categorized ?? true,
      min_confidence: params.options?.min_confidence ?? ('medium' as ConfidenceLevel),
      dry_run: params.options?.dry_run ?? false,
      use_historical_matching: params.options?.use_historical_matching ?? true,
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

      logger.info('Starting optimized batch transaction categorization', {
        postingIdsCount: params.posting_ids?.length,
        postingsCount: params.postings?.length,
        options: params.options,
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

      // Step 3: Fetch historical mappings (if enabled)
      let historicalMappings: HistoricalMapping[] = [];
      if (params.options?.use_historical_matching !== false) {
        toolTracker.track('fetchHistoricalMappings', true);
        historicalMappings = await fetchHistoricalMappings(orgId);
        logger.warn('Historical mappings loaded', historicalMappings);
      }

      // Step 4: Process postings - separate into categories
      const results: BatchPostingResult[] = [];
      const postingsNeedingLLM: { posting: PostingForCategorization; originalIndex: number }[] = [];
      let historicalMatchCount = 0;

      for (let i = 0; i < postings.length; i++) {
        const posting = postings[i];
        const normalizedDescription = normalizeDescription(posting.description);


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
          });
          continue;
        }

        // Try historical matching
        if (historicalMappings.length > 0 && posting.description) {
          logger.debug('Step 4: attempting historical match', {
            postingId: posting.id,
            index: i,
            normalizedDescription,
            historicalCorpusSize: historicalMappings.length,
          });
          const match = findFuzzyMatch(posting.description, historicalMappings);
          if (match) {
            logger.debug('Step 4: historical match found', {
              postingId: posting.id,
              index: i,
              normalizedDescription,
              matchedDescription: match.descriptionNormalized,
              matchedAccountId: match.counterAccountId,
              matchedAccountName: match.counterAccountName,
              matchedClassification: match.classification,
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
                userId
              );
              applied = true;
            }

            results.push({
              posting_id: posting.id,
              predicted_account_id: match.counterAccountId,
              predicted_account_name: match.counterAccountName,
              confidence: mapConfidenceLevel(confidenceScore),
              confidence_score: confidenceScore,
              reasoning: `Historical match: similar to "${match.descriptionNormalized}"`,
              applied,
              skipped_reason: !meetsThreshold ? `Confidence below threshold` : undefined,
            });
            historicalMatchCount++;
            continue;
          }

          logger.debug('Step 4: no historical match found, queuing for LLM', {
            postingId: posting.id,
            index: i,
            normalizedDescription,
          });
        } else {
          logger.debug('Step 4: historical match skipped', {
            postingId: posting.id,
            index: i,
            reason: historicalMappings.length === 0 ? 'empty_historical_corpus' : 'missing_description',
            hasDescription: !!posting.description,
            historicalCorpusSize: historicalMappings.length,
          });
        }

        // Queue for LLM categorization
        postingsNeedingLLM.push({ posting, originalIndex: i });
        logger.debug('Step 4: posting added to LLM queue', {
          postingId: posting.id,
          index: i,
          llmQueueSize: postingsNeedingLLM.length,
        });
        // Add placeholder to maintain order
        results.push({
          posting_id: posting.id,
          predicted_account_id: null,
          predicted_account_name: null,
          confidence: null,
          confidence_score: null,
          reasoning: null,
          applied: false,
        });
      }

      // Step 5: Bulk LLM categorization — split by direction so each sub-batch gets
      // only the relevant account subset (A5): money_out → expense+liability,
      // money_in → income+asset.
      let llmTokenUsage: { promptTokens?: number; completionTokens?: number; cachedPromptTokens?: number; cacheCreationTokens?: number } = {};
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
          usage: { promptTokens?: number; completionTokens?: number; cachedPromptTokens?: number; cacheCreationTokens?: number }
        ) => {
          llmTokenUsage.promptTokens = (llmTokenUsage.promptTokens ?? 0) + (usage.promptTokens ?? 0);
          llmTokenUsage.completionTokens = (llmTokenUsage.completionTokens ?? 0) + (usage.completionTokens ?? 0);
          llmTokenUsage.cachedPromptTokens = (llmTokenUsage.cachedPromptTokens ?? 0) + (usage.cachedPromptTokens ?? 0);
          llmTokenUsage.cacheCreationTokens = (llmTokenUsage.cacheCreationTokens ?? 0) + (usage.cacheCreationTokens ?? 0);

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
                  userId
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
                error: 'LLM did not return a prediction for this posting',
              };
            }
          }
        };

        toolTracker.track('bulkCategorizeWithLLM', true);

        if (outQueue.length > 0) {
          const { results: outResults, usage } = await bulkCategorizeWithLLM(
            outQueue.map((p) => p.posting),
            moneyOutAccounts,
            orgId
          );
          await applyLLMResults(outQueue, outResults, usage);
        }

        if (inQueue.length > 0) {
          const { results: inResults, usage } = await bulkCategorizeWithLLM(
            inQueue.map((p) => p.posting),
            moneyInAccounts,
            orgId
          );
          await applyLLMResults(inQueue, inResults, usage);
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
