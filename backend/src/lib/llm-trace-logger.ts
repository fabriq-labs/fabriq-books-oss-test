import prisma from './prisma';
import logger from '../utils/logger';
import { extractCacheUsage, resolveCacheUsage, type CacheUsage } from './ai/usage';

interface TraceStep {
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, any>;
  }>;
  toolResults?: Array<{
    toolName: string;
    result: any;
  }>;
  text?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  /** Provider-specific metadata (carries prompt-cache token counts). */
  providerMetadata?: Record<string, any>;
}

interface LogTraceParams {
  orgId: string;
  userId?: string;
  sessionId?: string;
  modelName?: string;
  viewName?: string;
  recordId?: string;
  queryType?: string;
  question: string;
  llmModel: string;
  result: {
    text: string;
    steps: TraceStep[];
    usage: {
      promptTokens: number;
      completionTokens: number;
      /** Optional pre-computed cache usage (e.g. paths that don't expose steps). */
      cachedPromptTokens?: number | null;
      cacheCreationTokens?: number | null;
    };
    /** Top-level provider metadata (fallback when steps carry no metadata). */
    providerMetadata?: Record<string, any>;
  };
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

class LLMTraceLogger {
  /**
   * Log a complete agent trace (request + steps) to PostgreSQL.
   * Fire-and-forget: errors are logged but never propagated.
   */
  async logTrace(params: LogTraceParams): Promise<void> {
    try {
      const {
        orgId, userId, sessionId,
        modelName, viewName, recordId, queryType,
        question, llmModel,
        result, durationMs, status, errorMessage,
      } = params;

      const promptTokens = result.usage?.promptTokens ?? null;
      const completionTokens = result.usage?.completionTokens ?? null;
      const totalTokens = (promptTokens != null && completionTokens != null)
        ? promptTokens + completionTokens
        : null;

      // Prompt-cache accounting: prefer an explicit pre-computed value, else
      // derive from per-step / top-level provider metadata.
      const cacheUsage: CacheUsage =
        result.usage?.cachedPromptTokens != null || result.usage?.cacheCreationTokens != null
          ? {
              cachedPromptTokens: result.usage.cachedPromptTokens ?? null,
              cacheCreationTokens: result.usage.cacheCreationTokens ?? null,
            }
          : resolveCacheUsage({ steps: result.steps, providerMetadata: result.providerMetadata });

      // Collect all unique tool names called across steps
      const toolsCalled = this.extractToolsCalled(result.steps);

      await prisma.$transaction(async (tx) => {
        // 1. Create the parent trace row
        const trace = await tx.llm_trace.create({
          data: {
            org_id: orgId,
            user_id: userId ?? null,
            session_id: sessionId ?? null,
            model_name: modelName ?? null,
            view_name: viewName ?? null,
            record_id: recordId ?? null,
            query_type: queryType ?? null,
            question,
            llm_model: llmModel,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            cached_prompt_tokens: cacheUsage.cachedPromptTokens,
            cache_creation_tokens: cacheUsage.cacheCreationTokens,
            duration_ms: durationMs,
            steps_count: result.steps.length,
            tools_called: toolsCalled,
            response_text: result.text || null,
            status,
            error_message: errorMessage ?? null,
          },
        });

        // 2. Create step rows
        if (result.steps.length > 0) {
          const stepData = result.steps.map((step, index) => {
            const toolCalls = this.extractToolCalls(step);
            const toolResults = this.extractToolResults(step);
            const sqlQueries = this.extractSqlQueries(step);
            const stepCache = extractCacheUsage(step.providerMetadata);

            return {
              trace_id: trace.id,
              step_number: index,
              prompt_tokens: step.usage?.promptTokens ?? null,
              completion_tokens: step.usage?.completionTokens ?? null,
              cached_prompt_tokens: stepCache.cachedPromptTokens,
              cache_creation_tokens: stepCache.cacheCreationTokens,
              tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
              tool_results: toolResults.length > 0 ? toolResults : undefined,
              sql_queries: sqlQueries.length > 0 ? sqlQueries : undefined,
              response_text: step.text || null,
              status: 'success',
            };
          });

          await tx.llm_trace_step.createMany({ data: stepData });
        }
      });

    } catch (error: unknown) {
      // Fire-and-forget: never break the agent flow
      // P2028 = transaction not found (e.g. client disconnected before tx completed)
      const prismaError = error as { code?: string };
      if (prismaError?.code === 'P2028') {
        logger.debug('LLM trace skipped (client disconnected)', { code: 'P2028' });
        return;
      }
      logger.error('Failed to log LLM trace', error);
    }
  }

  private extractToolsCalled(steps: TraceStep[]): string[] {
    const names = new Set<string>();
    for (const step of steps) {
      if (step.toolCalls) {
        for (const tc of step.toolCalls) {
          names.add(tc.toolName);
        }
      }
    }
    return Array.from(names);
  }

  private extractToolCalls(step: TraceStep): Array<{ toolName: string; args: Record<string, any> }> {
    if (!step.toolCalls) return [];
    return step.toolCalls.map((tc) => ({
      toolName: tc.toolName,
      args: tc.args,
    }));
  }

  private extractToolResults(step: TraceStep): Array<{ toolName: string; resultPreview: string }> {
    if (!step.toolResults) return [];
    return step.toolResults.map((tr) => {
      const resultStr = typeof tr.result === 'string'
        ? tr.result
        : JSON.stringify(tr.result);
      return {
        toolName: tr.toolName,
        resultPreview: resultStr.substring(0, 2000),
      };
    });
  }

  private extractSqlQueries(step: TraceStep): Array<{ sql: string; description?: string; reasoning?: string }> {
    if (!step.toolCalls) return [];
    const queries: Array<{ sql: string; description?: string; reasoning?: string }> = [];

    for (const tc of step.toolCalls) {
      if (tc.toolName === 'analyticsQuery' && tc.args) {
        queries.push({
          sql: tc.args.sql || tc.args.query || '',
          description: tc.args.description,
          reasoning: tc.args.reasoning,
        });
      }
    }

    return queries;
  }
}

export const llmTraceLogger = new LLMTraceLogger();
