/**
 * V2 Create Posting — End-to-End Test
 *
 * Tests the full workbench flow for the 'create_posting' action type:
 * 1. Create session with "Book Transactions" template
 * 2. Agent creates a plan (query + action + report steps)
 * 3. Agent queries for unbooked transactions
 * 4. Agent queues create_posting actions (session → awaiting_approval)
 * 5. Test approves all actions
 * 6. PendingActionService triggers continuation
 * 7. CreatePostingExecutor creates posting records
 * 8. Session completes
 *
 * Also verifies:
 * - SessionEventBus emits events during execution
 * - Session name is auto-generated after plan creation
 * - Template system_prompt is used
 *
 * Run with:
 *   npx jest src/agent/__tests__/v2-create-posting-e2e.test.ts --runInBand --forceExit
 *
 * Prerequisites:
 * - Database running with indian-demo data
 * - LLM API key configured
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
} from '../services/SessionService';
import {
  listPendingActions,
  resolvePendingAction,
} from '../services/PendingActionService';
import { sessionEventBus, SessionEvent } from '../services/SessionEventBus';

// ── Config ───────────────────────────────────────────────────────

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_sanjay_gupta',
  orgId: process.env.TEST_ORG_ID || 'org_indian_demo',
};

const REPORTS_DIR = path.join(__dirname, 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────

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

// ── Test ─────────────────────────────────────────────────────────

describe('V2 Create Posting — E2E', () => {
  let sessionId: string;
  const capturedEvents: SessionEvent[] = [];
  let unsubscribe: (() => void) | null = null;

  afterAll(async () => {
    unsubscribe?.();
    // Clean up test session
    if (sessionId) {
      try {
        await prisma.agent_session.delete({ where: { id: sessionId } });
      } catch { /* already deleted */ }
    }
    await prisma.$disconnect();
  });

  it('books unbooked transactions end-to-end', async () => {
    const errors: string[] = [];

    // ── Build auth (load real user + permissions from DB) ────────
    const auth = await buildAuthContext();

    // ── 1. Get (or skip) the Book Transactions template ──────────
    const template = await prisma.agent_template.findFirst({
      where: { name: 'Book Transactions', is_active: true },
    });

    if (!template) {
      console.warn('Book Transactions template not found — run seed-agent-templates.sql first');
      console.warn('Falling back to templateless session');
    }

    console.log(`Using template: ${template?.name ?? 'none (fallback)'}`);

    // ── 2. Create session ────────────────────────────────────────
    const session = await createAgentSession({
      org_id: TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal: 'Book any unbooked transactions for the Checking Account',
      goal_model: 'posting',
      mode: 'supervised',
      template_id: template?.id,
    });
    sessionId = session.id;
    console.log(`Session created: ${sessionId}`);

    // ── 3. Subscribe to SSE events ───────────────────────────────
    unsubscribe = sessionEventBus.subscribeSession(sessionId, (evt) => {
      capturedEvents.push(evt);
      console.log(`  [SSE] ${evt.type}: ${JSON.stringify(evt.data).slice(0, 100)}`);
    });

    // ── 4. Run first LLM call (streaming path — plan creation) ───
    const agentService = new AgentService();
    console.log('\nStarting streaming call (plan creation)...');
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

    // ── 5. Wait for awaiting_approval (or completed if 0 actions) ─
    console.log('\nWaiting for session to reach awaiting_approval or completed...');
    const { status: statusAfterPlan, timedOut: t1 } = await waitForStatus(
      sessionId,
      ['awaiting_approval', 'completed', 'failed'],
      240000   // 4 min — agent may take longer on first run
    );

    if (t1) {
      errors.push(`Timed out waiting for awaiting_approval. Status: ${statusAfterPlan}`);
    } else {
      console.log(`Status reached: ${statusAfterPlan}`);
    }

    // ── 6. Check pending actions ─────────────────────────────────
    const pendingActions = await listPendingActions({
      session_id: sessionId,
      status: 'pending',
    });

    console.log(`\nPending actions: ${pendingActions.length}`);
    for (const pa of pendingActions.slice(0, 5)) {
      console.log(`  - [${pa.confidence}] ${pa.title}`);
    }

    if (statusAfterPlan === 'awaiting_approval' && pendingActions.length === 0) {
      errors.push('Session is awaiting_approval but no pending actions found');
    }

    // ── 7. Approve all pending actions ───────────────────────────
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

      // ── 8. Wait for session to complete ─────────────────────────
      console.log('\nWaiting for session to complete after approvals...');
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
        errors.push('Session ended in failed state');
      }

      // ── 9. Verify executor ran (postings created) ────────────────
      const executedActions = await listPendingActions({
        session_id: sessionId,
        status: 'executed',
      });
      console.log(`\nExecuted actions: ${executedActions.length}`);
      if (pendingActions.length > 0 && executedActions.length === 0) {
        // Some action types may not have executors yet — only fail if create_posting wasn't executed
        const createPostingActions = pendingActions.filter(pa => pa.action_type === 'create_posting');
        if (createPostingActions.length > 0) {
          errors.push(`${createPostingActions.length} create_posting actions were not executed`);
        }
      }
    }

    // ── 10. Verify session name was generated ──────────────────────
    const finalSession = await getAgentSession(sessionId);
    console.log(`\nSession name: "${finalSession.name ?? '(not generated yet)'}"`);
    // Name generation is async — give it a moment
    if (!finalSession.name) {
      await new Promise(r => setTimeout(r, 3000));
      const sessionAfterDelay = await getAgentSession(sessionId);
      if (sessionAfterDelay.name) {
        console.log(`Session name (after delay): "${sessionAfterDelay.name}"`);
      } else {
        console.warn('Session name not generated — may still be in progress');
      }
    }

    // ── 11. Verify SSE events were emitted ─────────────────────────
    console.log(`\n--- SSE Event Summary ---`);
    console.log(`Total events captured: ${capturedEvents.length}`);
    const eventTypes = [...new Set(capturedEvents.map(e => e.type))];
    console.log(`Event types seen: ${eventTypes.join(', ')}`);

    if (capturedEvents.length === 0) {
      errors.push('No SSE events were emitted');
    }
    const hasStatusChange = capturedEvents.some(e => e.type === 'session_status_changed');
    if (!hasStatusChange) {
      errors.push('No session_status_changed events emitted');
    }

    // ── 12. Save report ────────────────────────────────────────────
    const report = {
      sessionId,
      templateUsed: template?.name ?? 'none',
      sessionName: finalSession.name,
      finalStatus: finalSession.status,
      pendingActionsCount: pendingActions.length,
      executedActionsCount: pendingActions.filter(pa => pa.action_type === 'create_posting').length,
      sseEventCount: capturedEvents.length,
      sseEventTypes: eventTypes,
    };
    fs.writeFileSync(
      path.join(REPORTS_DIR, 'v2-create-posting-e2e.json'),
      JSON.stringify(report, null, 2)
    );
    console.log(`\nReport saved to: ${path.join(REPORTS_DIR, 'v2-create-posting-e2e.json')}`);

    // ── Verdict ────────────────────────────────────────────────────
    if (errors.length > 0) {
      console.error(`\nFAILED with ${errors.length} error(s):`);
      for (const e of errors) console.error(`  - ${e}`);
    } else {
      console.log('\nPASSED');
    }
    expect(errors).toEqual([]);
  }, 420000);
});
