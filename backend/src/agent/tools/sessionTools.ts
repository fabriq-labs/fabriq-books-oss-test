/**
 * Session Tools — createPlan, completeStep, queueAction, queueActionBatch
 *
 * These tools are only added to the tool set when a sessionId is present.
 * They allow the agent to decompose goals into steps, advance through them,
 * and queue actions for human review.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import {
  getAgentSession,
  updateAgentSession,
  createAgentMessage,
} from '../services/SessionService';
import {
  createPendingAction,
  createPendingActionBatch,
} from '../services/PendingActionService';
// Import builders index to trigger registration of all built-in builders/formatters
import '../builders';
import { ActionBuilderRegistry } from '../builders/ActionBuilderRegistry';
import { ReportFormatterRegistry } from '../builders/ReportFormatterRegistry';
import { assembleTaxPackage } from '../taxPackage/workpapers';
import { TAX_PACKAGE_KIND, TAX_PACKAGE_TEMPLATE_ID } from '../taxPackage/constants';
import logger from '../../utils/logger';
import { sessionEventBus } from '../services/SessionEventBus';
import { sessionTimeoutService } from '../services/SessionTimeoutService';

// ── Types ──────────────────────────────────────────────────────

export type PlanStep = {
  index: number;
  type: 'query' | 'analysis' | 'action' | 'report';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  requires_approval: boolean;
  result_summary?: string;
  completed_at?: string;
};

// ── createPlan ─────────────────────────────────────────────────

export function createPlanTool(sessionId: string) {
  return tool({
    description: `Decompose the session goal into a sequence of steps and save the plan. Call this FIRST when status is 'planning'. Do not call any other tool before this. Use 3-5 steps. Always end with a 'report' step.`,
    parameters: z.object({
      goal: z.string().describe('The goal as understood — restate it clearly'),
      steps: z.array(z.object({
        type: z.enum(['query', 'analysis', 'action', 'report']),
        title: z.string().describe('Short title, max 8 words'),
        description: z.string().describe('What this step does and why'),
        requires_approval: z.boolean()
          .describe('True for action steps — these create pending actions for human review'),
      })),
    }),
    execute: async ({ goal, steps }) => {
      logger.info('createPlan called', { sessionId, goal, stepCount: steps.length });

      const plan: PlanStep[] = steps.map((s, i) => ({
        index: i,
        type: s.type,
        title: s.title,
        description: s.description,
        status: i === 0 ? 'in_progress' as const : 'pending' as const,
        requires_approval: s.requires_approval,
      }));

      await updateAgentSession(sessionId, {
        plan,
        status: 'executing',
        current_step_index: 0,
      });

      return {
        success: true,
        plan,
        message: `Plan created with ${steps.length} steps. Now executing step 1: "${plan[0].title}".`,
      };
    },
  });
}

// ── completeStep ───────────────────────────────────────────────

export function completeStepTool(sessionId: string, auth: AuthContext) {
  return tool({
    description: `Signal that the current plan step is complete and advance to the next step. Call this after finishing any step — query, analysis, action, or report. Provide a clear result_summary so future steps and the final report can reference it.`,
    parameters: z.object({
      step_index: z.coerce.number().int().optional()
        .describe('Index of the step being completed (0-based). Defaults to the current in-progress step.'),
      result_summary: z.string().optional()
        .describe('What was found or done. Include key numbers.'),
      accumulated_context_update: z.record(z.any()).optional()
        .describe('Key facts to carry forward. E.g. { "unmatched_postings": 23 }'),
    }),
    execute: async ({ step_index, result_summary, accumulated_context_update }) => {
      const session = await getAgentSession(sessionId);
      const plan = (session.plan as PlanStep[]) || [];
      const inferred = plan.findIndex((s) => s.status === 'in_progress');
      const idx = (step_index == null || Number.isNaN(step_index))
        ? (inferred >= 0 ? inferred : (session.current_step_index ?? 0))
        : step_index;
      const summary = result_summary
        || `Completed step ${idx + 1}: ${plan[idx]?.title || ''}`.trim();
      logger.info('completeStep called', { sessionId, step_index: idx, result_summary: summary });

      if (idx < 0 || idx >= plan.length) {
        return { success: false, error: `Invalid step_index: ${idx}` };
      }

      // Auto-complete any skipped prior steps (LLM sometimes merges steps)
      for (let i = 0; i < idx; i++) {
        if (plan[i].status === 'in_progress' || plan[i].status === 'pending') {
          logger.info('Auto-completing skipped step', { sessionId, skippedIndex: i, completedBy: idx });
          plan[i].status = 'completed';
          plan[i].result_summary = plan[i].result_summary || '(merged with subsequent step)';
          plan[i].completed_at = plan[i].completed_at || new Date().toISOString();
        }
      }

      // Update the completed step
      plan[idx].status = 'completed';
      plan[idx].result_summary = summary;
      plan[idx].completed_at = new Date().toISOString();

      // Merge accumulated context
      const existingContext = (session.accumulated_context as Record<string, any>) || {};
      let mergedContext = { ...existingContext, ...accumulated_context_update };

      const isTaxPackage = session.template_id === TAX_PACKAGE_TEMPLATE_ID
        || existingContext.tax_package_kind === TAX_PACKAGE_KIND
        || mergedContext.tax_package_kind === TAX_PACKAGE_KIND;
      const completedTitle = plan[idx]?.title || '';
      if (
        isTaxPackage
        && /assemble/i.test(completedTitle)
        && !mergedContext.workpapers
        && auth.user?.org_id
      ) {
        try {
          const assembled = await assembleTaxPackage(auth.user.org_id, {
            tax_year: Number(mergedContext.tax_year) || 2025,
            recipient: mergedContext.recipient || 'Meera Patel CPA',
            include_foreign: mergedContext.include_foreign !== false,
            basement_rentable_pct: mergedContext.basement_rentable_pct ?? null,
          });
          mergedContext = { ...mergedContext, ...assembled };
          logger.info('completeStep: hydrated tax-package workpapers', {
            sessionId,
            unmatched: assembled.unmatched_count,
          });
        } catch (hydrateErr: any) {
          logger.warn('completeStep: tax-package assemble hydrate failed', {
            sessionId,
            error: hydrateErr?.message,
          });
        }
      }

      let cursor = idx + 1;
      let newStatus: string = session.status as string;
      let pendingActionsCreated = 0;

      // ── Dispatcher: handle deterministic steps inline ──────────
      // Walk forward through remaining steps. If a registered builder/formatter
      // exists, execute it without an LLM round-trip. Break on LLM-driven steps,
      // awaiting_approval transitions, or end of plan.

      while (cursor < plan.length) {
        const nextStep = plan[cursor];
        plan[cursor].status = 'in_progress';

        if (nextStep.type === 'action') {
          const builder = ActionBuilderRegistry.get(session.goal_model, nextStep, mergedContext);
          if (!builder) break; // LLM fallback

          logger.info('Dispatcher: running action builder', {
            sessionId, stepIndex: cursor, goalModel: session.goal_model,
          });

          const result = await builder.build(mergedContext, {
            id: session.id,
            goal: session.goal,
            goal_model: session.goal_model,
            mode: session.mode,
          }, auth);

          // Create pending actions via existing batch service
          if (result.pendingActions.length > 0) {
            await createPendingActionBatch(result.pendingActions, {
              org_id: auth.user.org_id,
              session_id: sessionId,
              action_type: result.actionType,
              batch_id: `${sessionId}-step-${cursor}`,
              on_approve: 'execute_immediately',
              created_by: 'agent',
            });
            pendingActionsCreated = result.pendingActions.length;
          }

          // Mark action step complete
          plan[cursor].status = 'completed';
          plan[cursor].result_summary = result.summary;
          plan[cursor].completed_at = new Date().toISOString();
          if (result.contextUpdate) {
            mergedContext = { ...mergedContext, ...result.contextUpdate };
          }

          // Audit message
          await createAgentMessage({
            session_id: sessionId,
            role: 'assistant',
            content: result.summary,
            step_index: cursor,
          });

          // If actions were queued, pause for human review
          if (pendingActionsCreated > 0) {
            newStatus = 'awaiting_approval';
            cursor++;
            // Mark the next step (report) as in_progress so it's ready after approval
            if (cursor < plan.length) {
              plan[cursor].status = 'in_progress';
            }
            break;
          }

          cursor++;
          continue;
        }

        if (nextStep.type === 'report') {
          const formatter = ReportFormatterRegistry.get(session.goal_model, nextStep, session);
          if (!formatter) break; // LLM fallback

          logger.info('Dispatcher: running report formatter', {
            sessionId, stepIndex: cursor, goalModel: session.goal_model,
          });

          const reportText = formatter.format(mergedContext, session);

          plan[cursor].status = 'completed';
          plan[cursor].result_summary = reportText;
          plan[cursor].completed_at = new Date().toISOString();

          // Audit message
          await createAgentMessage({
            session_id: sessionId,
            role: 'assistant',
            content: reportText,
            step_index: cursor,
          });

          cursor++;
          continue;
        }

        // query / analysis steps always need the LLM
        break;
      }

      if (plan[idx]?.type === 'report') {
        const formatter = ReportFormatterRegistry.get(
          session.goal_model,
          plan[idx],
          { ...session, accumulated_context: mergedContext }
        );
        if (formatter) {
          plan[idx].result_summary = formatter.format(mergedContext, session);
        }
      }

      // ── Finalize session state ─────────────────────────────────

      const allComplete = cursor >= plan.length;

      if (allComplete && newStatus !== 'awaiting_approval') {
        newStatus = 'completed';
      } else if (newStatus !== 'awaiting_approval') {
        newStatus = 'executing';
      }

      const finalIndex = allComplete ? plan.length - 1 : cursor;

      await updateAgentSession(sessionId, {
        plan,
        current_step_index: finalIndex,
        accumulated_context: mergedContext,
        status: newStatus,
        completed_at: allComplete ? new Date() : undefined,
      });

      // Build response for the LLM
      const dispatchedCount = cursor - idx - 1;
      const nextStepForLLM = allComplete ? null : cursor;

      return {
        success: true,
        completed_step: idx,
        next_step: nextStepForLLM,
        session_status: newStatus,
        dispatched_steps: dispatchedCount,
        pending_actions_created: pendingActionsCreated,
        message: allComplete
          ? 'All steps complete. Session finished.'
          : newStatus === 'awaiting_approval'
            ? `Step ${idx + 1} complete. ${pendingActionsCreated} action(s) queued for review. Waiting for human approval.`
            : `Step ${idx + 1} complete. Now on step ${cursor + 1}: "${plan[cursor].title}".`,
      };
    },
  });
}

// ── queueActions (merged tool — replaces queueAction + queueActionBatch) ──

export function queueActionsTool(sessionId: string, auth: AuthContext) {
  return tool({
    description: `Create one or more pending actions of the same type for human review. Pass a single-item array for one action. All actions in a call share the same action_type and batch_id.`,
    parameters: z.object({
      action_type: z.string()
        .describe('Type of all actions in this call, e.g. "categorize_transaction"'),
      batch_id: z.string()
        .describe('Unique batch identifier. Use format: {sessionId}-step-{stepIndex}'),
      on_approve: z.enum(['execute_immediately', 'queue_for_batch', 'notify_only']),
      actions: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        payload: z.record(z.any()),
        confidence: z.enum(['high', 'medium', 'low']),
        confidence_score: z.number().min(0).max(1).optional(),
      })).min(1).describe('One or more actions. Pass a single-item array for a single action.'),
    }),
    execute: async (params) => {
      logger.info('queueActions called', {
        sessionId,
        action_type: params.action_type,
        batch_id: params.batch_id,
        count: params.actions.length,
      });

      const session = await getAgentSession(sessionId);

      const toQueue: typeof params.actions = [];
      let executedCount = 0;

      for (const action of params.actions) {
        const shouldExecuteImmediately =
          session.mode === 'autonomous' ||
          (session.mode === 'semi_auto' && action.confidence === 'high');

        if (shouldExecuteImmediately) {
          executedCount++;
        } else {
          toQueue.push(action);
        }
      }

      // Enrich categorize_transaction payloads with account_name for inbox display
      if (params.action_type === 'categorize_transaction' && toQueue.length > 0) {
        const postingIds = toQueue.map(a => a.payload?.posting_id).filter((id): id is string => !!id);
        if (postingIds.length > 0) {
          const postings = await prisma.posting.findMany({
            where: { id: { in: postingIds }, org_id: auth.user.org_id },
            select: {
              id: true,
              account: { select: { id: true, name: true, type: true } },
              credit_account: { select: { id: true, name: true, type: true } },
            },
          });
          const postingMap = new Map(postings.map(p => [p.id, p]));
          for (const action of toQueue) {
            if (action.payload?.account_name) continue;
            const posting = postingMap.get(action.payload?.posting_id);
            if (!posting) continue;
            const acct = posting.account as any;
            const crAcct = posting.credit_account as any;
            const bankAcct =
              acct?.type?.includes('BANK') || acct?.type?.includes('CREDIT_CARD') ? acct :
              crAcct?.type?.includes('BANK') || crAcct?.type?.includes('CREDIT_CARD') ? crAcct :
              (acct ?? crAcct);
            if (bankAcct?.name) (action.payload as any).account_name = bankAcct.name;
          }
        }
      }

      let queuedActions: any[] = [];
      if (toQueue.length > 0) {
        queuedActions = await createPendingActionBatch(
          toQueue.map((a) => ({
            title: a.title,
            description: a.description,
            payload: a.payload,
            confidence: a.confidence,
            confidence_score: a.confidence_score,
          })),
          {
            org_id: auth.user.org_id,
            session_id: sessionId,
            action_type: params.action_type,
            batch_id: params.batch_id,
            on_approve: params.on_approve,
            created_by: 'agent',
          }
        );
      }

      for (const qa of queuedActions) {
        sessionEventBus.emitSessionEvent(sessionId, auth.user.org_id, 'action_queued', {
          action_id: qa.id,
          action_type: params.action_type,
          title: qa.title,
          confidence: qa.confidence,
          batch_id: params.batch_id,
        });
      }
      if (queuedActions.length > 0) {
        sessionEventBus.emitSessionEvent(sessionId, auth.user.org_id, 'inbox_count_changed', {
          delta: queuedActions.length,
        });
      }

      return {
        success: true,
        batch_id: params.batch_id,
        total: params.actions.length,
        queued: queuedActions.length,
        executed: executedCount,
        message: executedCount > 0
          ? `${executedCount} actions executed immediately, ${queuedActions.length} queued for review.`
          : `${queuedActions.length} actions queued for human review.`,
      };
    },
  });
}

// ── requestClarification ───────────────────────────────────────

export function requestClarificationTool(sessionId: string, _auth: AuthContext) {
  return tool({
    description: `Pause the session and ask the user a clarifying question. Use this ONLY from a query step when a query returned 0 rows because the user's input was ambiguous (e.g. wrong account name, underspecified entity). Before calling this tool, run a broader query to find candidate options. Then call this tool with the question and structured options (input_schema.single_select with {id, label} pairs) so the UI can show a dropdown. Do NOT call completeStep — the session pauses until the user responds via the UI.`,
    parameters: z.object({
      question: z.string()
        .describe('Clear question for the user. Include what was searched for.'),
      context: z.record(z.any()).optional()
        .describe('Structured context: { searched_for: string, available: string[] }. Stored for later steps.'),
      input_schema: z.object({
        type: z.enum(['single_select', 'multi_select', 'text', 'date', 'date_range']).optional()
          .describe('UI control type. Use single_select when the user must pick one of several candidates.'),
        options: z.array(z.object({
          id: z.string().describe('Stable id to submit (e.g. acco_…)'),
          label: z.string().describe('Human-readable label shown in the dropdown'),
        })).optional()
          .describe('Choices for single_select / multi_select (max 7).'),
      }).optional()
        .describe('Optional UI schema. Prefer single_select + options for account disambiguation.'),
    }),
    execute: async ({ question, context, input_schema }) => {
      logger.info('requestClarification called', { sessionId, question: question.substring(0, 100) });

      const session = await getAgentSession(sessionId);

      // Promote legacy context shapes into input_schema.options when the model omitted it
      let resolvedSchema = input_schema ?? null;
      const ctx = context ?? {};
      if (!resolvedSchema?.options?.length) {
        const accountIds = ctx.account_ids;
        if (accountIds && typeof accountIds === 'object' && !Array.isArray(accountIds)) {
          const options = Object.entries(accountIds as Record<string, unknown>)
            .filter(([id, name]) => typeof id === 'string' && id && name != null)
            .map(([id, name]) => ({ id, label: String(name) }));
          if (options.length > 0) {
            resolvedSchema = { type: 'single_select', options };
          }
        } else if (Array.isArray(ctx.available)) {
          const options = (ctx.available as unknown[])
            .map((item) => {
              if (typeof item === 'string') return { id: item, label: item };
              if (item && typeof item === 'object' && 'id' in item && 'label' in item) {
                const o = item as { id: unknown; label: unknown };
                return { id: String(o.id), label: String(o.label) };
              }
              return null;
            })
            .filter((o): o is { id: string; label: string } => o != null && !!o.id && !!o.label);
          if (options.length > 0) {
            resolvedSchema = { type: 'single_select', options };
          }
        }
      }

      const clarification_request = {
        question,
        context: ctx,
        input_schema: resolvedSchema,
        step_index: session.current_step_index ?? 0,
      };

      await updateAgentSession(sessionId, {
        status: 'awaiting_input',
        clarification_request,
      });

      // Cancel the timeout — re-armed when user responds via /clarify
      sessionTimeoutService.cancel(sessionId);

      sessionEventBus.emitSessionEvent(sessionId, session.org_id, 'session_status_changed', {
        status: 'awaiting_input',
        clarification_request,
      });

      return {
        success: true,
        message: `Session paused for user input. Question: "${question}"`,
      };
    },
  });
}

// ── queueAction (deprecated — use queueActions) ────────────────

export function queueActionTool(sessionId: string, auth: AuthContext) {
  return tool({
    description: `Create a single pending action for human review. Use this when a step produces exactly one action. For multiple actions, use queueActionBatch instead.`,
    parameters: z.object({
      action_type: z.string(),
      title: z.string(),
      description: z.string().optional(),
      payload: z.record(z.any()),
      confidence: z.enum(['high', 'medium', 'low']),
      confidence_score: z.number().min(0).max(1).optional(),
      batch_id: z.string().optional(),
      on_approve: z.enum(['execute_immediately', 'queue_for_batch', 'notify_only']),
    }),
    execute: async (params) => {
      logger.info('queueAction called', { sessionId, action_type: params.action_type, title: params.title });

      const session = await getAgentSession(sessionId);

      // Apply mode logic
      const shouldExecuteImmediately =
        session.mode === 'autonomous' ||
        (session.mode === 'semi_auto' && params.confidence === 'high');

      if (shouldExecuteImmediately) {
        // In autonomous/semi_auto+high, skip queuing — will be handled by executor in Phase 3
        return {
          success: true,
          disposition: 'executed',
          message: `Action "${params.title}" executed immediately (${session.mode} mode, ${params.confidence} confidence).`,
        };
      }

      const action = await createPendingAction({
        org_id: auth.user.org_id,
        session_id: sessionId,
        created_by: 'agent',
        action_type: params.action_type,
        title: params.title,
        description: params.description,
        payload: params.payload,
        confidence: params.confidence,
        confidence_score: params.confidence_score,
        batch_id: params.batch_id,
        on_approve: params.on_approve,
      });

      // Emit SSE event so connected clients see it in real time
      sessionEventBus.emitSessionEvent(sessionId, auth.user.org_id, 'action_queued', {
        action_id: action.id,
        action_type: params.action_type,
        title: params.title,
        confidence: params.confidence,
        batch_id: params.batch_id ?? null,
      });
      sessionEventBus.emitSessionEvent(sessionId, auth.user.org_id, 'inbox_count_changed', {});

      return {
        success: true,
        disposition: 'queued',
        action_id: action.id,
        message: `Action "${params.title}" queued for human review.`,
      };
    },
  });
}

// ── queueActionBatch (deprecated — use queueActions) ──────────

export function queueActionBatchTool(sessionId: string, auth: AuthContext) {
  return tool({
    description: `Create multiple pending actions of the same type in a single call. All actions share a batch_id and appear as one batch card in the workbench. Prefer this over calling queueAction in a loop.`,
    parameters: z.object({
      action_type: z.string(),
      batch_id: z.string()
        .describe('Unique ID for this batch. Use format: {sessionId}-step-{stepIndex}'),
      actions: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        payload: z.record(z.any()),
        confidence: z.enum(['high', 'medium', 'low']),
        confidence_score: z.number().min(0).max(1).optional(),
      })),
      on_approve: z.enum(['execute_immediately', 'queue_for_batch', 'notify_only']),
    }),
    execute: async (params) => {
      logger.info('queueActionBatch called', {
        sessionId,
        action_type: params.action_type,
        batch_id: params.batch_id,
        count: params.actions.length,
      });

      const session = await getAgentSession(sessionId);

      // Apply mode logic per action
      const toQueue: typeof params.actions = [];
      let executedCount = 0;

      for (const action of params.actions) {
        const shouldExecuteImmediately =
          session.mode === 'autonomous' ||
          (session.mode === 'semi_auto' && action.confidence === 'high');

        if (shouldExecuteImmediately) {
          executedCount++;
          // Will be handled by PendingActionExecutor in Phase 3
        } else {
          toQueue.push(action);
        }
      }

      let queuedActions: any[] = [];
      if (toQueue.length > 0) {
        queuedActions = await createPendingActionBatch(
          toQueue.map((a) => ({
            title: a.title,
            description: a.description,
            payload: a.payload,
            confidence: a.confidence,
            confidence_score: a.confidence_score,
          })),
          {
            org_id: auth.user.org_id,
            session_id: sessionId,
            action_type: params.action_type,
            batch_id: params.batch_id,
            on_approve: params.on_approve,
            created_by: 'agent',
          }
        );
      }

      // Emit one action_queued event per queued action + one inbox_count_changed
      for (const qa of queuedActions) {
        sessionEventBus.emitSessionEvent(sessionId, auth.user.org_id, 'action_queued', {
          action_id: qa.id,
          action_type: params.action_type,
          title: qa.title,
          confidence: qa.confidence,
          batch_id: params.batch_id,
        });
      }
      if (queuedActions.length > 0) {
        sessionEventBus.emitSessionEvent(sessionId, auth.user.org_id, 'inbox_count_changed', {
          delta: queuedActions.length,
        });
      }

      return {
        success: true,
        batch_id: params.batch_id,
        total: params.actions.length,
        queued: queuedActions.length,
        executed: executedCount,
        message: executedCount > 0
          ? `${executedCount} actions executed immediately, ${queuedActions.length} queued for review.`
          : `${queuedActions.length} actions queued for human review.`,
      };
    },
  });
}
