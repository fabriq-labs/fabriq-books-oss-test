/**
 * Session Agent — Phase 2 Tests
 *
 * Tests session-aware agent flow: createPlan on first turn, completeStep,
 * queueAction mode logic, shouldAutoContinue, and backward compatibility.
 *
 * Run with:
 *   npx jest src/agent/__tests__/session-agent.test.ts --runInBand
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

import { AgentService } from '../AgentService';
import { PermissionService } from '../../services/permissions/PermissionService';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import {
  createAgentSession,
  getAgentSession,
  listAgentMessages,
} from '../services/SessionService';
import {
  listPendingActions,
} from '../services/PendingActionService';
import { shouldAutoContinue } from '../prompt/constants';

// Import session tool executors for direct testing
import { PlanStep } from '../tools/sessionTools';

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_rajesh_kumar',
  orgId: process.env.TEST_ORG_ID || 'org_rajesh',
};

async function buildAuth(): Promise<AuthContext> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: TEST_CONFIG.userId } });
  const permissions = await PermissionService.getUserPermissions(TEST_CONFIG.userId);
  return {
    user: {
      id: user.id,
      email: user.email || '',
      name: user.name,
      org_id: user.org_id || TEST_CONFIG.orgId,
    },
    permissions,
  };
}

describe('Session Agent — Phase 2', () => {

  let agentService: AgentService;
  let auth: AuthContext;
  let sessionId: string;

  beforeAll(async () => {
    agentService = new AgentService();
    auth = await buildAuth();
  }, 30000);

  // --- Backward compatibility ---

  test('non-session chat still works (backward compatibility)', async () => {
    const result = await agentService.handleRequest(
      'What is 2 + 2?',
      auth,
      [],
      { modelName: 'default' }
      // no sessionId
    );
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    // Confirm no session tools were called
    const toolNames = result.steps
      .flatMap((s: any) => s.toolCalls ?? [])
      .map((t: any) => t.toolName);
    expect(toolNames).not.toContain('createPlan');
    expect(toolNames).not.toContain('completeStep');
    expect(toolNames).not.toContain('queueAction');
    expect(toolNames).not.toContain('queueActionBatch');
  }, 60000);

  // --- Session creation and planning ---

  test('agent calls createPlan on first session turn', async () => {
    // Create session
    const session = await createAgentSession({
      org_id: TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal: 'Reconcile unmatched transactions for HDFC current account',
      mode: 'supervised',
    });
    sessionId = session.id;

    const result = await agentService.handleRequest(
      'Reconcile unmatched transactions for HDFC current account',
      auth,
      [],
      { modelName: 'posting' },
      sessionId
    );

    // Verify createPlan was called
    const toolNames = result.steps
      .flatMap((s: any) => s.toolCalls ?? [])
      .map((t: any) => t.toolName);
    expect(toolNames).toContain('createPlan');

    // Verify plan was persisted
    const updated = await getAgentSession(sessionId);
    expect(updated.plan).not.toBeNull();
    expect(Array.isArray(updated.plan)).toBe(true);
    expect((updated.plan as any[]).length).toBeGreaterThanOrEqual(2);
  }, 120000);

  test('plan has correct structure — types and required fields', async () => {
    const session = await getAgentSession(sessionId);
    const plan = session.plan as PlanStep[];
    plan.forEach((step, i) => {
      expect(step.index).toBe(i);
      expect(['query', 'analysis', 'action', 'report']).toContain(step.type);
      expect(typeof step.title).toBe('string');
      expect(typeof step.requires_approval).toBe('boolean');
    });
    // Last step should be a report step
    expect(plan[plan.length - 1].type).toBe('report');
  });

  test('session status advanced from planning to executing (or completed if auto-continuation ran)', async () => {
    // Auto-continuation may have already completed all steps by the time we check
    // (especially if query step found 0 results and agent breezed through)
    const session = await getAgentSession(sessionId);
    expect(['executing', 'completed', 'awaiting_approval']).toContain(session.status);
    expect(session.current_step_index).toBeDefined();
  });

  test('messages were persisted to agent_message table', async () => {
    const messages = await listAgentMessages(sessionId);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => m.role === 'user')).toBe(true);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
  });

  // --- shouldAutoContinue ---

  test('shouldAutoContinue returns true for all step types while executing (including action with requires_approval)', () => {
    const querySession = { status: 'executing', plan: [{ type: 'query', requires_approval: false }], current_step_index: 0 } as any;
    expect(shouldAutoContinue(querySession)).toBe(true);

    const analysisSession = { status: 'executing', plan: [{ type: 'analysis', requires_approval: false }], current_step_index: 0 } as any;
    expect(shouldAutoContinue(analysisSession)).toBe(true);

    // Action steps must auto-continue so the agent can call queueActionBatch.
    // The pause happens when completeStep transitions to 'awaiting_approval'.
    const actionSession = { status: 'executing', plan: [{ type: 'action', requires_approval: true }], current_step_index: 0 } as any;
    expect(shouldAutoContinue(actionSession)).toBe(true);

    const reportSession = { status: 'executing', plan: [{ type: 'report', requires_approval: false }], current_step_index: 0 } as any;
    expect(shouldAutoContinue(reportSession)).toBe(true);
  });

  test('shouldAutoContinue returns false when not executing (awaiting_approval pauses naturally)', () => {
    const waitingSession = { status: 'awaiting_approval', plan: [{ type: 'query', requires_approval: false }], current_step_index: 0 } as any;
    expect(shouldAutoContinue(waitingSession)).toBe(false);
  });

  test('shouldAutoContinue returns false when no current step', () => {
    const noStepSession = { status: 'executing', plan: [], current_step_index: 0 } as any;
    expect(shouldAutoContinue(noStepSession)).toBe(false);

    const nullPlanSession = { status: 'executing', plan: null, current_step_index: 0 } as any;
    expect(shouldAutoContinue(nullPlanSession)).toBe(false);
  });

  afterAll(async () => {
    if (sessionId) {
      await prisma.pending_action.deleteMany({ where: { session_id: sessionId } });
      await prisma.agent_message.deleteMany({ where: { session_id: sessionId } });
      await prisma.agent_session.delete({ where: { id: sessionId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });
});
