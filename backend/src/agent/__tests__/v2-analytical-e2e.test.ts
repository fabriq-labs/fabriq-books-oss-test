/**
 * V2 Analytical Session — End-to-End Test with Real LLM
 *
 * Tests the analytical question use case through the full session flow:
 * 1. Create session with analytical goal (no action step expected)
 * 2. LLM creates plan (query/analysis/report steps)
 * 3. LLM executes query steps (real DB queries via analyticsQuery)
 * 4. LLM executes analysis step
 * 5. LLM writes report (dispatcher has no formatter → LLM fallback)
 * 6. Session completes
 *
 * This tests:
 * - The full LLM-driven path (no deterministic dispatcher involvement)
 * - That the v2 changes don't break the LLM fallback path
 * - Auto-continuation through query → analysis → report steps
 * - Real DB data with real user/org context
 *
 * Run with:
 *   npx jest src/agent/__tests__/v2-analytical-e2e.test.ts --runInBand --forceExit
 *
 * Prerequisites:
 * - Database running with indian-demo data
 * - LLM API key configured (GOOGLE_GENERATIVE_AI_API_KEY or similar)
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

// Trigger builder registrations (ensures dispatcher is wired up)
import '../builders';

import {
  createAgentSession,
  getAgentSession,
  listAgentMessages,
} from '../services/SessionService';
import { listPendingActions } from '../services/PendingActionService';
import { getSessionTrace } from '../services/SessionTraceService';
import { PlanStep } from '../tools/sessionTools';

// ── Config ───────────────────────────────────────────────────────

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_sanjay_gupta',
  orgId: process.env.TEST_ORG_ID || 'org_indian_demo',
};

// Report output
const REPORTS_DIR = path.join(__dirname, 'reports');

// Track sessions for cleanup
const createdSessionIds: string[] = [];

// ── Test Questions ───────────────────────────────────────────────

interface AnalyticalTestCase {
  name: string;
  goal: string;
  /** What we expect the plan to look like */
  expectedPlanShape: {
    minSteps: number;
    maxSteps: number;
    shouldHaveActionStep: boolean;
    expectedStepTypes: string[]; // e.g. ['query', 'analysis', 'report']
  };
  /** What we expect at the end */
  expectedOutcome: {
    sessionStatus: 'completed';
    pendingActionsCount: 0;
    reportShouldContain?: string[]; // keywords in the final report
  };
}

const TEST_CASES: AnalyticalTestCase[] = [
  {
    name: 'Expense breakdown by category',
    goal: 'find the banking account with max spending and in that get me the max spending category? By category I mean the the counter account not the category in the posting',
    expectedPlanShape: {
      minSteps: 2,
      maxSteps: 5,
      shouldHaveActionStep: false,
      expectedStepTypes: ['query', 'report'], // at minimum
    },
    expectedOutcome: {
      sessionStatus: 'completed',
      pendingActionsCount: 0,
      reportShouldContain: [], // LLM-generated, we just check it's non-empty
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────

async function buildAuthContext(): Promise<AuthContext> {
  const user = await prisma.user.findUnique({
    where: { id: TEST_CONFIG.userId },
  });

  if (!user) {
    throw new Error(
      `Test user not found: ${TEST_CONFIG.userId}. Check TEST_CONFIG or database.`
    );
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
 * Drive one turn of the agent session.
 * Returns the LLM response.
 */
async function runSessionTurn(
  agentService: AgentService,
  message: string,
  auth: AuthContext,
  sessionId: string,
  context: any
): Promise<any> {
  return agentService.handleRequest(message, auth, [], context, sessionId);
}

/**
 * Wait for auto-continuation to finish by polling session status.
 * Returns when session is no longer 'executing' or 'planning', or timeout.
 */
async function waitForSessionCompletion(
  sessionId: string,
  timeoutMs: number = 120000,
  pollIntervalMs: number = 2000
): Promise<{ status: string; timedOut: boolean }> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const session = await getAgentSession(sessionId);
    // Terminal states: completed, failed, awaiting_approval
    if (['completed', 'failed', 'awaiting_approval', 'abandoned'].includes(session.status)) {
      return { status: session.status, timedOut: false };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  const session = await getAgentSession(sessionId);
  return { status: session.status, timedOut: true };
}

/**
 * Generate a markdown report of the test run
 */
function generateReport(
  testCase: AnalyticalTestCase,
  session: any,
  messages: any[],
  pendingActions: any[],
  elapsed: number,
  errors: string[],
  debugInfo?: any,
  firstTurnSteps?: any[]
): string {
  const plan = (session.plan as PlanStep[]) || [];
  const lines: string[] = [];

  lines.push('# V2 Analytical Session — E2E Test Report');
  lines.push('');
  lines.push(`**Date**: ${new Date().toISOString()}`);
  lines.push(`**Test**: ${testCase.name}`);
  lines.push(`**Goal**: "${testCase.goal}"`);
  lines.push(`**User**: ${TEST_CONFIG.userId} / ${TEST_CONFIG.orgId}`);
  lines.push(`**Elapsed**: ${elapsed}ms`);
  lines.push('');

  // Session state
  lines.push('## Session State');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Status | ${session.status} |`);
  lines.push(`| Goal Model | ${session.goal_model || '(none)'} |`);
  lines.push(`| Mode | ${session.mode} |`);
  lines.push(`| Pending Actions | ${session.pending_actions_count} |`);
  lines.push(`| Completed Actions | ${session.completed_actions_count} |`);
  lines.push('');

  // Debug: Prompt & Template Info
  if (debugInfo) {
    lines.push('## Prompt & Template Info');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push(`| Prompt Source | ${debugInfo.promptSource || '(unknown)'} |`);
    const meta = debugInfo.promptMetadata || {};
    lines.push(`| Template IDs | ${(meta.templateIds || []).join(', ') || '(none)'} |`);
    lines.push(`| Prompt Types | ${(meta.promptTypes || []).join(', ') || '(none)'} |`);
    lines.push(`| Model Name | ${debugInfo.modelName || '(none)'} |`);
    lines.push(`| View Name | ${meta.viewName || '(none)'} |`);
    lines.push(`| LLM Model | ${debugInfo.llmModel || '(unknown)'} |`);
    lines.push(`| Max Steps | ${debugInfo.maxSteps ?? '(unknown)'} |`);
    lines.push(`| Available Tools | ${(debugInfo.toolNames || []).join(', ')} |`);
    lines.push('');

    // Full system prompt in collapsible section
    if (debugInfo.systemPrompt) {
      const promptLen = debugInfo.systemPrompt.length;
      lines.push(`## Full System Prompt`);
      lines.push('');
      lines.push(`<details><summary>Click to expand (${promptLen} chars)</summary>`);
      lines.push('');
      lines.push('```');
      lines.push(debugInfo.systemPrompt);
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  // Tool Call Details from first turn steps
  if (firstTurnSteps && firstTurnSteps.length > 0) {
    lines.push('## Tool Call Details');
    lines.push('');
    let callNum = 0;
    for (const step of firstTurnSteps) {
      for (const tc of step.toolCalls || []) {
        callNum++;
        const toolName = tc.toolName || tc.name || '(unknown)';
        lines.push(`### Call ${callNum}: ${toolName}`);
        lines.push('');

        // Special handling for analyticsQuery — show SQL prominently
        if (toolName === 'analyticsQuery' && tc.args?.query) {
          lines.push('**SQL:**');
          lines.push('```sql');
          lines.push(tc.args.query);
          lines.push('```');
          if (tc.args.description) {
            lines.push(`**Description:** ${tc.args.description}`);
          }
          if (tc.args.uiHint) {
            lines.push(`**UI Hint:** ${tc.args.uiHint}`);
          }
        } else {
          // Generic: show args as JSON
          const argsStr = JSON.stringify(tc.args, null, 2);
          if (argsStr && argsStr !== '{}') {
            lines.push('**Args:**');
            lines.push('```json');
            lines.push(argsStr.length > 2000 ? argsStr.substring(0, 2000) + '...' : argsStr);
            lines.push('```');
          }
        }

        // Find matching result
        const matchingResult = (step.toolResults || []).find(
          (tr: any) => (tr.toolName || tr.name) === toolName
        );
        if (matchingResult?.result !== undefined) {
          const resultStr = typeof matchingResult.result === 'string'
            ? matchingResult.result
            : JSON.stringify(matchingResult.result, null, 2);
          // Show row count for array results
          if (Array.isArray(matchingResult.result)) {
            lines.push(`**Result:** ${matchingResult.result.length} rows`);
          } else if (matchingResult.result?.rows && Array.isArray(matchingResult.result.rows)) {
            lines.push(`**Result:** ${matchingResult.result.rows.length} rows`);
          }
          lines.push('```json');
          lines.push(resultStr.length > 3000 ? resultStr.substring(0, 3000) + '...' : resultStr);
          lines.push('```');
        }
        lines.push('');
      }
    }
  }

  // Plan
  lines.push('## Plan');
  lines.push('');
  lines.push(`| # | Type | Title | Status | Summary |`);
  lines.push(`|---|------|-------|--------|---------|`);
  for (const step of plan) {
    const summary = step.result_summary
      ? step.result_summary.substring(0, 80) + (step.result_summary.length > 80 ? '...' : '')
      : '-';
    lines.push(`| ${step.index + 1} | ${step.type} | ${step.title} | ${step.status} | ${summary} |`);
  }
  lines.push('');

  // Accumulated context
  lines.push('## Accumulated Context');
  lines.push('');
  const ctx = session.accumulated_context || {};
  const ctxStr = JSON.stringify(ctx, null, 2);
  if (ctxStr.length > 2000) {
    lines.push(`\`\`\`json\n${ctxStr.substring(0, 2000)}...\n\`\`\``);
  } else {
    lines.push(`\`\`\`json\n${ctxStr}\n\`\`\``);
  }
  lines.push('');

  // Messages (conversation log)
  lines.push('## Conversation Log');
  lines.push('');
  for (const msg of messages) {
    const role = msg.role.toUpperCase();
    const stepLabel = msg.step_index != null ? ` [Step ${msg.step_index + 1}]` : '';
    lines.push(`### ${role}${stepLabel}`);
    lines.push('');

    // Show tool calls if present
    if (msg.tool_calls) {
      const calls = msg.tool_calls as any[];
      for (const call of calls) {
        lines.push(`**Tool call**: \`${call.name || call.toolName}\``);
        if (call.args) {
          const argsStr = JSON.stringify(call.args, null, 2);
          if (argsStr.length > 500) {
            lines.push(`\`\`\`json\n${argsStr.substring(0, 500)}...\n\`\`\``);
          } else {
            lines.push(`\`\`\`json\n${argsStr}\n\`\`\``);
          }
        }
        lines.push('');
      }
    }

    // Show content (truncated for long messages)
    const content = msg.content || '';
    if (content.length > 1000) {
      lines.push(content.substring(0, 1000) + '...');
    } else {
      lines.push(content);
    }
    lines.push('');
  }

  // Pending actions
  if (pendingActions.length > 0) {
    lines.push('## Pending Actions');
    lines.push('');
    for (const action of pendingActions) {
      lines.push(`- **${action.title}** (${action.confidence}) — ${action.status}`);
    }
    lines.push('');
  }

  // Errors
  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const err of errors) {
      lines.push(`- ${err}`);
    }
    lines.push('');
  }

  // Assertions
  lines.push('## Assertions');
  lines.push('');
  const passed = errors.length === 0;
  lines.push(`| Check | Result |`);
  lines.push(`|-------|--------|`);
  lines.push(`| Session completed | ${session.status === 'completed' ? 'PASS' : 'FAIL: ' + session.status} |`);
  lines.push(`| No pending actions | ${pendingActions.length === 0 ? 'PASS' : 'FAIL: ' + pendingActions.length} |`);
  lines.push(`| No action steps in plan | ${!plan.some((s) => s.type === 'action') ? 'PASS' : 'WARN: plan has action step'} |`);
  lines.push(`| All plan steps completed | ${plan.every((s) => s.status === 'completed') ? 'PASS' : 'FAIL'} |`);
  lines.push(`| Has report step | ${plan.some((s) => s.type === 'report') ? 'PASS' : 'FAIL'} |`);
  const reportStep = plan.find((s) => s.type === 'report');
  lines.push(`| Report has content | ${reportStep?.result_summary ? 'PASS' : 'FAIL'} |`);
  lines.push('');
  lines.push(`**Overall**: ${passed ? 'PASS' : 'FAIL'}`);

  return lines.join('\n');
}

// ── Cleanup ──────────────────────────────────────────────────────

afterAll(async () => {
  for (const sessionId of createdSessionIds) {
    try {
      await prisma.pending_action.deleteMany({ where: { session_id: sessionId } });
      await prisma.agent_message.deleteMany({ where: { session_id: sessionId } });
      await prisma.agent_session.delete({ where: { id: sessionId } });
    } catch (e) {
      // Ignore
    }
  }
  await prisma.$disconnect();
});

// ── Tests ────────────────────────────────────────────────────────

describe('V2 Analytical Session — E2E with LLM', () => {
  let auth: AuthContext;
  let agentService: AgentService;

  beforeAll(async () => {
    auth = await buildAuthContext();
    agentService = new AgentService();

    // Ensure reports directory exists
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
  });

  for (const testCase of TEST_CASES) {
    test(
      testCase.name,
      async () => {
        const startTime = Date.now();
        const errors: string[] = [];

        console.log(`\n${'='.repeat(60)}`);
        console.log(`TEST: ${testCase.name}`);
        console.log(`GOAL: ${testCase.goal}`);
        console.log(`${'='.repeat(60)}\n`);

        // 1. Create session
        const session = await createAgentSession({
          org_id: TEST_CONFIG.orgId,
          user_id: TEST_CONFIG.userId,
          goal: testCase.goal,
          mode: 'supervised',
          goal_model: 'posting', // drives prompt selection + focusModels (posting, account, category, etc.)
        });
        createdSessionIds.push(session.id);
        console.log(`Session created: ${session.id}`);

        // 2. Send the goal as the first message — LLM should call createPlan
        // modelName left as 'default' — handleRequest will derive it from session.goal_model
        const context = { modelName: 'default', debug: true };
        console.log('Sending initial message to LLM...');

        let firstTurnResult: any;
        try {
          firstTurnResult = await runSessionTurn(agentService, testCase.goal, auth, session.id, context);
        } catch (err: any) {
          errors.push(`Initial turn failed: ${err.message}`);
          console.error('Initial turn error:', err.message);
        }

        // 3. Wait for auto-continuation to complete all steps
        console.log('Waiting for auto-continuation...');
        const { status: finalStatus, timedOut } = await waitForSessionCompletion(
          session.id,
          120000, // 2 minute timeout
          3000    // poll every 3s
        );

        if (timedOut) {
          errors.push(`Session timed out in status: ${finalStatus}`);
          console.error(`TIMEOUT: Session stuck in "${finalStatus}"`);
        } else {
          console.log(`Session reached terminal state: ${finalStatus}`);
        }

        // 4. Gather final state
        const finalSession = await getAgentSession(session.id);
        const messages = await listAgentMessages(session.id, 100);
        const pendingActions = await listPendingActions({ session_id: session.id });
        const plan = (finalSession.plan as PlanStep[]) || [];

        console.log(`\nPlan (${plan.length} steps):`);
        for (const step of plan) {
          const summary = step.result_summary
            ? step.result_summary.substring(0, 60)
            : '(no summary)';
          console.log(`  ${step.index + 1}. [${step.type}] ${step.title} — ${step.status} — ${summary}`);
        }

        console.log(`\nMessages: ${messages.length}`);
        console.log(`Pending actions: ${pendingActions.length}`);

        // 5. Assertions
        // Plan shape
        if (plan.length < testCase.expectedPlanShape.minSteps) {
          errors.push(
            `Plan has ${plan.length} steps, expected at least ${testCase.expectedPlanShape.minSteps}`
          );
        }
        if (plan.length > testCase.expectedPlanShape.maxSteps) {
          errors.push(
            `Plan has ${plan.length} steps, expected at most ${testCase.expectedPlanShape.maxSteps}`
          );
        }

        // No action steps for analytical questions
        if (!testCase.expectedPlanShape.shouldHaveActionStep) {
          const hasAction = plan.some((s) => s.type === 'action');
          if (hasAction) {
            // This is a warning, not a failure — LLM might include one
            console.warn('  WARN: Plan includes an action step for analytical question');
          }
        }

        // Session should complete
        if (finalSession.status !== testCase.expectedOutcome.sessionStatus) {
          errors.push(
            `Session status is "${finalSession.status}", expected "${testCase.expectedOutcome.sessionStatus}"`
          );
        }

        // No pending actions
        if (pendingActions.length !== testCase.expectedOutcome.pendingActionsCount) {
          errors.push(
            `${pendingActions.length} pending actions, expected ${testCase.expectedOutcome.pendingActionsCount}`
          );
        }

        // All steps completed
        const incompletePlan = plan.filter((s) => s.status !== 'completed');
        if (incompletePlan.length > 0) {
          errors.push(
            `${incompletePlan.length} step(s) not completed: ${incompletePlan.map((s) => `${s.title}:${s.status}`).join(', ')}`
          );
        }

        // Report step exists and has content
        const reportStep = plan.find((s) => s.type === 'report');
        if (!reportStep) {
          errors.push('No report step in plan');
        } else if (!reportStep.result_summary) {
          errors.push('Report step has no result_summary');
        } else {
          console.log(`\nReport summary:\n${reportStep.result_summary}`);
        }

        // Check report keywords
        if (reportStep?.result_summary && testCase.expectedOutcome.reportShouldContain) {
          for (const keyword of testCase.expectedOutcome.reportShouldContain) {
            if (!reportStep.result_summary.toLowerCase().includes(keyword.toLowerCase())) {
              errors.push(`Report missing expected keyword: "${keyword}"`);
            }
          }
        }

        const elapsed = Date.now() - startTime;

        // 6. Generate report
        const report = generateReport(
          testCase,
          finalSession,
          messages,
          pendingActions,
          elapsed,
          errors,
          firstTurnResult?._debug,
          firstTurnResult?.steps
        );

        const reportPath = path.join(
          REPORTS_DIR,
          `v2-analytical-${testCase.name.replace(/\s+/g, '-').toLowerCase()}.md`
        );
        fs.writeFileSync(reportPath, report);
        console.log(`\nReport saved to: ${reportPath}`);

        // 6b. Fetch and save session trace
        try {
          const trace = await getSessionTrace(session.id);
          const tracePath = path.join(
            REPORTS_DIR,
            `v2-analytical-${testCase.name.replace(/\s+/g, '-').toLowerCase()}-trace.json`
          );
          fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2));
          console.log(`Trace saved to: ${tracePath}`);
          console.log(`  LLM calls: ${trace.usage.total_llm_calls}`);
          console.log(`  Tools used: ${trace.usage.tools_used.join(', ')}`);
          console.log(`  Timeline events: ${trace.timeline.length}`);
        } catch (traceErr: any) {
          console.warn(`Failed to generate trace: ${traceErr.message}`);
        }

        // 7. Final verdict
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
      300000 // 5 minute timeout per test
    );
  }
});
