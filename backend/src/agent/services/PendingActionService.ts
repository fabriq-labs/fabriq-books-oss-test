import prisma from '../../lib/prisma';
import { PendingActionExecutor } from '../executors/PendingActionExecutor';
// Import builders index to trigger registration of all built-in builders/formatters
import '../builders';
import { ReportFormatterRegistry } from '../builders/ReportFormatterRegistry';
import { createAgentMessage } from './SessionService';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import { PlanStep } from '../tools/sessionTools';
import { sessionEventBus } from './SessionEventBus';
import { shouldAutoContinue } from '../prompt/constants';

// ── Types ──────────────────────────────────────────────────────

export type CreatePendingActionParams = {
  org_id: string;
  session_id?: string;
  created_by: string;
  assigned_to?: string;
  assigned_role?: string;
  action_type: string;
  batch_id?: string;
  batch_total?: number;
  title: string;
  description?: string;
  payload: any;
  confidence: 'high' | 'medium' | 'low';
  confidence_score?: number;
  on_approve: string;
  defer_until?: Date;
  expires_at?: Date;
};

export type BatchActionItem = {
  title: string;
  description?: string;
  payload: any;
  confidence: 'high' | 'medium' | 'low';
  confidence_score?: number;
};

export type BatchCommonParams = {
  org_id: string;
  session_id?: string;
  action_type: string;
  batch_id: string;
  on_approve: string;
  created_by: string;
};

export type ResolvePendingActionParams = {
  status: 'approved' | 'approved_with_edits' | 'rejected' | 'deferred';
  resolved_by: string;
  resolution_note?: string;
  edited_payload?: any;
  defer_until?: Date;
};

export type ListPendingActionsFilter = {
  session_id?: string;
  batch_id?: string;
  org_id?: string;
  status?: string;
  action_type?: string;
};

// ── Single Action ──────────────────────────────────────────────

export async function createPendingAction(params: CreatePendingActionParams) {
  const action = await prisma.pending_action.create({
    data: {
      org_id: params.org_id,
      session_id: params.session_id,
      created_by: params.created_by,
      assigned_to: params.assigned_to,
      assigned_role: params.assigned_role,
      action_type: params.action_type,
      batch_id: params.batch_id,
      batch_total: params.batch_total,
      title: params.title,
      description: params.description,
      payload: params.payload,
      confidence: params.confidence,
      confidence_score: params.confidence_score,
      on_approve: params.on_approve,
      defer_until: params.defer_until,
      expires_at: params.expires_at,
    },
  });

  // Increment session pending count
  if (params.session_id) {
    await prisma.agent_session.update({
      where: { id: params.session_id },
      data: { pending_actions_count: { increment: 1 } },
    });
  }

  return action;
}

export async function getPendingAction(actionId: string) {
  return prisma.pending_action.findUniqueOrThrow({
    where: { id: actionId },
  });
}

export async function listPendingActions(filter: ListPendingActionsFilter) {
  const where: any = {};
  if (filter.session_id) where.session_id = filter.session_id;
  if (filter.batch_id) where.batch_id = filter.batch_id;
  if (filter.org_id) where.org_id = filter.org_id;
  if (filter.status) where.status = filter.status;
  if (filter.action_type) where.action_type = filter.action_type;

  return prisma.pending_action.findMany({
    where,
    orderBy: { created_at: 'asc' },
  });
}

// ── Batch Actions ──────────────────────────────────────────────

export async function createPendingActionBatch(
  actions: BatchActionItem[],
  common: BatchCommonParams
) {
  const batchTotal = actions.length;

  const created = await prisma.$transaction(
    actions.map((item) =>
      prisma.pending_action.create({
        data: {
          org_id: common.org_id,
          session_id: common.session_id,
          created_by: common.created_by,
          action_type: common.action_type,
          batch_id: common.batch_id,
          batch_total: batchTotal,
          title: item.title,
          description: item.description,
          payload: item.payload,
          confidence: item.confidence,
          confidence_score: item.confidence_score,
          on_approve: common.on_approve,
        },
      })
    )
  );

  // Increment session pending count
  if (common.session_id) {
    await prisma.agent_session.update({
      where: { id: common.session_id },
      data: { pending_actions_count: { increment: batchTotal } },
    });
  }

  return created;
}

// ── Resolve (approve/reject/defer) ─────────────────────────────

export async function resolvePendingAction(
  actionId: string,
  params: ResolvePendingActionParams,
  auth?: AuthContext
) {
  const now = new Date();

  const updateData: any = {
    status: params.status,
    resolved_by: params.resolved_by,
    resolved_at: now,
    resolution_note: params.resolution_note,
  };

  if (params.status === 'deferred' && params.defer_until) {
    updateData.defer_until = params.defer_until;
  }

  if (params.status === 'approved_with_edits' && params.edited_payload) {
    // Store the edited payload — merge with original
    const existing = await prisma.pending_action.findUniqueOrThrow({
      where: { id: actionId },
    });
    updateData.payload = { ...existing.payload as object, ...params.edited_payload };
  }

  let resolved = await prisma.pending_action.update({
    where: { id: actionId },
    data: updateData,
  });

  // Execute side effect on approve. Run when on_approve is 'execute_immediately'
  // OR when a real executor exists for this action type (the LLM sometimes picks
  // 'queue_for_batch' incorrectly — human approval is the gate, not on_approve).
  const isApproved = ['approved', 'approved_with_edits'].includes(params.status);
  const shouldExecute = resolved.on_approve === 'execute_immediately'
    || PendingActionExecutor.hasExecutor(resolved.action_type);
  if (isApproved && shouldExecute && auth) {
    const executionResult = await PendingActionExecutor.execute(
      { id: resolved.id, payload: resolved.payload, action_type: resolved.action_type },
      auth
    );

    resolved = await prisma.pending_action.update({
      where: { id: actionId },
      data: {
        status: executionResult.success ? 'executed' : 'approved',
        executed_at: executionResult.success ? new Date() : undefined,
        execution_result: executionResult.data ?? undefined,
        execution_error: executionResult.error ?? undefined,
      },
    });
  }

  // Update session counts if linked to a session
  if (resolved.session_id) {
    const isTerminal = ['approved', 'approved_with_edits', 'rejected', 'executed'].includes(resolved.status);
    if (isTerminal) {
      await prisma.agent_session.update({
        where: { id: resolved.session_id },
        data: { completed_actions_count: { increment: 1 } },
      });
    }

    // Check if all pending actions are resolved — trigger continuation or completion
    const allResolved = await checkAllPendingActionsResolved(resolved.session_id);
    if (allResolved) {
      const session = await prisma.agent_session.findUnique({
        where: { id: resolved.session_id },
      });

      if (session && session.status === 'awaiting_approval') {
        const plan = session.plan as PlanStep[] | null;

        // Check for a deterministic report step first (no LLM needed)
        const reportStep = plan?.find((s) => s.type === 'report' && s.status !== 'completed');
        const formatter = reportStep ? ReportFormatterRegistry.get(session.goal_model, reportStep, session) : null;

        if (reportStep && formatter) {
          // Deterministic report — complete synchronously
          const ctx = (session.accumulated_context as Record<string, any>) || {};
          const reportText = formatter.format(ctx, session);
          const updatedPlan = [...(plan || [])];
          updatedPlan[reportStep.index] = {
            ...updatedPlan[reportStep.index],
            status: 'completed',
            result_summary: reportText,
            completed_at: new Date().toISOString(),
          };
          await prisma.agent_session.update({
            where: { id: resolved.session_id! },
            data: { plan: updatedPlan, status: 'completed', completed_at: new Date() },
          });
          await createAgentMessage({
            session_id: resolved.session_id!,
            role: 'assistant',
            content: reportText,
            step_index: reportStep.index,
          });
          sessionEventBus.emitSessionEvent(resolved.session_id!, session.org_id, 'session_status_changed', { status: 'completed' });
          logger.info('Deterministic report completed, session completed', { sessionId: resolved.session_id });

        } else if (shouldAutoContinue({ ...session, status: 'executing' }) && auth) {
          // More steps remain — transition back to executing and continue via LLM
          await prisma.agent_session.update({
            where: { id: resolved.session_id! },
            data: { status: 'executing' },
          });
          sessionEventBus.emitSessionEvent(resolved.session_id!, session.org_id, 'session_status_changed', { status: 'executing' });

          const nextStep = plan?.[session.current_step_index ?? 0];
          const continuationMsg = nextStep
            ? `All pending actions reviewed. Continue with step ${nextStep.index + 1}: "${nextStep.title}". ${nextStep.description}`
            : 'All pending actions reviewed. Continue with the next step.';

          logger.info('All pending actions resolved — resuming agent', {
            sessionId: resolved.session_id,
            nextStep: nextStep?.index,
          });

          setImmediate(async () => {
            try {
              const { AgentService } = await import('../AgentService');
              const agentService = new AgentService();
              await agentService.handleRequest(
                continuationMsg,
                auth,
                [],
                { modelName: session.goal_model || 'posting' },
                resolved.session_id!
              );
            } catch (err: any) {
              logger.error('Post-approval continuation failed', { sessionId: resolved.session_id, error: err.message });
            }
          });

        } else {
          // No more steps — complete the session
          await prisma.agent_session.update({
            where: { id: resolved.session_id! },
            data: { status: 'completed', completed_at: new Date() },
          });
          sessionEventBus.emitSessionEvent(resolved.session_id!, session.org_id, 'session_status_changed', { status: 'completed' });
          logger.info('All pending actions resolved, session completed', { sessionId: resolved.session_id });
        }
      }
    }
  }

  return resolved;
}

// ── Bulk Approve ───────────────────────────────────────────────

export async function bulkApproveByConfidence(
  batchId: string,
  confidence: 'high' | 'medium' | 'low',
  resolvedBy: string,
  auth?: AuthContext
) {
  // Find matching pending actions
  const actions = await prisma.pending_action.findMany({
    where: {
      batch_id: batchId,
      status: 'pending',
      confidence,
    },
  });

  if (actions.length === 0) return [];

  // Resolve each action individually so executors run and completion checks fire
  const resolvedIds: string[] = [];
  for (const action of actions) {
    try {
      await resolvePendingAction(
        action.id,
        { status: 'approved', resolved_by: resolvedBy },
        auth
      );
      resolvedIds.push(action.id);
    } catch (err: any) {
      logger.error('bulkApprove: failed to resolve action', {
        actionId: action.id,
        error: err.message,
      });
    }
  }

  return resolvedIds;
}

// ── Helpers ────────────────────────────────────────────────────

export async function checkAllPendingActionsResolved(sessionId: string): Promise<boolean> {
  const pendingCount = await prisma.pending_action.count({
    where: {
      session_id: sessionId,
      status: 'pending',
    },
  });
  return pendingCount === 0;
}
