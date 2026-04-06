/**
 * AI Activity Logger
 *
 * A reusable utility for logging all AI activities across the system.
 * Tracks LLM calls, tool usage, and results for audit, analytics, and debugging.
 *
 * Lightweight tracing for agent activity and LLM usage.
 */

import prisma from '../../lib/prisma';
import logger from '../../utils/logger';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Tool usage tracking structure
 */
export interface ToolUsage {
  name: string;
  calls: number;
  success: number;
}

/**
 * Input for logging an AI activity
 */
export interface AIActivityLogInput {
  orgId: string;
  userId?: string;

  // Activity identification
  activityType: string; // 'categorize_transaction', 'extract_invoice', etc.
  modelName: string; // Target model: 'posting', 'invoice', etc.
  recordId?: string; // ID of affected record

  // AI execution details
  llmModel: string; // 'gemini-2.0-flash-001', etc.
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;

  // Agentic execution tracking
  stepsCount?: number;
  toolsUsed?: ToolUsage[];

  // Result
  confidenceScore?: number;
  prediction?: any;
  applied: boolean;

  // Context for debugging
  inputSummary?: string;
  reasoning?: string;
  error?: string;
}

/**
 * Query options for retrieving activities
 */
export interface AIActivityQueryOptions {
  activityType?: string;
  modelName?: string;
  recordId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Token usage summary response
 */
export interface TokenUsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost?: number;
  activityBreakdown: Record<string, { promptTokens: number; completionTokens: number; count: number }>;
}

/**
 * AI Activity Logger - Singleton class for logging AI activities
 */
class AIActivityLogger {
  private static instance: AIActivityLogger;

  private constructor() {}

  static getInstance(): AIActivityLogger {
    if (!AIActivityLogger.instance) {
      AIActivityLogger.instance = new AIActivityLogger();
    }
    return AIActivityLogger.instance;
  }

  /**
   * Log an AI activity
   */
  async log(input: AIActivityLogInput): Promise<string> {
    try {
      const record = await prisma.ai_activity_log.create({
        data: {
          org_id: input.orgId,
          user_id: input.userId,
          activity_type: input.activityType,
          model_name: input.modelName,
          record_id: input.recordId,
          llm_model: input.llmModel,
          prompt_tokens: input.promptTokens,
          completion_tokens: input.completionTokens,
          duration_ms: input.durationMs,
          steps_count: input.stepsCount,
          tools_used: input.toolsUsed ? JSON.parse(JSON.stringify(input.toolsUsed)) : undefined,
          confidence_score: input.confidenceScore !== undefined ? new Decimal(input.confidenceScore) : undefined,
          prediction: input.prediction ? JSON.parse(JSON.stringify(input.prediction)) : undefined,
          applied: input.applied,
          input_summary: input.inputSummary,
          reasoning: input.reasoning,
          error: input.error,
        },
      });

      logger.debug('AI activity logged', {
        activityLogId: record.id,
        activityType: input.activityType,
        modelName: input.modelName,
        recordId: input.recordId,
        applied: input.applied,
      });

      return record.id;
    } catch (error) {
      logger.error('Failed to log AI activity', {
        error,
        activityType: input.activityType,
        modelName: input.modelName,
      });
      throw error;
    }
  }

  /**
   * Query activities for an organization
   */
  async getActivitiesByOrg(orgId: string, options?: AIActivityQueryOptions): Promise<any[]> {
    const where: any = { org_id: orgId };

    if (options?.activityType) {
      where.activity_type = options.activityType;
    }
    if (options?.modelName) {
      where.model_name = options.modelName;
    }
    if (options?.recordId) {
      where.record_id = options.recordId;
    }
    if (options?.startDate || options?.endDate) {
      where.created_at = {};
      if (options?.startDate) {
        where.created_at.gte = options.startDate;
      }
      if (options?.endDate) {
        where.created_at.lte = options.endDate;
      }
    }

    return prisma.ai_activity_log.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Get activity by ID
   */
  async getActivityById(id: string): Promise<any> {
    return prisma.ai_activity_log.findUnique({
      where: { id },
    });
  }

  /**
   * Get token usage summary for an organization
   */
  async getTokenUsageSummary(
    orgId: string,
    period: 'day' | 'week' | 'month' = 'month'
  ): Promise<TokenUsageSummary> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const activities = await prisma.ai_activity_log.findMany({
      where: {
        org_id: orgId,
        created_at: { gte: startDate },
      },
      select: {
        activity_type: true,
        prompt_tokens: true,
        completion_tokens: true,
      },
    });

    const summary: TokenUsageSummary = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      activityBreakdown: {},
    };

    for (const activity of activities) {
      const promptTokens = activity.prompt_tokens ?? 0;
      const completionTokens = activity.completion_tokens ?? 0;

      summary.totalPromptTokens += promptTokens;
      summary.totalCompletionTokens += completionTokens;

      if (!summary.activityBreakdown[activity.activity_type]) {
        summary.activityBreakdown[activity.activity_type] = {
          promptTokens: 0,
          completionTokens: 0,
          count: 0,
        };
      }

      summary.activityBreakdown[activity.activity_type].promptTokens += promptTokens;
      summary.activityBreakdown[activity.activity_type].completionTokens += completionTokens;
      summary.activityBreakdown[activity.activity_type].count += 1;
    }

    return summary;
  }

  /**
   * Get activities for a specific record
   */
  async getActivitiesForRecord(modelName: string, recordId: string, orgId: string): Promise<any[]> {
    return prisma.ai_activity_log.findMany({
      where: {
        org_id: orgId,
        model_name: modelName,
        record_id: recordId,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Helper to create a timer for measuring duration
   */
  startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }

  /**
   * Helper to track tool usage during an operation
   */
  createToolTracker(): {
    track: (toolName: string, success: boolean) => void;
    getUsage: () => ToolUsage[];
  } {
    const usage: Map<string, { calls: number; success: number }> = new Map();

    return {
      track: (toolName: string, success: boolean) => {
        const existing = usage.get(toolName) ?? { calls: 0, success: 0 };
        existing.calls += 1;
        if (success) {
          existing.success += 1;
        }
        usage.set(toolName, existing);
      },
      getUsage: () => {
        return Array.from(usage.entries()).map(([name, data]) => ({
          name,
          calls: data.calls,
          success: data.success,
        }));
      },
    };
  }
}

// Export singleton instance
export const aiActivityLogger = AIActivityLogger.getInstance();

// Export class for testing
export { AIActivityLogger };
