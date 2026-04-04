import prisma from '../../lib/prisma';
import { sessionEventBus } from './SessionEventBus';
import { sessionTimeoutService } from './SessionTimeoutService';

// ── Types ──────────────────────────────────────────────────────

export type CreateSessionParams = {
  org_id: string;
  user_id: string;
  goal: string;
  goal_model?: string;
  template_id?: string;
  name?: string;
  mode?: string;
  // Allow overriding defaults for testing
  status?: string;
  plan?: any;
  current_step_index?: number;
  pending_actions_count?: number;
};

export type UpdateSessionParams = {
  status?: string;
  name?: string;
  plan?: any;
  current_step_index?: number;
  accumulated_context?: any;
  pending_actions_count?: number;
  completed_actions_count?: number;
  mode?: string;
  completed_at?: Date;
  expires_at?: Date;
  clarification_request?: any | null;
};

// ── Session CRUD ───────────────────────────────────────────────

export async function createAgentSession(params: CreateSessionParams) {
  return prisma.agent_session.create({
    data: {
      org_id: params.org_id,
      user_id: params.user_id,
      goal: params.goal,
      goal_model: params.goal_model,
      template_id: params.template_id,
      name: params.name,
      mode: params.mode ?? 'supervised',
      status: params.status ?? 'planning',
      plan: params.plan ?? undefined,
      current_step_index: params.current_step_index ?? undefined,
      pending_actions_count: params.pending_actions_count ?? 0,
    },
  });
}

export async function getAgentSession(sessionId: string) {
  return prisma.agent_session.findUniqueOrThrow({
    where: { id: sessionId },
  });
}

export async function listAgentSessions(userId: string, orgId: string) {
  return prisma.agent_session.findMany({
    where: { user_id: userId, org_id: orgId },
    orderBy: { started_at: 'desc' },
  });
}

export async function updateAgentSession(sessionId: string, params: UpdateSessionParams) {
  const updated = await prisma.agent_session.update({
    where: { id: sessionId },
    data: params,
  });
  // Cancel the timeout watchdog when the session is no longer actively running
  if (params.status === 'completed' || params.status === 'failed' || params.status === 'awaiting_approval') {
    sessionTimeoutService.cancel(sessionId);
  }

  // Emit status change event so SSE subscribers see it immediately
  if (params.status !== undefined) {
    sessionEventBus.emitSessionEvent(sessionId, updated.org_id, 'session_status_changed', {
      status: updated.status,
    });
  }
  return updated;
}

// ── Messages ───────────────────────────────────────────────────

export type CreateMessageParams = {
  session_id: string;
  role: string;
  content: string;
  tool_calls?: any;
  tool_results?: any;
  step_index?: number;
};

export async function createAgentMessage(params: CreateMessageParams) {
  return prisma.agent_message.create({
    data: params,
  });
}

export async function listAgentMessages(sessionId: string, limit: number = 50) {
  return prisma.agent_message.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: 'asc' },
    take: limit,
  });
}
