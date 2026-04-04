/**
 * V2 Hybrid Execution — Integration Tests
 *
 * Tests the deterministic dispatcher path against real DB:
 * 1. Create session → set plan + accumulated_context manually (simulating LLM)
 * 2. Call completeStep for analysis step → verify dispatcher creates pending_actions
 * 3. Resolve pending actions → verify report formatter runs and session completes
 *
 * No LLM calls. No mocks. Real Prisma, real DB.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

// Trigger builder registrations
import '../builders';

import prisma from '../../lib/prisma';
import {
  createAgentSession,
  getAgentSession,
  updateAgentSession,
  createAgentMessage,
} from '../services/SessionService';
import {
  resolvePendingAction,
  listPendingActions,
} from '../services/PendingActionService';
import { completeStepTool } from '../tools/sessionTools';
import { PlanStep } from '../tools/sessionTools';
import { AuthContext } from '../../auth/types';

// ── Config ───────────────────────────────────────────────────────

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_sanjay_gupta',
  orgId: process.env.TEST_ORG_ID || 'org_indian_demo',
};

const testAuth: AuthContext = {
  user: {
    id: TEST_CONFIG.userId,
    email: 'test@test.com',
    name: 'Test User',
    org_id: TEST_CONFIG.orgId,
  },
} as any;

// Track sessions for cleanup
const createdSessionIds: string[] = [];

// ── Sample data (simulates suggestReconciliationMatches output) ──

const sampleMatchResults = [
  {
    posting_id: 'post_test_001',
    posting_description: 'NEFT CR ACME CORP REF INV-001',
    posting_amount: 45000,
    posting_date: '2026-03-01',
    suggestions: [
      {
        type: 'payment_receipt',
        id: 'rec_test_001',
        reference: 'REC-DEMO-001',
        amount: 45000,
        date: '2026-03-01',
        customer: 'Acme Corp',
        confidence: 'high',
      },
      {
        type: 'invoice',
        id: 'inv_test_001',
        reference: 'INV-001',
        amount: 45000,
        date: '2026-02-28',
        customer: 'Acme Corp',
        confidence: 'medium',
      },
    ],
  },
  {
    posting_id: 'post_test_002',
    posting_description: 'NEFT CR GLOBEX CORP',
    posting_amount: 120000,
    posting_date: '2026-03-05',
    suggestions: [
      {
        type: 'invoice',
        id: 'inv_test_002',
        reference: 'INV-002',
        amount: 120000,
        date: '2026-03-03',
        customer: 'Globex Corp',
        confidence: 'medium',
      },
    ],
  },
  {
    posting_id: 'post_test_003',
    posting_description: 'UNKNOWN TXN',
    posting_amount: 500,
    posting_date: '2026-03-10',
    suggestions: [], // No match
  },
];

const reconciliationPlan: PlanStep[] = [
  {
    index: 0,
    type: 'query',
    title: 'Find unmatched postings',
    description: 'Query unmatched postings for the bank account',
    status: 'completed',
    requires_approval: false,
    result_summary: 'Found 3 unmatched postings',
    completed_at: new Date().toISOString(),
  },
  {
    index: 1,
    type: 'analysis',
    title: 'Suggest reconciliation matches',
    description: 'Run suggestReconciliationMatches for each posting',
    status: 'in_progress',
    requires_approval: false,
  },
  {
    index: 2,
    type: 'action',
    title: 'Queue matches for review',
    description: 'Queue suggested matches as pending actions for human review',
    status: 'pending',
    requires_approval: true,
  },
  {
    index: 3,
    type: 'report',
    title: 'Summarize results',
    description: 'Generate reconciliation summary',
    status: 'pending',
    requires_approval: false,
  },
];

// ── Helpers ───────────────────────────────────────────────────────

async function createTestSession(plan: PlanStep[], accumulatedContext: Record<string, any> = {}) {
  const session = await createAgentSession({
    org_id: TEST_CONFIG.orgId,
    user_id: TEST_CONFIG.userId,
    goal: 'Reconcile unmatched postings for HDFC account',
    goal_model: 'posting',
    mode: 'supervised',
  });
  createdSessionIds.push(session.id);

  // Simulate LLM having already created plan and completed query step
  await updateAgentSession(session.id, {
    plan,
    status: 'executing',
    current_step_index: 1, // analysis step is current
    accumulated_context: accumulatedContext,
  });

  return session.id;
}

// ── Cleanup ──────────────────────────────────────────────────────

afterAll(async () => {
  for (const sessionId of createdSessionIds) {
    try {
      // Delete pending actions first (FK constraint)
      await prisma.pending_action.deleteMany({ where: { session_id: sessionId } });
      await prisma.agent_message.deleteMany({ where: { session_id: sessionId } });
      await prisma.agent_session.delete({ where: { id: sessionId } });
    } catch (e) {
      // Ignore if already deleted
    }
  }
  await prisma.$disconnect();
});

// ── Tests ────────────────────────────────────────────────────────

describe('V2 Dispatcher Integration — Reconciliation Flow', () => {

  test('Scenario 1: completeStep on analysis step triggers action builder → creates pending actions → awaiting_approval', async () => {
    const sessionId = await createTestSession(
      reconciliationPlan,
      { unmatched_count: 3, account_id: 'acc_hdfc_001' }
    );

    // Get the completeStep tool (v2: requires auth)
    const tool = completeStepTool(sessionId, testAuth);

    // Simulate: LLM completes analysis step with match_results in accumulated_context
    const result = await (tool as any).execute({
      step_index: 1,
      result_summary: 'Found matches for 2 of 3 postings (1 high, 1 medium confidence)',
      accumulated_context_update: {
        match_results: sampleMatchResults,
      },
    });

    console.log('\n=== Scenario 1: completeStep result ===');
    console.log(JSON.stringify(result, null, 2));

    // Verify: dispatcher ran
    expect(result.success).toBe(true);
    expect(result.dispatched_steps).toBeGreaterThanOrEqual(1);
    expect(result.session_status).toBe('awaiting_approval');
    expect(result.pending_actions_created).toBe(2); // 2 postings with matches

    // Verify: session state
    const session = await getAgentSession(sessionId);
    expect(session.status).toBe('awaiting_approval');
    // Action step (index 2) should be completed by dispatcher
    const plan = session.plan as PlanStep[];
    expect(plan[1].status).toBe('completed'); // analysis
    expect(plan[2].status).toBe('completed'); // action (dispatcher)
    expect(plan[3].status).toBe('in_progress'); // report (ready for after approval)

    // Verify: pending actions created in DB
    const actions = await listPendingActions({ session_id: sessionId });
    expect(actions.length).toBe(2);

    const highAction = actions.find((a) => a.confidence === 'high');
    const medAction = actions.find((a) => a.confidence === 'medium');
    expect(highAction).toBeDefined();
    expect(medAction).toBeDefined();

    // Verify: action payloads
    const highPayload = highAction!.payload as any;
    expect(highPayload.posting_id).toBe('post_test_001');
    expect(highPayload.match_type).toBe('payment_receipt');
    expect(highPayload.match_id).toBe('rec_test_001');
    expect(highPayload.match_reference).toBe('REC-DEMO-001');
    expect(highPayload.other_candidates).toHaveLength(1);

    // Verify: audit messages created
    const messages = await prisma.agent_message.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'asc' },
    });
    // Should have at least 1 audit message for the action step
    const actionMsg = messages.find((m) => m.step_index === 2);
    expect(actionMsg).toBeDefined();
    expect(actionMsg!.content).toContain('reconciliation match');

    // Verify: accumulated_context has confidence breakdown
    const ctx = session.accumulated_context as any;
    expect(ctx.queued_matches).toBe(2);
    expect(ctx.confidence_breakdown).toEqual({ high: 1, medium: 1, low: 0 });

    console.log('✅ Scenario 1 PASSED: Dispatcher created 2 pending actions, session is awaiting_approval');
  });

  test('Scenario 2: Approving all pending actions triggers deterministic report → session completed', async () => {
    // Setup: create session that's already in awaiting_approval with pending actions
    const sessionId = await createTestSession(
      reconciliationPlan,
      { unmatched_count: 3, account_id: 'acc_hdfc_001' }
    );

    // Run completeStep to trigger dispatcher (same as scenario 1)
    const tool = completeStepTool(sessionId, testAuth);
    await (tool as any).execute({
      step_index: 1,
      result_summary: 'Found matches for 2 of 3 postings',
      accumulated_context_update: { match_results: sampleMatchResults },
    });

    // Get pending actions
    const actions = await listPendingActions({ session_id: sessionId });
    expect(actions.length).toBe(2);

    console.log('\n=== Scenario 2: Resolving pending actions ===');

    // Approve first action (note: we don't have real posting IDs so executor will fail,
    // but we test that the approval flow + report continuation works)
    for (const action of actions) {
      // Use 'rejected' to avoid executor trying to hit real postings
      // This still increments completed_actions_count and triggers report check
      // IMPORTANT: pass auth so the report continuation path has access
      await resolvePendingAction(action.id, {
        status: 'rejected',
        resolved_by: TEST_CONFIG.userId,
        resolution_note: 'Test rejection for integration test',
      }, testAuth);
      console.log(`  Resolved action ${action.id} (${action.confidence}) → rejected`);
    }

    // Give the report continuation a moment (it may use setImmediate for LLM path,
    // but deterministic path should be synchronous)
    await new Promise((r) => setTimeout(r, 500));

    // Verify: session should be completed (deterministic report ran)
    const session = await getAgentSession(sessionId);
    console.log(`  Session status: ${session.status}`);
    console.log(`  Session goal_model: ${session.goal_model}`);
    console.log(`  Session pending/completed: ${session.pending_actions_count}/${session.completed_actions_count}`);

    const plan = session.plan as PlanStep[];
    console.log(`  Plan steps: ${plan.map((s) => `${s.type}:${s.status}`).join(', ')}`);
    console.log(`  Report step result_summary: ${plan[3]?.result_summary || 'NONE'}`);

    expect(session.status).toBe('completed');
    expect(plan[3].status).toBe('completed'); // report step
    expect(plan[3].result_summary).toContain('Reconciliation complete');

    // Verify: report audit message
    const messages = await prisma.agent_message.findMany({
      where: { session_id: sessionId, step_index: 3 },
    });
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].content).toContain('Reconciliation complete');

    console.log('✅ Scenario 2 PASSED: All actions resolved → deterministic report → session completed');
  });

  test('Scenario 3: Analytical session (no action step) — dispatcher is a no-op', async () => {
    const analyticalPlan: PlanStep[] = [
      {
        index: 0,
        type: 'query',
        title: 'Pull expense data',
        description: 'Query quarterly expenses by category',
        status: 'completed',
        requires_approval: false,
        result_summary: 'Found expense data for 3 quarters',
        completed_at: new Date().toISOString(),
      },
      {
        index: 1,
        type: 'analysis',
        title: 'Identify expense drivers',
        description: 'Analyze trends and anomalies',
        status: 'in_progress',
        requires_approval: false,
      },
      {
        index: 2,
        type: 'report',
        title: 'Synthesize findings',
        description: 'Write narrative analysis',
        status: 'pending',
        requires_approval: false,
      },
    ];

    const session = await createAgentSession({
      org_id: TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal: 'What is driving the increase in operating expenses?',
      goal_model: undefined, // No specific model — analytical
    });
    createdSessionIds.push(session.id);

    await updateAgentSession(session.id, {
      plan: analyticalPlan,
      status: 'executing',
      current_step_index: 1,
      accumulated_context: { expense_data: 'some data' },
    });

    // CompleteStep on analysis step — should NOT trigger any dispatcher
    const tool = completeStepTool(session.id, testAuth);
    const result = await (tool as any).execute({
      step_index: 1,
      result_summary: 'Top 3 drivers: IT +40%, Marketing +25%, Travel +15%',
      accumulated_context_update: { top_drivers: ['IT', 'Marketing', 'Travel'] },
    });

    console.log('\n=== Scenario 3: Analytical session completeStep result ===');
    console.log(JSON.stringify(result, null, 2));

    // Verify: dispatcher did NOT run (no builder for null goal_model)
    expect(result.success).toBe(true);
    expect(result.dispatched_steps).toBe(0);
    expect(result.session_status).not.toBe('awaiting_approval');
    expect(result.pending_actions_created).toBe(0);

    // Verify: next step is report, still needs LLM
    expect(result.next_step).toBe(2);

    // Verify: no pending actions
    const actions = await listPendingActions({ session_id: session.id });
    expect(actions.length).toBe(0);

    // Verify: session still executing, waiting for LLM to do report
    const updated = await getAgentSession(session.id);
    expect(updated.status).toBe('executing');
    const plan = updated.plan as PlanStep[];
    expect(plan[2].status).toBe('in_progress'); // report waiting for LLM

    console.log('✅ Scenario 3 PASSED: Dispatcher is no-op for analytical sessions');
  });

  test('Scenario 4: Empty match_results — action builder creates 0 actions, report runs immediately', async () => {
    const emptyMatchPlan: PlanStep[] = [
      {
        index: 0,
        type: 'query',
        title: 'Find unmatched postings',
        description: 'Query postings',
        status: 'completed',
        requires_approval: false,
        result_summary: 'Found 3 postings',
        completed_at: new Date().toISOString(),
      },
      {
        index: 1,
        type: 'analysis',
        title: 'Suggest matches',
        description: 'Run matching',
        status: 'in_progress',
        requires_approval: false,
      },
      {
        index: 2,
        type: 'action',
        title: 'Queue matches',
        description: 'Queue for review',
        status: 'pending',
        requires_approval: true,
      },
      {
        index: 3,
        type: 'report',
        title: 'Summarize',
        description: 'Generate summary',
        status: 'pending',
        requires_approval: false,
      },
    ];

    const session = await createAgentSession({
      org_id: TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal: 'Reconcile postings',
      goal_model: 'posting',
    });
    createdSessionIds.push(session.id);

    await updateAgentSession(session.id, {
      plan: emptyMatchPlan,
      status: 'executing',
      current_step_index: 1,
      accumulated_context: { unmatched_count: 3 },
    });

    // CompleteStep with empty match_results — no suggestions found
    const tool = completeStepTool(session.id, testAuth);
    const result = await (tool as any).execute({
      step_index: 1,
      result_summary: 'No matches found for any posting',
      accumulated_context_update: {
        match_results: [
          { posting_id: 'p1', posting_description: 'X', posting_amount: 100, posting_date: '2026-01-01', suggestions: [] },
          { posting_id: 'p2', posting_description: 'Y', posting_amount: 200, posting_date: '2026-01-02', suggestions: [] },
        ],
      },
    });

    console.log('\n=== Scenario 4: Empty matches completeStep result ===');
    console.log(JSON.stringify(result, null, 2));

    // Verify: dispatcher ran action builder (0 actions) + report formatter
    expect(result.success).toBe(true);
    expect(result.pending_actions_created).toBe(0);
    expect(result.session_status).toBe('completed'); // Both action+report handled inline

    // Verify: session completed
    const updated = await getAgentSession(session.id);
    expect(updated.status).toBe('completed');

    const plan = updated.plan as PlanStep[];
    expect(plan[2].status).toBe('completed'); // action (0 actions, no pause)
    expect(plan[3].status).toBe('completed'); // report (formatter ran inline)
    expect(plan[3].result_summary).toContain('Reconciliation complete');
    expect(plan[3].result_summary).toContain('0 match suggestion');

    console.log('✅ Scenario 4 PASSED: 0 matches → action+report complete inline → session done');
  });
});
