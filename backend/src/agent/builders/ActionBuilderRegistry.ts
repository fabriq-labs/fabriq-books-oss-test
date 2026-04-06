/**
 * Action Builder Registry
 *
 * Maps (goal_model, step) → deterministic action builder.
 * When a builder is registered, completeStep runs it inline instead of
 * letting the LLM drive the action step (saving an LLM round-trip and
 * eliminating nondeterminism).
 *
 * If no builder matches, the LLM fallback path (queueAction/queueActionBatch
 * tools + auto-continuation) handles the step as before.
 */

import { AuthContext } from '../../auth/types';
import { PlanStep } from '../tools/sessionTools';

export interface ActionBuildResult {
  actionType: string;
  pendingActions: Array<{
    title: string;
    description?: string;
    payload: Record<string, any>;
    confidence: 'high' | 'medium' | 'low';
    confidence_score?: number;
  }>;
  summary: string;
  contextUpdate?: Record<string, any>;
}

export interface ActionBuilder {
  /**
   * Return true if this builder handles the given goal_model + step + context combination.
   * accumulatedContext is passed so builders can self-select based on available data.
   * First match wins.
   */
  matches(goalModel: string | null, step: PlanStep, accumulatedContext?: Record<string, any>): boolean;

  /**
   * Build pending actions from accumulated_context.
   * Pure data transformation — no LLM call.
   */
  build(
    accumulatedContext: Record<string, any>,
    session: { id: string; goal: string; goal_model: string | null; mode: string },
    auth: AuthContext,
  ): Promise<ActionBuildResult>;
}

// ── Registry ────────────────────────────────────────────────────

const BUILDERS: ActionBuilder[] = [];

export const ActionBuilderRegistry = {
  register(builder: ActionBuilder) {
    BUILDERS.push(builder);
  },

  /**
   * Find the first builder that claims this step.
   * Pass accumulatedContext so builders can inspect available data.
   */
  get(goalModel: string | null, step: PlanStep, accumulatedContext?: Record<string, any>): ActionBuilder | null {
    return BUILDERS.find((b) => b.matches(goalModel, step, accumulatedContext)) || null;
  },
};
