/**
 * V2 Streaming + Session Trace — End-to-End Test
 *
 * Tests the STREAMING path (handleStreamingRequest) with session context.
 * This is the path the frontend uses — it was previously broken because
 * session context was not passed to streamText().
 *
 * Also validates the session trace API returns a complete audit trail.
 *
 * Run with:
 *   npx jest src/agent/__tests__/v2-streaming-trace-e2e.test.ts --runInBand --forceExit
 *
 * Prerequisites:
 * - Database running with indian-demo data
 * - LLM API key configured (LLM_PROVIDER + LLM_MODEL in .env.test)
 */

import { AgentService } from '../AgentService';
import { PermissionService } from '../../services/permissions/PermissionService';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

// Trigger builder registrations
import '../builders';

import {
  createAgentSession,
  getAgentSession,
} from '../services/SessionService';
import { getSessionTrace, SessionTrace } from '../services/SessionTraceService';
import { listPendingActions } from '../services/PendingActionService';

// ── Config ───────────────────────────────────────────────────────

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_sanjay_gupta',
  orgId: process.env.TEST_ORG_ID || 'org_indian_demo',
};

const REPORTS_DIR = path.join(__dirname, 'reports');
const createdSessionIds: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────

async function buildAuthContext(): Promise<AuthContext> {
  const user = await prisma.user.findUnique({
    where: { id: TEST_CONFIG.userId },
  });
  if (!user) {
    throw new Error(`Test user not found: ${TEST_CONFIG.userId}`);
  }
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

/**
 * Consume a ReadableStream fully, collecting all chunks.
 */
async function consumeStream(stream: import('stream/web').ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    result += decoder.decode(chunk.value as Uint8Array, { stream: true });
  }
  return result;
}

/**
 * Wait for session to reach a terminal state.
 */
async function waitForSessionCompletion(
  sessionId: string,
  timeoutMs: number = 120000,
  pollIntervalMs: number = 2000
): Promise<{ status: string; timedOut: boolean }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const session = await getAgentSession(sessionId);
    if (['completed', 'failed', 'awaiting_approval', 'abandoned'].includes(session.status)) {
      return { status: session.status, timedOut: false };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  const session = await getAgentSession(sessionId);
  return { status: session.status, timedOut: true };
}

// ── Cleanup ──────────────────────────────────────────────────────

afterAll(async () => {
  for (const sessionId of createdSessionIds) {
    try {
      await prisma.pending_action.deleteMany({ where: { session_id: sessionId } });
      await prisma.agent_message.deleteMany({ where: { session_id: sessionId } });
      await prisma.llm_trace.deleteMany({ where: { session_id: sessionId } });
      await prisma.agent_session.delete({ where: { id: sessionId } });
    } catch {
      // Ignore cleanup errors
    }
  }
  await prisma.$disconnect();
});

// ── Tests ────────────────────────────────────────────────────────

describe('V2 Streaming + Session Trace — E2E', () => {
  let auth: AuthContext;
  let agentService: AgentService;

  beforeAll(async () => {
    auth = await buildAuthContext();
    agentService = new AgentService();
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
  });

  test(
    'Streaming path creates plan and completes session',
    async () => {
      const startTime = Date.now();
      const errors: string[] = [];

      console.log('\n' + '='.repeat(60));
      console.log('TEST: Streaming path with session context');
      console.log('='.repeat(60) + '\n');

      // 1. Create session
      const goal = 'find the banking account with max spending and the top category';
      const session = await createAgentSession({
        org_id: TEST_CONFIG.orgId,
        user_id: TEST_CONFIG.userId,
        goal,
        mode: 'supervised',
        goal_model: 'posting',
      });
      createdSessionIds.push(session.id);
      console.log(`Session created: ${session.id}`);

      // 2. Call handleStreamingRequest (the path the frontend uses)
      const context = { modelName: 'default', debug: true };
      console.log('Sending goal via STREAMING path...');

      let streamOutput = '';
      try {
        const stream = await agentService.handleStreamingRequest(
          goal,
          auth,
          [],
          context,
          session.id
        );
        streamOutput = await consumeStream(stream);
        console.log(`Stream consumed: ${streamOutput.length} bytes`);
      } catch (err: any) {
        errors.push(`Streaming call failed: ${err.message}`);
        console.error('Streaming error:', err.message);
      }

      // 3. Wait for auto-continuation to complete
      console.log('Waiting for auto-continuation...');
      const { status: finalStatus, timedOut } = await waitForSessionCompletion(
        session.id,
        120000,
        3000
      );

      if (timedOut) {
        errors.push(`Session timed out in status: ${finalStatus}`);
        console.error(`TIMEOUT: Session stuck in "${finalStatus}"`);
      } else {
        console.log(`Session reached terminal state: ${finalStatus}`);
      }

      // 4. Fetch session trace
      console.log('\nFetching session trace...');
      let trace: SessionTrace | null = null;
      try {
        trace = await getSessionTrace(session.id);
      } catch (err: any) {
        errors.push(`Failed to get trace: ${err.message}`);
      }

      // 5. Validate session completion
      const finalSession = await getAgentSession(session.id);
      const plan = (finalSession.plan as any[]) || [];

      console.log(`\nPlan (${plan.length} steps):`);
      for (const step of plan) {
        const summary = step.result_summary
          ? step.result_summary.substring(0, 60)
          : '(no summary)';
        console.log(`  ${step.index + 1}. [${step.type}] ${step.title} — ${step.status} — ${summary}`);
      }

      if (finalSession.status !== 'completed') {
        errors.push(`Session status is "${finalSession.status}", expected "completed"`);
      }

      const pendingActions = await listPendingActions({ session_id: session.id });
      if (pendingActions.length !== 0) {
        errors.push(`${pendingActions.length} pending actions, expected 0`);
      }

      const incompletePlan = plan.filter((s) => s.status !== 'completed');
      if (incompletePlan.length > 0) {
        errors.push(`${incompletePlan.length} step(s) not completed`);
      }

      // 6. Validate trace structure
      if (trace) {
        console.log('\n--- Trace Validation ---');
        console.log(`  Session: ${trace.session.status}`);
        console.log(`  Plan steps: ${trace.plan.length}`);
        console.log(`  Timeline events: ${trace.timeline.length}`);
        console.log(`  LLM calls: ${trace.usage.total_llm_calls}`);
        console.log(`  Tools used: ${trace.usage.tools_used.join(', ')}`);
        console.log(`  Total tokens: ${trace.usage.total_prompt_tokens + trace.usage.total_completion_tokens}`);
        console.log(`  SQL queries: ${trace.usage.sql_queries_count}`);
        console.log(`  Actions: ${trace.actions.length}`);

        // Trace assertions
        if (trace.session.status !== 'completed') {
          errors.push(`Trace session status: ${trace.session.status}`);
        }
        if (trace.plan.length < 2) {
          errors.push(`Trace plan has ${trace.plan.length} steps, expected >= 2`);
        }
        if (trace.usage.total_llm_calls < 1) {
          errors.push(`No LLM calls recorded in trace`);
        }
        if (trace.timeline.length < 2) {
          errors.push(`Timeline has only ${trace.timeline.length} events`);
        }

        // Verify timeline is chronologically sorted
        for (let i = 1; i < trace.timeline.length; i++) {
          const prev = new Date(trace.timeline[i - 1].timestamp).getTime();
          const curr = new Date(trace.timeline[i].timestamp).getTime();
          if (curr < prev) {
            errors.push(`Timeline not sorted at index ${i}`);
            break;
          }
        }

        // Verify LLM call entries have steps with tool calls
        const llmCalls = trace.timeline.filter((e) => e.type === 'llm_call');
        if (llmCalls.length > 0) {
          const firstCall = llmCalls[0];
          if (!firstCall.steps || firstCall.steps.length === 0) {
            errors.push('First LLM call has no steps');
          }
        }

        // Save trace as JSON
        const tracePath = path.join(
          REPORTS_DIR,
          'v2-streaming-trace.json'
        );
        fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2));
        console.log(`\nTrace saved to: ${tracePath}`);
      }

      const elapsed = Date.now() - startTime;

      // 7. Verdict
      if (errors.length > 0) {
        console.error(`\nFAILED with ${errors.length} error(s):`);
        for (const err of errors) {
          console.error(`  - ${err}`);
        }
      } else {
        console.log(`\nPASSED in ${elapsed}ms`);
      }

      expect(errors).toEqual([]);
    },
    300000
  );
});
