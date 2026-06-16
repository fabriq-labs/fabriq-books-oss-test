# Fabriq Agent — Testing

**Audience**: Anyone writing a new tool/builder/executor and wanting an E2E
test for it, or tuning prompts and needing to verify the change didn't
regress other questions.
**Test directory**: `backend/src/agent/__tests__/`

---

## Test File Map

| File | What it covers |
|------|----------------|
| `session-agent.test.ts` | Session lifecycle: `createPlan`, `completeStep`, auto-continuation |
| `session-api.test.ts` | HTTP endpoints: create/list/get session, `/clarify`, message history |
| `v2-dispatcher-integration.test.ts` | Hybrid dispatcher: `ActionBuilderRegistry` → executor → `ReportFormatterRegistry` |
| `v2-create-posting-e2e.test.ts` | Full reconciliation E2E (Strategy 1 — see [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md#strategy-1--deterministic-builder)): query → `suggestReconciliationMatches` → builder → approve |
| `v2-categorise-expenses-e2e.test.ts` | Full categorization E2E (Strategy 2 — see [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md#strategy-2--llm-driven-queuing)): query → `categorizePostings` → LLM `queueActions` → approve |
| `v2-analytical-e2e.test.ts` | Analytics queries: `getAnalyticsContext` → SQL generation → `org_id` filtering |
| `v2-streaming-trace-e2e.test.ts` | `streamText` path + `llm_trace` recording (see [11-OBSERVABILITY.md](./11-OBSERVABILITY.md)) |
| `pending-action-executor.test.ts` | `PendingActionExecutor`: `reconcile_posting`, `categorize_transaction`, deferred approval |
| `hybrid-execution.test.ts` | Mixed flows: LLM steps + deterministic builders/formatters in one session |
| `posting-prompt.test.ts` | Prompt assembly harness — real LLM calls, see below |
| `posting-sample-questions.test.ts` | Broader sample-question regression set for conversational chat |
| `categorization-v2.test.ts`, `categorization-v2-bank-data.test.ts` | `categorizeTransactionBatchHandler` prediction pipeline (historical corpus + LLM fallback) |

Harness helpers (`posting-harness-*.ts`) provide shared setup: `posting-harness-auth.ts`
builds an `AuthContext` for the test org/user, `posting-harness-llm.ts` checks
`isLlmConfigured()` so harness tests skip cleanly (rather than failing) when
no LLM credentials are present, `posting-harness-prompt.ts` and
`posting-harness-ui-context.ts` build prompt/page-context fixtures.

---

## Running Tests

```bash
cd backend

# All agent tests (jest)
npm test -- --testPathPattern=agent

# Specific test file
npm test -- src/agent/__tests__/v2-categorise-expenses-e2e.test.ts

# Prompt test harness (full suite, real LLM calls)
npm run test:posting-prompt

# Prompt test harness (single question)
npm run test:posting-prompt -- --question "How much did I spend on groceries?"

# Sample-question regression set
npm run test:posting-sample-questions
```

Jest-based tests (`npm test`) generally hit a real test database via Prisma
but mock or guard LLM calls; the `posting-prompt` and
`posting-sample-questions` harnesses are intentionally **not** jest tests —
they make real `generateText`/`streamText` calls through
`AgentService.handleRequest()` and are run manually during prompt tuning.

---

## Prompt Test Harness

**File**: `__tests__/posting-prompt.test.ts`
**Command**: `npm run test:posting-prompt`

Runs `AgentService.handleRequest()` directly with real prompts, real tool
selection (`ToolManager.getUnifiedTools()`), and real DB queries against the
`posting` model — no LLM mocking. Before running, `isLlmConfigured()`
(`posting-harness-llm.ts`) checks that `LLM_PROVIDER` and its required
credentials ([10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md#supported-providers-llm_provider))
are present; if not, the harness skips with a message rather than failing.

### Configuration

Env is loaded from `backend/.env.test` first, then `backend/.env` (with
`override: true` — `.env` values for `DATABASE_URL`/LLM keys win). Relevant
vars:

```env
DATABASE_URL="postgresql://..."
TEST_USER_ID=user_rajesh_kumar
TEST_ORG_ID=org_rajesh
TEST_ACCOUNT_ID=acco_org_rajesh_canada_2101
TEST_ACCOUNT_NAME=Credit Card - CAN   # optional; fetched from DB if omitted
```

### Output

Reports are written to `__tests__/reports/`:
- `posting-prompt-report.md` — human-readable; every question, classification
  (`classifyQuestion()` result — see [04-PROMPT_SYSTEM.md — Question Routing](./04-PROMPT_SYSTEM.md#question-routing-conversational-chat)),
  SQL generated, and final response
- `posting-prompt-report.json` — structured data for diffing
- `posting-prompt-report-<timestamp>.json` — timestamped history for
  before/after comparison

### Iterative Prompt Tuning Workflow

1. `npm run test:posting-prompt` — run all test cases
2. Open `posting-prompt-report.md` — review SQL and responses for each
   question
3. Identify issues:

| Symptom | Likely cause | Fix location |
|--------|----------------|--------------|
| SQL contains `{{context.modelContext.selectedAccountId}}` literally | Placeholder not substituted | `DynamicPromptManager` — verify `modelContext` is passed through |
| "Total spend" sums all postings, ignores selected account | Prompt doesn't enforce account filtering | `prompt_template` row for `posting` / `analytics` |
| Wrong debit/credit side in a categorization suggestion | Money-direction rule unclear in prompt | Analytics or categorization prompt — clarify contra-account direction ([01-OVERVIEW.md — Money Direction Cheat Sheet](./01-OVERVIEW.md#money-direction-cheat-sheet)) |
| Agent gives up after one empty query | No retry instruction | `SESSION_DIRECTIVE` or analytics prompt — add "if 0 rows, broaden and retry, or call `requestClarification`" |
| `match_results` missing on `completeStep`, dispatcher doesn't fire | LLM didn't follow `SESSION_DIRECTIVE`'s save instruction | `atpl_reconcile`'s `system_prompt` or `SESSION_DIRECTIVE` — emphasize the save requirement |

4. Edit the relevant `prompt_template` row via Settings → AI Templates →
   Prompt Templates, or local JSON+TXT files if `USE_LOCAL_PROMPT=true`
   ([04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md))
5. Re-run and diff against the previous timestamped JSON report

### Adding Test Cases

Test cases live in `posting-prompt.test.ts`'s `TEST_CASES` and
`TEST_CASES_WITH_ACCOUNT` arrays:

```typescript
{
  name: 'Spending by category',
  question: 'Show me my biggest expenses by category this year',
  expectedBehavior: 'Should aggregate by contra account (not category table), sum amounts, sort desc',
  expectAnalytical: true,                   // optional — checked against classifyQuestion()
  minSteps: 2,                              // optional
  expectToolPatterns: ['analyticsQuery'],   // optional
  expectResponseContains: ['account'],      // optional
}
```

---

## E2E Session Test Pattern

From `v2-categorise-expenses-e2e.test.ts` (representative example — full
narrative version of this same flow is
[07-WORKED_EXAMPLES.md — Trace 1](./07-WORKED_EXAMPLES.md#trace-1-categorization-atpl_categorise)):

```typescript
it('categorises expenses end to end', async () => {
  // 1. Create session
  const session = await createAgentSession({ goal: '...', template_id: 'atpl_categorise', ... });

  // 2. Turn 1: planning → executing
  await agentService.handleRequest(goal, auth, [], context, session.id);
  let s = await getAgentSession(session.id);
  expect(s.status).toBe('executing');
  expect(s.plan).toHaveLength(3);

  // 3. Turn 2: query step
  await agentService.handleRequest(continuationMsg, auth, [], context, session.id);
  s = await getAgentSession(session.id);
  expect(s.current_step_index).toBe(1);

  // 4. Turn 3: action step (LLM calls categorizePostings + queueActions)
  await agentService.handleRequest(continuationMsg, auth, [], context, session.id);
  s = await getAgentSession(session.id);
  expect(s.status).toBe('awaiting_approval');
  const actions = await getPendingActionsForSession(session.id);
  expect(actions.length).toBeGreaterThan(0);

  // 5. Approve all actions
  for (const action of actions) {
    await pendingActionService.resolvePendingAction(action.id, { status: 'approved' }, auth);
  }

  // 6. Session should complete
  s = await getAgentSession(session.id);
  expect(s.status).toBe('completed');
});
```

For the deterministic-builder flow (`v2-create-posting-e2e.test.ts`), step 4
is replaced by an assertion that **no LLM call occurs** between the analysis
step's `completeStep` (with `match_results` in
`accumulated_context_update`) and `status === 'awaiting_approval'` — this is
what proves the `ReconciliationActionBuilder` ran instead of the LLM.

---

## Trace Reports Directory

LLM trace artifacts from harness/E2E runs are saved to `__tests__/reports/*.json`.
Used for:
- Comparing token counts before/after prompt changes
- Verifying tool call sequences match expectations
- Debugging failures that reproduce in CI but not locally

These are working artifacts, not fixtures — don't commit large trace files
unless a test explicitly reads a checked-in `reports/*.json` as a fixture
(e.g. `v2-streaming-trace-e2e.test.ts` reads `reports/v2-streaming-trace.json`).

---

## What's Next

- **13-EXTENDING.md** — recipes for adding a new tool, builder, or executor,
  each ending with "now add a test in `__tests__/`"
- **14-SHORTFALLS_AND_ROADMAP.md** — known gaps including untested code paths
