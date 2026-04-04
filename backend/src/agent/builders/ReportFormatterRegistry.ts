/**
 * Report Formatter Registry
 *
 * Maps (goal_model, step) → deterministic report formatter.
 * When a formatter is registered, the report step is handled inline
 * (no LLM round-trip). If no formatter matches, the LLM writes the
 * report (needed for analytical questions that require narrative synthesis).
 */

import { PlanStep } from '../tools/sessionTools';

export interface ReportFormatter {
  /**
   * Return true if this formatter handles the given goal_model + step combination.
   * First match wins.
   */
  matches(goalModel: string | null, step: PlanStep, session?: any): boolean;

  /**
   * Format a report from accumulated_context.
   * Pure function — no LLM, no DB calls.
   */
  format(accumulatedContext: Record<string, any>, session: any): string;
}

// ── Registry ────────────────────────────────────────────────────

const FORMATTERS: ReportFormatter[] = [];

export const ReportFormatterRegistry = {
  register(formatter: ReportFormatter) {
    FORMATTERS.push(formatter);
  },

  get(goalModel: string | null, step: PlanStep, session?: any): ReportFormatter | null {
    return FORMATTERS.find((f) => f.matches(goalModel, step, session)) || null;
  },
};
