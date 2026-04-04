/**
 * Reconciliation Report Formatter
 *
 * Generates a plain-text summary from accumulated_context after
 * reconciliation actions have been reviewed.
 */

import { PlanStep } from '../tools/sessionTools';
import { ReportFormatter } from './ReportFormatterRegistry';

export const ReconciliationReportFormatter: ReportFormatter = {
  matches(goalModel: string | null, step: PlanStep, session?: any): boolean {
    if (goalModel !== 'posting' || step.type !== 'report') return false;
    // Only match reconciliation sessions by template ID.
    // Other posting sessions (e.g. categorise) with action steps must not use this formatter.
    return session?.template_id === 'atpl_reconcile';
  },

  format(ctx: Record<string, any>): string {
    const unmatchedCount = ctx.unmatched_count || 0;
    const queuedMatches = ctx.queued_matches || 0;
    const breakdown = ctx.confidence_breakdown || {};

    const lines: string[] = [
      'Reconciliation complete.',
      '',
      `Found ${unmatchedCount} unmatched posting(s).`,
      `${queuedMatches} match suggestion(s) queued for review:`,
    ];

    if (breakdown.high) lines.push(`  - ${breakdown.high} high confidence`);
    if (breakdown.medium) lines.push(`  - ${breakdown.medium} medium confidence`);
    if (breakdown.low) lines.push(`  - ${breakdown.low} low confidence`);

    const noMatch = unmatchedCount - queuedMatches;
    if (noMatch > 0) {
      lines.push(`${noMatch} posting(s) had no match candidates.`);
    }

    lines.push('', 'Review the suggested matches in the Pending Actions panel.');

    return lines.join('\n');
  },
};
