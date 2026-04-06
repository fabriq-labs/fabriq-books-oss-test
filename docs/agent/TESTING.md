# Fabriq Agent — Testing Guide

**Last Updated**: 2026-04-04  
**Test directory**: `backend/src/agent/__tests__/`

---

## Test File Map

| File | What it covers |
|------|----------------|
| `session-agent.test.ts` | Session lifecycle: `createPlan`, `completeStep`, auto-continuation, backward compat |
| `session-api.test.ts` | HTTP endpoints: create, list, get session; clarification; message history |
| `v2-dispatcher-integration.test.ts` | Deterministic path: ActionBuilder → executor → ReportFormatter |
| `v2-create-posting-e2e.test.ts` | Full reconciliation E2E: Query → Suggest matches → Queue actions → Approve |
| `v2-categorise-expenses-e2e.test.ts` | Full categorisation E2E: Fetch postings → Categorize → Queue actions → Approve |
| `v2-analytical-e2e.test.ts` | Analytics queries: schema context → SQL generation → filtering |
| `v2-streaming-trace-e2e.test.ts` | Streaming + trace logging: real-time event emission + trace recording |
| `pending-action-executor.test.ts` | Action execution: reconcile, categorize, deferred approval |
| `hybrid-execution.test.ts` | Mixed paths: LLM + builders + executors in one flow |
| `posting-prompt.test.ts` | Prompt assembly: model descriptions, focus models, analytics guidelines |

---

## Running Tests

```bash
cd backend

# All agent tests
npm test -- --testPathPattern=agent

# Specific test file
npm test -- src/agent/__tests__/v2-categorise-expenses-e2e.test.ts

# Prompt test harness (full suite)
npm run test:posting-prompt

# Prompt test harness (single question)
npm run test:posting-prompt -- --question "How much did I spend on groceries?"

# Reconciliation pipeline test
npm run test:reconciliation
npm run test:reconciliation:single
npm run test:reconciliation:cleanup
```

---

## Prompt Test Harness

**File**: `__tests__/posting-prompt.test.ts`  
**Command**: `npm run test:posting-prompt`

The prompt harness runs `AgentService.handleRequest()` directly with real prompts, real tools, and real DB queries. It does not mock the LLM — it makes actual calls.

### Configuration (`.env.test`)

```env
DATABASE_URL="postgresql://..."
TEST_USER_ID=user_rajesh_kumar
TEST_ORG_ID=org_rajesh
TEST_ACCOUNT_ID=acco_org_rajesh_canada_2101
TEST_ACCOUNT_NAME=Credit Card - CAN   # optional; fetched from DB if omitted
```

### Output

After running, reports are written to `__tests__/reports/`:
- `posting-prompt-report.md` — human-readable; includes every question, classification, SQL generated, and final response
- `posting-prompt-report.json` — structured data for diffing
- `posting-prompt-report-<timestamp>.json` — timestamped history for comparison

### Iterative Prompt Tuning Workflow

1. `npm run test:posting-prompt` — run all test cases
2. Open `posting-prompt-report.md` — review SQL and responses for each question
3. Identify issues:

| Symptom | Likely cause | Fix location |
|--------|----------------|--------------|
| SQL contains `{{context.modelContext.selectedAccountId}}` literally | Placeholder not replaced | `DynamicPromptManager` — verify `modelContext` is passed and substituted |
| "Total spend" sums all postings, ignores selected account | Prompt doesn't enforce account filtering | Analytics prompt — add rule + example |
| Wrong debit/credit side | Double-entry side unclear | Analytics prompt — clarify contra-account direction |
| Agent gives up after one empty query | No retry instruction | Analytics prompt — add "if 0 rows, broaden and retry" |

4. Edit prompts in `backend/prisma/metadata/prompt-templates/` (local) or Settings > Prompt Templates (DB)
5. If editing local files: `npx ts-node prisma/sync-metadata.ts` to sync to DB
6. Re-run and compare to previous timestamped JSON

### Adding Test Cases

Test cases are in `posting-prompt.test.ts`, arrays `TEST_CASES` and `TEST_CASES_WITH_ACCOUNT`.

Each case:
```typescript
{
  name: 'Spending by category',
  question: 'Show me my biggest expenses by category this year',
  expectedBehavior: 'Should aggregate by contra account (not category table), sum amounts, sort desc',
  expectAnalytical: true,          // optional
  minSteps: 2,                     // optional
  expectToolPatterns: ['analyticsQuery'],  // optional
  expectResponseContains: ['account'],    // optional
}
```

---

## E2E Test Pattern

From `v2-categorise-expenses-e2e.test.ts` (representative example):

```typescript
it('categorises expenses end to end', async () => {
  // 1. Create session
  const session = await createAgentSession({ goal: '...', templateId: 'atpl_categorise', ... });

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

---

## Reconciliation Test Script

**File**: `scripts/test-reconciliation-pipeline.ts`

| Mode | Command | What it does |
|------|---------|--------------|
| Batch | `npm run test:reconciliation` | Import test CSV, run pipeline, print scorecard |
| Single | `npm run test:reconciliation:single` | Create one posting, run pipeline |
| Existing | `npm run test:reconciliation -- --posting-id=post_xxx` | Run pipeline on existing posting |
| Cleanup | `npm run test:reconciliation:cleanup` | Delete `[TEST-RECON]` postings |

**Test CSV**: `backend/test-data/test-bank-statement.csv`

---

## Trace Reports Directory

LLM trace artifacts from E2E test runs are saved to `__tests__/reports/*.json`. These are used for:
- Comparing token counts before/after prompt changes
- Verifying tool sequences in CI
- Debugging when tests fail in CI but not locally

Do not commit large trace files. The `.gitignore` excludes `reports/` (check if needed for your setup).
