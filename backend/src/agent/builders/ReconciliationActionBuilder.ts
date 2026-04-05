/**
 * Reconciliation Action Builder
 *
 * Reads match_results (PostingWithSuggestions[]) from accumulated_context
 * and creates one pending action per posting using the best match.
 */

import { AuthContext } from '../../auth/types';
import { PlanStep } from '../tools/sessionTools';
import { ActionBuilder, ActionBuildResult } from './ActionBuilderRegistry';

interface MatchSuggestion {
  type: 'payment_receipt' | 'invoice';
  id: string;
  reference: string;
  amount: number;
  date: string;
  customer: string | null;
  confidence: 'high' | 'medium' | 'low';
}

interface PostingWithSuggestions {
  posting_id: string;
  posting_description: string | null;
  posting_amount: number;
  posting_date: string | null;
  suggestions: MatchSuggestion[];
}

export const ReconciliationActionBuilder: ActionBuilder = {
  matches(goalModel: string | null, step: PlanStep, accumulatedContext?: Record<string, any>): boolean {
    if (goalModel !== 'posting' || step.type !== 'action') return false;
    // Only claim this step when reconciliation match data is present in context.
    // Without this check it greedily intercepts non-reconciliation action steps
    // (e.g. categorize_transaction flows) and completes them with 0 actions.
    const raw = accumulatedContext?.match_results;
    // LLM may save the full tool output ({ tool, uiHint, data: [...] }) or just the array.
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : null);
    return Array.isArray(arr) && arr.length > 0;
  },

  async build(
    ctx: Record<string, any>,
    session: { id: string; goal: string; goal_model: string | null; mode: string },
    _auth: AuthContext,
  ): Promise<ActionBuildResult> {
    // Unwrap tool output envelope if present: { tool, uiHint, data: [...] }
    const raw = ctx.match_results;
    const matchResults: PostingWithSuggestions[] = Array.isArray(raw)
      ? raw
      : (Array.isArray(raw?.data) ? raw.data : []);

    const pendingActions: ActionBuildResult['pendingActions'] = [];

    for (const posting of matchResults) {
      if (!posting.suggestions || posting.suggestions.length === 0) continue;

      const bestMatch = posting.suggestions[0]; // Already sorted by confidence

      pendingActions.push({
        title: `Reconcile: ${posting.posting_description || posting.posting_id}`,
        description: `Match posting (${posting.posting_amount}) → ${bestMatch.type} ${bestMatch.reference} (${bestMatch.amount})`,
        payload: {
          posting_id: posting.posting_id,
          match_type: bestMatch.type,
          match_id: bestMatch.id,
          match_reference: bestMatch.reference,
          confidence_detail: `${bestMatch.confidence} confidence — amount: ${posting.posting_amount} vs ${bestMatch.amount}`,
          other_candidates: posting.suggestions.slice(1, 4).map((s) => ({
            id: s.id,
            reference: s.reference,
            confidence: s.confidence,
            amount: s.amount,
          })),
          preview: {
            posting: {
              description: posting.posting_description,
              amount: posting.posting_amount,
              date: posting.posting_date,
            },
            match: {
              reference: bestMatch.reference,
              amount: bestMatch.amount,
              customer: bestMatch.customer,
              date: bestMatch.date,
            },
          },
        },
        confidence: bestMatch.confidence,
      });
    }

    const high = pendingActions.filter((a) => a.confidence === 'high').length;
    const med = pendingActions.filter((a) => a.confidence === 'medium').length;
    const low = pendingActions.filter((a) => a.confidence === 'low').length;

    return {
      actionType: 'reconcile_posting',
      pendingActions,
      summary: `Queued ${pendingActions.length} reconciliation match(es) for review (${high} high, ${med} medium, ${low} low confidence)`,
      contextUpdate: {
        unmatched_count: matchResults.length,
        queued_matches: pendingActions.length,
        confidence_breakdown: { high, medium: med, low },
      },
    };
  },
};
