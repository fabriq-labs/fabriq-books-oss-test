/**
 * Categorize Transaction Handler
 *
 * AI-powered categorization for a single transaction.
 * Uses LLM to predict the appropriate counter-account based on transaction details.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { getModel, getModelId } from '../../../lib/ai/modelProvider';
import { ERPMethodHandler } from './types';
import { ERPConnector } from '../../../lib/integrations/connectors/types';
import { AuthContext } from '../../../auth/types';
import logger from '../../../utils/logger';
import { aiActivityLogger } from '../../utils/aiActivityLogger';
import { llmTraceLogger } from '../../../lib/llm-trace-logger';
import {
  fetchAccountsForCategorization,
  fetchPostingById,
  determineTransactionDirection,
  getFieldToUpdate,
  mapConfidenceLevel,
  buildSystemPrompt,
  buildUserPrompt,
  updatePostingWithCategorization,
  validateAccount,
  getAccountById,
  PostingForCategorization,
  AccountsGrouped,
  TransactionDirection,
  ConfidenceLevel,
} from './utils/categorizationUtils';

/**
 * Input parameters for single transaction categorization
 */
interface CategorizeTransactionParams {
  posting_id?: string;
  posting_data?: {
    id: string;
    description: string;
    amount: number;
    value_date: string;
    account_id: string;
    account_name?: string;
    account_type?: string[];
    credit_account_id?: string;
    credit_account_type?: string[];
  };
  options?: {
    include_alternatives?: boolean;
    max_alternatives?: number;
    apply?: boolean; // Whether to apply the prediction (default: true)
  };
}

/**
 * Alternative prediction
 */
interface AlternativePrediction {
  account_id: string;
  account_name: string;
  account_type: string;
  confidence_score: number;
  reasoning: string;
}

/**
 * Output from categorization
 */
interface CategorizeTransactionResult {
  success: boolean;
  data?: {
    posting_id: string;
    predicted_account_id: string;
    predicted_account_name: string;
    predicted_account_type: string;
    confidence: ConfidenceLevel;
    confidence_score: number;
    reasoning: string;
    alternatives?: AlternativePrediction[];
    transaction_direction: TransactionDirection;
    field_to_update: 'account_id' | 'credit_account_id';
    applied: boolean;
  };
  error?: string;
}

/**
 * Zod schema for LLM response
 */
const categorizationResponseSchema = z.object({
  predicted_account_id: z.string().describe('The ID of the predicted account from the provided list'),
  confidence_score: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score from 0.0 to 1.0'),
  reasoning: z.string().describe('Brief explanation of why this account was chosen'),
  alternatives: z
    .array(
      z.object({
        account_id: z.string(),
        confidence_score: z.number().min(0).max(1),
        reasoning: z.string(),
      })
    )
    .optional()
    .describe('Alternative account suggestions if uncertain'),
});

type CategorizationResponse = z.infer<typeof categorizationResponseSchema>;

/**
 * Categorize Transaction Handler
 */
export const categorizeTransactionHandler: ERPMethodHandler = {
  method: 'categorizeTransaction',
  requiresContext: false,
  description: 'AI-powered categorization for a single transaction. Predicts the appropriate counter-account based on transaction description and context.',

  validateParams(params?: CategorizeTransactionParams, context?: any, auth?: AuthContext): CategorizeTransactionParams {
    if (!params) {
      throw new Error('categorizeTransaction requires params with either posting_id or posting_data');
    }

    if (!params.posting_id && !params.posting_data) {
      throw new Error('categorizeTransaction requires either posting_id or posting_data');
    }

    if (params.posting_data) {
      if (!params.posting_data.id) {
        throw new Error('posting_data.id is required');
      }
      if (params.posting_data.amount === undefined) {
        throw new Error('posting_data.amount is required');
      }
    }

    // Set default options
    const options = {
      include_alternatives: params.options?.include_alternatives ?? true,
      max_alternatives: params.options?.max_alternatives ?? 3,
      apply: params.options?.apply ?? true,
    };

    return { ...params, options };
  },

  async execute(
    connector: ERPConnector,
    params: CategorizeTransactionParams,
    context?: any,
    auth?: AuthContext
  ): Promise<CategorizeTransactionResult> {
    const startTime = Date.now();
    const toolTracker = aiActivityLogger.createToolTracker();

    try {
      if (!auth?.user?.org_id) {
        throw new Error('Organization context is required');
      }

      const orgId = auth.user.org_id;
      const userId = auth.user.id;

      logger.debug('Starting transaction categorization', {
        postingId: params.posting_id,
        hasPostingData: !!params.posting_data,
        orgId,
      });

      // Step 1: Get posting data
      let posting: PostingForCategorization | null = null;

      if (params.posting_id) {
        toolTracker.track('fetchPostingById', true);
        posting = await fetchPostingById(params.posting_id, orgId);
        if (!posting) {
          throw new Error(`Posting not found: ${params.posting_id}`);
        }
      } else if (params.posting_data) {
        posting = {
          id: params.posting_data.id,
          description: params.posting_data.description,
          amount: params.posting_data.amount,
          valueDate: params.posting_data.value_date ? new Date(params.posting_data.value_date) : null,
          accountId: params.posting_data.account_id,
          accountName: params.posting_data.account_name ?? null,
          accountType: params.posting_data.account_type ?? [],
          creditAccountId: params.posting_data.credit_account_id ?? null,
          creditAccountName: null,
          creditAccountType: params.posting_data.credit_account_type ?? [],
          aiCatScore: null,
        };
      }

      if (!posting) {
        throw new Error('Failed to resolve posting data');
      }

      // Step 2: Fetch available accounts
      toolTracker.track('fetchAccountsForCategorization', true);
      const accounts = await fetchAccountsForCategorization(orgId, posting.accountId ?? undefined);

      const totalAccounts =
        accounts.expense.length + accounts.income.length + accounts.asset.length + accounts.liability.length;

      if (totalAccounts === 0) {
        throw new Error('No accounts available for categorization');
      }

      // Step 3: Determine transaction direction
      const direction = determineTransactionDirection(
        posting.amount,
        posting.accountType,
        posting.creditAccountType,
        { strict: true }
      );
      const fieldToUpdate = getFieldToUpdate(direction);

      logger.debug('Transaction analysis', {
        postingId: posting.id,
        amount: posting.amount,
        direction,
        fieldToUpdate,
        totalAccounts,
      });

      // Step 4: Build prompts
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(posting, accounts, direction);

      // Step 5: Call LLM
      toolTracker.track('generateObject', true);
      const llmModel = getModelId('categorization');

      const llmResult = await generateObject({
        model: getModel('categorization'),
        schema: categorizationResponseSchema,
        system: systemPrompt,
        prompt: userPrompt,
      });

      const prediction: CategorizationResponse = llmResult.object;

      logger.debug('LLM prediction received', {
        postingId: posting.id,
        predictedAccountId: prediction.predicted_account_id,
        confidenceScore: prediction.confidence_score,
        alternativesCount: prediction.alternatives?.length ?? 0,
      });

      // Step 6: Validate predicted account
      const isValidAccount = await validateAccount(prediction.predicted_account_id, orgId);
      if (!isValidAccount) {
        logger.warn('LLM predicted invalid account ID', {
          postingId: posting.id,
          predictedAccountId: prediction.predicted_account_id,
        });
        throw new Error(`Predicted account not found: ${prediction.predicted_account_id}`);
      }

      // Step 7: Get account details
      const predictedAccount = await getAccountById(prediction.predicted_account_id, orgId);
      if (!predictedAccount) {
        throw new Error(`Failed to fetch predicted account details: ${prediction.predicted_account_id}`);
      }

      // Step 8: Process alternatives
      let alternatives: AlternativePrediction[] | undefined;
      if (params.options?.include_alternatives && prediction.alternatives) {
        const maxAlts = params.options.max_alternatives ?? 3;
        alternatives = [];

        for (const alt of prediction.alternatives.slice(0, maxAlts)) {
          const altAccount = await getAccountById(alt.account_id, orgId);
          if (altAccount) {
            alternatives.push({
              account_id: alt.account_id,
              account_name: altAccount.name,
              account_type: altAccount.classification,
              confidence_score: alt.confidence_score,
              reasoning: alt.reasoning,
            });
          }
        }
      }

      // Step 9: Apply categorization if requested
      let applied = false;
      if (params.options?.apply) {
        await updatePostingWithCategorization(
          posting.id,
          prediction.predicted_account_id,
          prediction.confidence_score,
          fieldToUpdate,
          userId
        );
        applied = true;
        toolTracker.track('updatePosting', true);
      }

      const durationMs = Date.now() - startTime;
      const confidenceLevel = mapConfidenceLevel(prediction.confidence_score);

      // Step 10: Log AI activity
      await aiActivityLogger.log({
        orgId,
        userId,
        activityType: 'categorize_transaction',
        modelName: 'posting',
        recordId: posting.id,
        llmModel,
        promptTokens: llmResult.usage?.promptTokens,
        completionTokens: llmResult.usage?.completionTokens,
        durationMs,
        stepsCount: 1,
        toolsUsed: toolTracker.getUsage(),
        confidenceScore: prediction.confidence_score,
        prediction: {
          predicted_account_id: prediction.predicted_account_id,
          predicted_account_name: predictedAccount.name,
          alternatives: alternatives?.map((a) => a.account_id),
        },
        applied,
        inputSummary: `Description: ${posting.description?.substring(0, 100) || '(none)'}, Amount: ${posting.amount}`,
        reasoning: prediction.reasoning,
      });

      llmTraceLogger.logTrace({
        orgId,
        userId,
        modelName: 'posting',
        recordId: posting.id,
        queryType: 'categorize_transaction',
        question: `Categorize: ${posting.description?.substring(0, 200) || '(none)'}, Amount: ${posting.amount}`,
        llmModel: llmModel,
        result: {
          text: prediction.reasoning,
          steps: [],
          usage: { promptTokens: llmResult.usage?.promptTokens ?? 0, completionTokens: llmResult.usage?.completionTokens ?? 0 },
        },
        durationMs,
        status: 'success',
      }).catch(() => { });

      logger.info('Transaction categorization completed', {
        postingId: posting.id,
        predictedAccountId: prediction.predicted_account_id,
        predictedAccountName: predictedAccount.name,
        confidence: confidenceLevel,
        confidenceScore: prediction.confidence_score,
        applied,
        durationMs,
      });

      return {
        success: true,
        data: {
          posting_id: posting.id,
          predicted_account_id: prediction.predicted_account_id,
          predicted_account_name: predictedAccount.name,
          predicted_account_type: predictedAccount.classification,
          confidence: confidenceLevel,
          confidence_score: prediction.confidence_score,
          reasoning: prediction.reasoning,
          alternatives,
          transaction_direction: direction,
          field_to_update: fieldToUpdate,
          applied,
        },
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      logger.error('Transaction categorization failed', {
        postingId: params.posting_id,
        error: error.message,
        durationMs,
      });

      // Log failed activity
      if (auth?.user?.org_id) {
        await aiActivityLogger.log({
          orgId: auth.user.org_id,
          userId: auth.user.id,
          activityType: 'categorize_transaction',
          modelName: 'posting',
          recordId: params.posting_id,
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
          recordId: params.posting_id,
          queryType: 'categorize_transaction',
          question: `Categorize posting ${params.posting_id}`,
          llmModel: getModelId('categorization'),
          result: { text: '', steps: [], usage: { promptTokens: 0, completionTokens: 0 } },
          durationMs,
          status: 'error',
          errorMessage: error.message,
        }).catch(() => { });
      }

      return {
        success: false,
        error: error.message,
      };
    }
  },
};
