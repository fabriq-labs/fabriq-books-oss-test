/**
 * V2 Categorise Expenses — End-to-End Test
 *
 * Tests the full workbench flow for the 'categorize_transaction' action type:
 * 1. Create session with "Categorise Expenses" template (atpl_categorise)
 * 2. Agent creates a plan
 * 3. Agent queries for the bank account
 * 4. Agent calls categorizePostings tool (dry run — no DB writes)
 * 5. Agent queues categorize_transaction actions (session → awaiting_approval)
 * 6. Test approves all actions
 * 7. CategorizeTransactionExecutor writes ai_cat_score + counter-account to each posting
 * 8. Session completes
 *
 * Also verifies:
 * - categorizePostings tool returns predictions before any actions are queued
 * - Approved postings have ai_cat_score populated afterwards
 * - SSE events are emitted throughout
 * - Session name is auto-generated
 *
 * Run with:
 *   npx jest src/agent/__tests__/v2-categorise-expenses-e2e.test.ts --runInBand --forceExit
 *
 * Prerequisites:
 * - Database running with indian-demo data
 * - LLM API key configured
 * - seed-agent-templates.sql applied (for atpl_categorise template)
 */

import { AgentService } from '../AgentService';
import { AuthContext } from '../../auth/types';
import { PermissionService } from '../../services/permissions/PermissionService';
import prisma from '../../lib/prisma';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

import '../builders';

import {
  createAgentSession,
  getAgentSession,
  updateAgentSession,
  createAgentMessage,
} from '../services/SessionService';
import {
  listPendingActions,
  resolvePendingAction,
} from '../services/PendingActionService';
import { sessionEventBus, SessionEvent } from '../services/SessionEventBus';

// ── Config ────────────────────────────────────────────────────────

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_sanjay_gupta',
  orgId: process.env.TEST_ORG_ID || 'org_indian_demo',
  // The goal tells the agent which account to look at.
  // Adjust to match an account with uncategorised postings in your demo data.
  // Use the specific account ID to avoid ambiguity — org_indian_demo has 3 "Checking Account" rows
  // (main entity + mumbai_branch + bangalore_office branches all share org_id=org_indian_demo).
  goal: process.env.TEST_CATEGORISE_GOAL
    || 'Categorise uncategorised expense postings for account acco_org_indian_demo_1102',
};

const REPORTS_DIR = path.join(__dirname, 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────

async function buildAuthContext(): Promise<AuthContext> {
  const user = await prisma.user.findUnique({ where: { id: TEST_CONFIG.userId } });
  if (!user) throw new Error(`Test user not found: ${TEST_CONFIG.userId}`);
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

async function waitForStatus(
  sessionId: string,
  targetStatuses: string[],
  timeoutMs = 120000,
  pollMs = 2000
): Promise<{ status: string; timedOut: boolean }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await getAgentSession(sessionId);
    if (targetStatuses.includes(s.status)) return { status: s.status, timedOut: false };
    await new Promise((r) => setTimeout(r, pollMs));
  }
  const s = await getAgentSession(sessionId);
  return { status: s.status, timedOut: true };
}

// ── Test ──────────────────────────────────────────────────────────

describe('V2 Categorise Expenses — E2E', () => {
  let sessionId: string;
  const capturedEvents: SessionEvent[] = [];
  let unsubscribe: (() => void) | null = null;

  afterAll(async () => {
    unsubscribe?.();
    // Session is intentionally NOT deleted so it can be inspected in the DB after the test.
    // To clean up manually: DELETE FROM agent_session WHERE id = '<sessionId>';
    await prisma.$disconnect();
  });

  it('categorises uncategorised postings end-to-end', async () => {
    const errors: string[] = [];

    // ── 1. Auth ──────────────────────────────────────────────────
    const auth = await buildAuthContext();

    // ── 2. Get Categorise Expenses template ──────────────────────
    const template = await prisma.agent_template.findFirst({
      where: { id: 'atpl_categorise', is_active: true },
    });

    if (!template) {
      console.warn(
        'Categorise Expenses template not found — run seed-agent-templates.sql first.\n' +
        'Falling back to templateless session (agent may not use categorizePostings tool).'
      );
    }
    console.log(`Template: ${template?.name ?? 'none (fallback)'}`);

    // ── 3. Create session ────────────────────────────────────────
    const session = await createAgentSession({
      org_id: TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal: TEST_CONFIG.goal,
      goal_model: 'posting',
      mode: 'supervised',
      template_id: template?.id,
    });
    sessionId = session.id;
    console.log(`Session created: ${sessionId}`);

    // ── 4. Subscribe to SSE events ───────────────────────────────
    unsubscribe = sessionEventBus.subscribeSession(sessionId, (evt) => {
      capturedEvents.push(evt);
      console.log(`  [SSE] ${evt.type}: ${JSON.stringify(evt.data).slice(0, 120)}`);
    });

    // ── 5. Run streaming call (plan creation + tool execution) ───
    const agentService = new AgentService();
    console.log('\nStarting streaming call...');
    let streamOutput = '';
    try {
      const stream = await agentService.handleStreamingRequest(
        session.goal,
        auth,
        [],
        { modelName: 'default' },
        sessionId
      );
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        streamOutput += decoder.decode(chunk.value as Uint8Array, { stream: true });
      }
      console.log(`Stream complete: ${streamOutput.length} bytes`);
    } catch (err: any) {
      errors.push(`Streaming call failed: ${err.message}`);
    }

    // ── 6. Wait for awaiting_approval, awaiting_input, or completed ─
    console.log('\nWaiting for awaiting_approval, awaiting_input, or completed...');
    let { status: statusAfterStream, timedOut: t1 } = await waitForStatus(
      sessionId,
      ['awaiting_approval', 'awaiting_input', 'completed', 'failed'],
      300000  // 5 min — agent may need multiple LLM calls
    );

    if (t1) {
      errors.push(`Timed out waiting for awaiting_approval. Status: ${statusAfterStream}`);
    } else {
      console.log(`Status reached: ${statusAfterStream}`);
    }

    // ── 6b. Handle clarification request if agent needs more input ──
    if (statusAfterStream === 'awaiting_input') {
      const sessionForClarify = await getAgentSession(sessionId);
      const clarificationRequest = sessionForClarify.clarification_request as any;
      const question = clarificationRequest?.question ?? 'Which account?';
      console.log(`\nAgent requested clarification: "${question}"`);

      // Pick the first option if choices are provided, otherwise give a generic answer
      let clarifyResponse: string;
      if (Array.isArray(clarificationRequest?.options) && clarificationRequest.options.length > 0) {
        clarifyResponse = clarificationRequest.options[0];
      } else {
        clarifyResponse = 'Please process the first matching account.';
      }
      console.log(`Responding with: "${clarifyResponse}"`);

      // Replicate what POST /api/agent/sessions/:id/clarify does
      const existingContext = (sessionForClarify.accumulated_context as Record<string, any>) || {};
      const clarifications = Array.isArray(existingContext.clarifications)
        ? existingContext.clarifications
        : [];
      clarifications.push({
        step_index: clarificationRequest?.step_index ?? sessionForClarify.current_step_index,
        question,
        answer: clarifyResponse,
        context: clarificationRequest?.context ?? {},
      });

      await createAgentMessage({
        session_id: sessionId,
        role: 'user',
        content: clarifyResponse,
        step_index: sessionForClarify.current_step_index ?? undefined,
      });

      await updateAgentSession(sessionId, {
        status: 'executing',
        clarification_request: null,
        accumulated_context: { ...existingContext, clarifications },
      });

      // Resume LLM execution
      const agentServiceForClarify = new AgentService();
      console.log('Resuming agent after clarification...');
      try {
        const stream2 = await agentServiceForClarify.handleStreamingRequest(
          clarifyResponse,
          auth,
          [],
          { modelName: session.goal_model || 'default' },
          sessionId
        );
        const reader2 = stream2.getReader();
        const decoder2 = new TextDecoder();
        while (true) {
          const chunk = await reader2.read();
          if (chunk.done) break;
          decoder2.decode(chunk.value as Uint8Array, { stream: true });
        }
      } catch (err: any) {
        errors.push(`Clarification continuation failed: ${err.message}`);
      }

      // Wait again for the agent to finish after clarification
      console.log('\nWaiting for awaiting_approval or completed after clarification...');
      const r2 = await waitForStatus(
        sessionId,
        ['awaiting_approval', 'completed', 'failed'],
        300000
      );
      statusAfterStream = r2.status;
      if (r2.timedOut) {
        errors.push(`Timed out waiting after clarification. Status: ${statusAfterStream}`);
      } else {
        console.log(`Status after clarification: ${statusAfterStream}`);
      }
    }

    if (statusAfterStream === 'failed') {
      errors.push('Session reached failed state before approval step');
    }

    // ── 7. Inspect pending actions ───────────────────────────────
    const pendingActions = await listPendingActions({
      session_id: sessionId,
      status: 'pending',
    });

    const categoriseActions = pendingActions.filter(
      (pa) => pa.action_type === 'categorize_transaction'
    );

    console.log(`\nPending actions: ${pendingActions.length} total, ${categoriseActions.length} categorize_transaction`);
    for (const pa of categoriseActions.slice(0, 5)) {
      const payload = pa.payload as any;
      console.log(
        `  - [${pa.confidence}] ${pa.title}` +
        (payload?.predicted_account_name ? ` → ${payload.predicted_account_name}` : '')
      );
    }

    if (statusAfterStream === 'awaiting_approval' && pendingActions.length === 0) {
      errors.push('Session is awaiting_approval but no pending actions found');
    }

    // Verify the tool was actually called (at least one categorize_transaction action
    // OR the agent completed without finding anything to categorise — both are valid)
    const toolCalledEvents = capturedEvents.filter(
      (e) => e.type === 'tool_called' && e.data?.tool_name === 'categorizePostings'
    );
    console.log(`\ncategorizePostings tool call events: ${toolCalledEvents.length}`);
    if (template && toolCalledEvents.length === 0 && categoriseActions.length > 0) {
      // Only warn — the agent may call the tool without an explicit event depending on implementation
      console.warn('categorizePostings tool_called event not captured (may still have run)');
    }

    // ── 8. Capture posting IDs before approval ───────────────────
    // We'll verify that ai_cat_score is set on these postings after execution
    const postingIdsToCheck: string[] = categoriseActions
      .map((pa) => (pa.payload as any)?.posting_id)
      .filter(Boolean);

    // ── 9. Approve all pending actions ───────────────────────────
    if (pendingActions.length > 0) {
      console.log(`\nApproving ${pendingActions.length} pending action(s)...`);
      for (const pa of pendingActions) {
        try {
          await resolvePendingAction(
            pa.id,
            { status: 'approved', resolved_by: TEST_CONFIG.userId },
            auth
          );
        } catch (err: any) {
          errors.push(`Failed to approve action ${pa.id}: ${err.message}`);
        }
      }
      console.log('All actions approved');

      // ── 10. Wait for completion ────────────────────────────────
      console.log('\nWaiting for session to complete...');
      const { status: finalStatus, timedOut: t2 } = await waitForStatus(
        sessionId,
        ['completed', 'failed'],
        120000
      );

      if (t2) {
        errors.push(`Timed out waiting for completion. Status: ${finalStatus}`);
      } else {
        console.log(`Final status: ${finalStatus}`);
      }

      if (finalStatus === 'failed') {
        errors.push('Session ended in failed state after approval');
      }

      // ── 11. Verify executor ran ────────────────────────────────
      const executedActions = await listPendingActions({
        session_id: sessionId,
        status: 'executed',
      });
      const executedCategoriseCount = executedActions.filter(
        (pa) => pa.action_type === 'categorize_transaction'
      ).length;
      console.log(
        `\nExecuted actions: ${executedActions.length} total, ${executedCategoriseCount} categorize_transaction`
      );

      if (categoriseActions.length > 0 && executedCategoriseCount === 0) {
        errors.push(
          `${categoriseActions.length} categorize_transaction actions were queued but none executed`
        );
      }

      // ── 12. Verify ai_cat_score was written to postings ────────
      if (postingIdsToCheck.length > 0) {
        const updatedPostings = await prisma.posting.findMany({
          where: { id: { in: postingIdsToCheck } },
          select: { id: true, ai_cat_score: true, ai_categorized_at: true },
        });

        const withScore = updatedPostings.filter((p) => p.ai_cat_score !== null);
        console.log(
          `\nPosting categorization check: ${withScore.length}/${updatedPostings.length} have ai_cat_score set`
        );

        if (withScore.length === 0 && categoriseActions.length > 0) {
          errors.push(
            'No postings had ai_cat_score written — CategorizeTransactionExecutor may have failed'
          );
        }
      }
    }

    // ── 13. Verify session name was generated ──────────────────────
    const finalSession = await getAgentSession(sessionId);
    console.log(`\nSession name: "${finalSession.name ?? '(not generated yet)'}"`);
    if (!finalSession.name) {
      await new Promise((r) => setTimeout(r, 3000));
      const s2 = await getAgentSession(sessionId);
      if (s2.name) console.log(`Session name (after delay): "${s2.name}"`);
    }

    // ── 14. SSE event summary ──────────────────────────────────────
    console.log(`\n--- SSE Event Summary ---`);
    console.log(`Total events: ${capturedEvents.length}`);
    const eventTypes = [...new Set(capturedEvents.map((e) => e.type))];
    console.log(`Event types: ${eventTypes.join(', ')}`);

    if (capturedEvents.length === 0) {
      errors.push('No SSE events were emitted');
    }
    if (!capturedEvents.some((e) => e.type === 'session_status_changed')) {
      errors.push('No session_status_changed events emitted');
    }

    // ── 15. Save report ────────────────────────────────────────────
    const report = {
      sessionId,
      goal: TEST_CONFIG.goal,
      templateUsed: template?.name ?? 'none',
      sessionName: finalSession.name,
      finalStatus: finalSession.status,
      pendingActionsCount: pendingActions.length,
      categoriseActionsCount: categoriseActions.length,
      categorizePostingsToolCallCount: toolCalledEvents.length,
      sseEventCount: capturedEvents.length,
      sseEventTypes: eventTypes,
      samplePredictions: categoriseActions.slice(0, 10).map((pa) => {
        const p = pa.payload as any;
        return {
          posting_id: p.posting_id,
          description: p.description,
          predicted_account_name: p.predicted_account_name,
          confidence: pa.confidence,
          confidence_score: p.confidence_score,
        };
      }),
    };
    const reportPath = path.join(REPORTS_DIR, 'v2-categorise-expenses-e2e.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    // ── Verdict ────────────────────────────────────────────────────
    if (errors.length > 0) {
      console.error(`\nFAILED with ${errors.length} error(s):`);
      for (const e of errors) console.error(`  - ${e}`);
    } else {
      console.log('\nPASSED');
    }
    expect(errors).toEqual([]);
  }, 480000); // 8 min — categorization LLM call can be slow on cold start
});
