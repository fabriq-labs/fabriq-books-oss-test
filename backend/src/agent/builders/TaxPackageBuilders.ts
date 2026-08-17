import { AuthContext } from '../../auth/types';
import { PlanStep } from '../tools/sessionTools';
import { ActionBuilder, ActionBuildResult } from './ActionBuilderRegistry';
import { TAX_PACKAGE_KIND } from '../taxPackage/constants';
import type { UnmatchedLine } from '../taxPackage/types';

function unmatchedList(ctx: Record<string, any>): UnmatchedLine[] {
  const raw = ctx.unmatched_postings;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function isTaxPackage(ctx?: Record<string, any>): boolean {
  return ctx?.tax_package_kind === TAX_PACKAGE_KIND;
}

function coerceConfidence(raw: unknown): 'high' | 'medium' | 'low' {
  return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : 'medium';
}

export const TaxPackageBooksReadyBuilder: ActionBuilder = {
  matches(_goalModel, step: PlanStep, ctx?: Record<string, any>): boolean {
    if (step.type !== 'action') return false;
    if (!isTaxPackage(ctx)) return false;
    if (ctx?.workpapers) return false;
    return /categorise unmatched/i.test(step.title);
  },

  async build(
    ctx: Record<string, any>,
    _session: { id: string; goal: string; goal_model: string | null; mode: string },
    _auth: AuthContext,
  ): Promise<ActionBuildResult> {
    const unmatched = unmatchedList(ctx);
    const pendingActions: ActionBuildResult['pendingActions'] = unmatched
      .filter((u) => u.predicted_account_id || u.current_account_id)
      .map((u) => {
        const confidence = coerceConfidence(u.confidence);
        return {
          title: `Categorise: ${u.description}`,
          description: u.reason || 'Unmatched bank line — confirm category before sending the T1 pack.',
          payload: {
            posting_id: u.posting_id,
            predicted_account_id: u.predicted_account_id || u.current_account_id,
            predicted_account_name: u.predicted_account_name || u.current_account_name,
            confidence_score: confidence === 'high' ? 0.85 : confidence === 'medium' ? 0.65 : 0.4,
            description: u.description,
            amount: u.amount,
            value_date: u.value_date,
            account_name: u.current_account_name,
            currency: u.currency,
          },
          confidence,
          confidence_score: confidence === 'high' ? 0.85 : confidence === 'medium' ? 0.65 : 0.4,
        };
      });

    return {
      actionType: 'categorize_transaction',
      pendingActions,
      summary: pendingActions.length
        ? `Queued ${pendingActions.length} unmatched line(s) for categorisation before the T1 package can be assembled.`
        : 'No unmatched lines in the tax year — books-ready gate passed.',
      contextUpdate: {
        books_ready: pendingActions.length === 0,
        unmatched_count: unmatched.length,
        queued_categorise: pendingActions.length,
      },
    };
  },
};

export const TaxPackageSendBuilder: ActionBuilder = {
  matches(_goalModel, step: PlanStep, ctx?: Record<string, any>): boolean {
    if (step.type !== 'action') return false;
    if (!isTaxPackage(ctx)) return false;
    return Boolean(ctx?.workpapers) && /approve package/i.test(step.title);
  },

  async build(
    ctx: Record<string, any>,
    _session: { id: string; goal: string; goal_model: string | null; mode: string },
    _auth: AuthContext,
  ): Promise<ActionBuildResult> {
    const year = ctx.tax_year;
    const recipient = ctx.recipient || 'the CPA';
    const unmatched = Number(ctx.unmatched_count || ctx.unmatched_postings?.length || 0);
    return {
      actionType: 'approve_tax_package',
      pendingActions: [
        {
          title: `Approve TY ${year} T1 package for ${recipient}`,
          description: unmatched
            ? `Warning: ${unmatched} unmatched line(s) remain. Approve only if you have waived them.`
            : `Export the organizer workbook and cover letter for ${recipient}.`,
          payload: {
            tax_year: year,
            recipient,
            from_date: ctx.from_date,
            to_date: ctx.to_date,
            unmatched_count: unmatched,
            gap_count: Array.isArray(ctx.gaps) ? ctx.gaps.length : 0,
          },
          confidence: unmatched ? 'low' : 'high',
          confidence_score: unmatched ? 0.4 : 0.9,
        },
      ],
      summary: `Queued T1 package for ${recipient} (TY ${year}) pending your approval.`,
      contextUpdate: { package_queued: true },
    };
  },
};
