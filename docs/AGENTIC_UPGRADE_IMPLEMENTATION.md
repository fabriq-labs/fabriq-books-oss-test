# Fabriq Agentic Upgrade — Implementation Reference

**Status**: V1 complete, V2 hybrid execution model complete
**Branch**: `feature/agent/demo`
**Plan doc**: [`docs/AGENTIC_UPGRADE_PLAN_WIP.md`](./AGENTIC_UPGRADE_PLAN_WIP.md)
**Last updated**: 2026-03-17

---

## What This Is

A session-aware, multi-step planning agent with human-in-the-loop approval for financial actions. The V1 end-to-end flow is **bank/ledger reconciliation** — all other action types are schema-defined but not built.

Three pillars:
1. **Session state** — agent remembers goal, plan, and progress across turns
2. **Multi-step planning** — goal decomposed into typed steps (query / analysis / action / report)
3. **Human-in-the-loop** — actions queued as `pending_action` rows for approve/reject before execution

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│                                                                  │
│  WorkbenchPage                                                   │
│  ├── SessionsSidebar          (session list, status badges)      │
│  ├── SessionHeader            (goal, step progress, mode)        │
│  ├── WorkZone                                                    │
│  │   ├── GoalSetter           (/workbench — no session)          │
│  │   ├── PendingActionsList   (default — batches + cards)        │
│  │   ├── GenericBatchList     (/batch/:batchId)                  │
│  │   └── PendingActionDetail  (/actions/:id — registry)          │
│  │       ├── ReconciliationDetail  (reconcile_posting)           │
│  │       └── PlaceholderDetail     (all other types)             │
│  └── ConversationPanel        (session-scoped streaming chat)    │
│                                                                  │
│  AgentSessionContext           (polling, CRUD, action resolution) │
│  sessionAPI / pendingActionAPI (HTTP client)                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │  HTTP / SSE
┌──────────────────────┴──────────────────────────────────────────┐
│                        BACKEND                                   │
│                                                                  │
│  routes.ts                                                       │
│  ├── POST/GET /sessions         (CRUD)                           │
│  ├── GET/PATCH /pending-actions (resolve, bulk approve)          │
│  └── POST /chat/stream          (sessionId in body → session     │
│                                  context injection)              │
│                                                                  │
│  AgentService.handleStreamingRequest(msg, auth, prev, ctx, sid)  │
│  ├── loads session + messages                                    │
│  ├── buildSessionContextBlock() → system prompt injection        │
│  ├── ToolManager.getUnifiedTools(model, auth, ctx, sessionId)    │
│  │   └── adds session tools when sessionId present               │
│  ├── LLM call (streamText / generateText)                        │
│  ├── persist messages to agent_message                           │
│  └── shouldAutoContinue() → setImmediate for next step           │
│                                                                  │
│  Session Tools (only when sessionId present)                     │
│  ├── createPlan      → decompose goal into PlanStep[]            │
│  ├── completeStep    → advance step, merge context               │
│  ├── queueAction     → single pending_action + mode logic        │
│  └── queueActionBatch → N pending_actions + mode logic           │
│                                                                  │
│  PendingActionService.resolvePendingAction()                     │
│  ├── status update                                               │
│  ├── PendingActionExecutor.execute() on approve                  │
│  │   ├── ReconcilePostingExecutor → confirmReconciliation()      │
│  │   └── PlaceholderExecutor      → no-op log                   │
│  └── if all resolved → session → 'executing', fire next step    │
│                                                                  │
│  Database: agent_session, agent_message, pending_action          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Session Lifecycle

```
User enters goal in GoalSetter
  → POST /sessions → status='planning'
  → First chat turn: agent calls createPlan
  → status='executing', step 0 active

Auto-continuation loop:
  → agent executes current step using existing tools
  → calls completeStep → advances step index
  → shouldAutoContinue() → true if status='executing' and step doesn't require approval
  → setImmediate fires next turn

When step type is 'action':
  → agent calls queueActionBatch → pending_action rows created
  → completeStep → session status='awaiting_approval'
  → shouldAutoContinue() → false (status is not 'executing')

User reviews in workbench:
  → approve/reject each action
  → PendingActionExecutor runs side effect on approve
  → when all resolved → session status='executing' (report step)
  → auto-continuation fires report step

Report step:
  → agent reads accumulated_context, posts summary
  → calls completeStep → session status='completed'
```

---

## Database Models

Three new Prisma models in `backend/prisma/schema/data.prisma`:

### agent_session
| Field | Type | Purpose |
|-------|------|---------|
| id | `ses_*` | Prefixed UUID |
| org_id, user_id | String | Multi-tenant ownership |
| goal | String | User's stated goal |
| goal_model | String? | Primary model context (e.g. 'posting') |
| plan | Json? | Array of PlanStep objects |
| status | String | planning / executing / awaiting_approval / completed / failed |
| current_step_index | Int? | Which step is active |
| accumulated_context | Json? | Running summaries (e.g. `{ unmatched_postings: 23 }`) |
| pending_actions_count | Int | Total actions queued |
| completed_actions_count | Int | Actions resolved |
| mode | String | supervised / semi_auto / autonomous |

### agent_message
| Field | Type | Purpose |
|-------|------|---------|
| id | `msg_*` | Prefixed UUID |
| session_id | FK | Parent session |
| role | String | user / assistant |
| content | Text | Message text |
| tool_calls | Json? | Tool invocations in this turn |
| step_index | Int? | Which plan step this message belongs to |

### pending_action
| Field | Type | Purpose |
|-------|------|---------|
| id | `pa_*` | Prefixed UUID |
| org_id | String | Multi-tenant |
| session_id | FK? | Parent session (nullable for standalone actions) |
| action_type | String | reconcile_posting / invoice_match / send_email / escalate_collection |
| batch_id | String? | Shared ID for batch-created actions |
| batch_total | Int? | Total in batch |
| title | String | Human-readable title |
| payload | Json | Type-specific data (posting_id, match_id, preview, etc.) |
| confidence | String | high / medium / low |
| status | String | pending / approved / rejected / deferred |
| on_approve | String | execute_immediately / execute_deferred |
| executed_at | DateTime? | When executor ran |
| execution_result | Json? | Executor output |
| execution_error | Text? | Executor error |

---

## PlanStep Type

```typescript
interface PlanStep {
  index: number;
  type: 'query' | 'analysis' | 'action' | 'report';
  title: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  requires_approval: boolean;
  result_summary?: string;
}
```

Typical reconciliation plan:
| Step | Type | Title |
|------|------|-------|
| 0 | query | Find unmatched postings for HDFC account |
| 1 | analysis | Suggest reconciliation matches |
| 2 | action | Queue matches for human review |
| 3 | report | Summarize results |

---

## Key Design Decisions

| Decision | What we did | Why |
|----------|-------------|-----|
| **Pause mechanism** | Session status transition to `awaiting_approval`, not step-type check | `shouldAutoContinue()` checks `session.status !== 'executing'` — simpler, one source of truth |
| **Auto-continuation** | `setImmediate()` fire-and-forget | Same pattern as Slack handler. No job queue needed in V1 |
| **Backward compatibility** | No sessionId = no session tools, no context injection | Zero changes to existing sidebar chat flow |
| **Streaming + sessions** | `handleStreamingRequest` updated to accept `sessionId` | Frontend workbench uses streaming; auto-continuation uses non-streaming `handleRequest` |
| **Component registry** | `PendingActionDetail` dispatches by `action_type` | `ReconciliationDetail` for V1; PlaceholderDetail fallback for future types |
| **Polling** | Frontend polls every 3s while session is active | V1 simplicity. SSE events defined in plan for future upgrade |
| **API response unwrap** | All session/action endpoints return `{ data: ... }`, frontend unwraps with `.then(r => r.data)` | Consistent with REST conventions |

---

## File Inventory

### Backend — New Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/agent/services/SessionService.ts` | ~90 | Session + message CRUD (createAgentSession, getAgentSession, listAgentSessions, updateAgentSession, createAgentMessage, listAgentMessages) |
| `src/agent/services/PendingActionService.ts` | ~320 | Pending action lifecycle (create, batch create, resolve, bulk approve, executor integration, report continuation trigger) |
| `src/agent/executors/PendingActionExecutor.ts` | ~110 | Executor registry. ReconcilePostingExecutor wraps confirmReconciliation(). PlaceholderExecutor for future types |
| `src/agent/tools/sessionTools.ts` | ~290 | Four Vercel AI SDK tools: createPlan, completeStep, queueAction, queueActionBatch |
| `src/agent/__tests__/session-api.test.ts` | ~250 | Phase 1 tests (13 passing) — session CRUD, pending action CRUD, batch operations |
| `src/agent/__tests__/session-agent.test.ts` | ~190 | Phase 2 tests (9 passing) — session context injection, auto-continuation, shouldAutoContinue |
| `src/agent/__tests__/pending-action-executor.test.ts` | ~290 | Phase 3 tests (8 passing) — executor dispatch, reconciliation, resolve flow, report continuation |

### Backend — Modified Files

| File | Change Summary |
|------|----------------|
| `prisma/schema/data.prisma` | Added agent_session, agent_message, pending_action models |
| `src/agent/AgentService.ts` | `handleRequest` + `handleStreamingRequest` both accept optional `sessionId`. Session context injection, message persistence, auto-continuation via setImmediate |
| `src/agent/ToolManager.ts` | `getUnifiedTools` accepts optional `sessionId`, adds session tools when present |
| `src/agent/prompt/constants.ts` | Added `SESSION_DIRECTIVE`, `buildSessionContextBlock()`, `shouldAutoContinue()` |
| `src/agent/routes.ts` | 11 new endpoints (sessions CRUD, pending-actions CRUD, batch approve). `/chat/stream` extracts `sessionId` from body |
| `src/agent/tools/index.ts` | Re-exports session tools |

### Frontend — New Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/contexts/AgentSessionContext.tsx` | ~240 | React context: session state, pending actions, polling (3s), CRUD wrappers, action resolution |
| `src/pages/workbench/WorkbenchPage.tsx` | ~60 | Shell: AgentSessionProvider > SessionsSidebar + WorkZone + ConversationPanel |
| `src/components/workbench/SessionsSidebar.tsx` | ~95 | Session list with status icons, pending badges, timestamps |
| `src/components/workbench/SessionHeader.tsx` | ~50 | Goal, step progress, status/mode badges |
| `src/components/workbench/GoalSetter.tsx` | ~120 | Goal input + mode selector + suggested goals |
| `src/components/workbench/ConversationPanel.tsx` | ~170 | Session-scoped streaming chat via `@ai-sdk/react` useChat with sessionId in body |
| `src/components/workbench/PendingActionsList.tsx` | ~50 | Default work zone: progress spinner or BatchSummaryCard |
| `src/components/workbench/BatchSummaryCard.tsx` | ~135 | Batch summary: confidence breakdown, review/auto-approve buttons |
| `src/components/workbench/PendingActionRow.tsx` | ~100 | Single action row: preview, confidence badge, approve/reject/detail |
| `src/components/workbench/GenericBatchList.tsx` | ~100 | Full batch review: action list with bulk approve, resolved section |
| `src/components/workbench/PendingActionDetail.tsx` | ~35 | Router: dispatches to ReconciliationDetail or PlaceholderDetail by action_type |
| `src/components/workbench/ReconciliationDetail.tsx` | ~370 | Full detail: live data fetch (posting + receipt/invoice), fallback to preview, side-by-side comparison, amount diff, confidence basis, other candidates, approve/reject |
| `src/components/workbench/PlaceholderDetail.tsx` | ~130 | Generic fallback: raw payload JSON, approve/reject |

### Frontend — Modified Files

| File | Change Summary |
|------|----------------|
| `src/api/api.ts` | Added `sessionAPI` (5 methods) and `pendingActionAPI` (5 methods) with `{ data }` unwrapping |
| `src/App.tsx` | Added `/workbench` route with nested session/batch/action sub-routes |
| `src/components/layout/sidebar/SidebarNavigation.tsx` | Added "Workbench" nav item with Bot icon |

---

## API Endpoints

All mounted under `/api/agent/`:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/sessions` | Create session (goal, mode, goal_model) |
| GET | `/sessions` | List user's sessions |
| GET | `/sessions/:id` | Get session with plan, status, counts |
| PATCH | `/sessions/:id` | Update session |
| GET | `/sessions/:id/messages` | Get conversation history |
| GET | `/pending-actions` | List actions (filter: session_id, batch_id, status) |
| GET | `/pending-actions/:id` | Get single action |
| GET | `/pending-actions/batch/:batchId` | Get all actions in batch |
| PATCH | `/pending-actions/:id` | Resolve (approve/reject/defer) |
| POST | `/pending-actions/batch/:batchId/approve` | Bulk approve by confidence |
| POST | `/chat/stream` | Streaming chat — accepts optional `sessionId` in body |

---

## Frontend Routes

| URL | Component | Shows |
|-----|-----------|-------|
| `/workbench` | GoalSetter | Goal input, no active session |
| `/workbench/sessions/:sessionId` | PendingActionsList | Batch cards or progress indicator |
| `/workbench/sessions/:sessionId/batch/:batchId` | GenericBatchList | All actions in batch |
| `/workbench/sessions/:sessionId/actions/:actionId` | PendingActionDetail | ReconciliationDetail or PlaceholderDetail |

---

## Approval Modes

| Mode | Behavior |
|------|----------|
| **supervised** (default) | All actions queued for human review |
| **semi_auto** | High-confidence actions auto-execute via PendingActionExecutor; medium/low queued |
| **autonomous** | All actions auto-execute (no human loop) |

Mode logic lives in `queueActionTool` / `queueActionBatchTool` — each action is evaluated individually.

---

## Executor Registry

```typescript
const EXECUTORS: Record<string, PendingActionHandler> = {
  reconcile_posting:    ReconcilePostingExecutor,  // calls confirmReconciliation(postingId, auth)
  invoice_match:        PlaceholderExecutor,       // no-op log
  send_email:           PlaceholderExecutor,       // no-op log
  escalate_collection:  PlaceholderExecutor,       // no-op log
};
```

Adding a new executor: implement `PendingActionHandler` interface, register in the map.

---

## Pending Action Payload — reconcile_posting

```typescript
{
  posting_id: string;
  match_type: 'payment_receipt' | 'invoice';
  match_id: string;
  match_reference: string;
  confidence_detail: string;
  other_candidates?: Array<{ id, reference, confidence, amount }>;
  preview: {
    posting: { description, amount, date, account };
    match:   { reference, amount, customer, date };
  };
}
```

`ReconciliationDetail` fetches fresh data using `posting_id` and `match_id`, falls back to `preview` if fetch fails (shows "data may be outdated" warning).

---

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `session-api.test.ts` | 13 | All passing |
| `session-agent.test.ts` | 9 | All passing |
| `pending-action-executor.test.ts` | 8 | All passing |
| `hybrid-execution.test.ts` | 14 | All passing (V2) |
| `v2-analytical-e2e.test.ts` | 1 | Passing — real LLM + real DB (V2) |

Run unit tests:
```bash
cd backend && npx jest src/agent/__tests__/{suite}.test.ts --runInBand --forceExit
```

Run E2E analytical test (requires LLM API key + database):
```bash
cd backend && npx jest v2-analytical-e2e --testTimeout=300000 --runInBand --forceExit
```

### hybrid-execution.test.ts (14 tests)

Tests the V2 deterministic registries and builders without any LLM or database:

| Group | What it tests |
|-------|---------------|
| **ActionBuilderRegistry** (4) | Returns `ReconciliationActionBuilder` for `posting + action`; returns null for wrong goal_model, wrong step type, or null goal_model |
| **ReconciliationActionBuilder** (3) | Builds pending actions from match_results (confidence ranking, other_candidates, payload shape); handles empty and missing match_results |
| **ReportFormatterRegistry** (4) | Returns formatter for reconciliation sessions (plan has action step); returns null for analytical sessions (no action step), null goal_model, or non-report steps |
| **ReconciliationReportFormatter** (3) | Formats report with confidence breakdown; handles zero matches and missing context fields |

### v2-analytical-e2e.test.ts (1 test, ~30s)

End-to-end test that drives a full analytical session through the real LLM:

1. Creates a session with `goal_model: 'posting'` and a spending analysis question
2. Sends the goal to `AgentService.handleRequest` with `debug: true`
3. LLM creates a plan (query → analysis → report), executes each step with real SQL queries against the database
4. Waits for auto-continuation to complete all steps
5. Asserts: session completed, no pending actions, all plan steps completed, report has content
6. Generates a detailed markdown report in `src/agent/__tests__/reports/` with:
   - Prompt metadata (source, template IDs, model, tools)
   - Full system prompt (collapsible)
   - Every tool call with SQL and results
   - Plan execution status
   - Accumulated context

**Prerequisites**: Database running with indian-demo data, `GOOGLE_GENERATIVE_AI_API_KEY` set, `.env.test` with `USE_LOCAL_PROMPT=true`.

**Note**: This test calls a real LLM, so results vary between runs. The test validates session machinery (plan creation, step completion, auto-continuation, report generation) rather than SQL correctness.

---

## V2 — Hybrid Execution Model

V2 adds a **dispatcher** that handles deterministic steps (action building, report formatting) inline — without an LLM round-trip. LLM-driven steps (query, analysis) are unchanged.

### Why

In V1, every step required an LLM turn. For reconciliation, the action step (build pending actions from match results) and report step (summarize confidence breakdown) are fully deterministic — the data is already in `accumulated_context`. V2 eliminates these unnecessary LLM calls, making reconciliation sessions faster and more predictable.

### How It Works

```
LLM completes step N → calls completeStep(N)
  ↓
completeStep saves result, then DISPATCHER walks forward:
  ↓
Step N+1 is 'action'?
  → ActionBuilderRegistry.get(goal_model, step) → builder found?
    YES → builder.build(context) → creates pending_actions → mark complete → continue
    NO  → break, return to LLM
  ↓
Step N+1 is 'report'?
  → ReportFormatterRegistry.get(goal_model, step, session) → formatter found?
    YES → formatter.format(context) → mark complete → continue
    NO  → break, return to LLM
  ↓
Step N+1 is 'query' or 'analysis'?
  → break, return to LLM (always needs LLM)
```

The dispatcher runs inside `completeStep` (sessionTools.ts). It walks forward through remaining steps, executing deterministic ones inline, and breaks as soon as it hits a step that needs the LLM.

### Registry Pattern

Both registries use first-match semantics with a `matches()` predicate:

```typescript
// ActionBuilderRegistry — matches (goal_model, step)
interface ActionBuilder {
  matches(goalModel: string | null, step: PlanStep): boolean;
  build(context, session, auth): Promise<ActionBuildResult>;
}

// ReportFormatterRegistry — matches (goal_model, step, session?)
interface ReportFormatter {
  matches(goalModel: string | null, step: PlanStep, session?: any): boolean;
  format(context, session): string;
}
```

Builders are registered at import time in `src/agent/builders/index.ts`:
```typescript
ActionBuilderRegistry.register(ReconciliationActionBuilder);
ReportFormatterRegistry.register(ReconciliationReportFormatter);
```

### ReconciliationActionBuilder

**File**: `src/agent/builders/ReconciliationActionBuilder.ts`
**Matches**: `goal_model === 'posting' && step.type === 'action'`

Reads `match_results` from accumulated context (populated by the analysis step's `suggestReconciliationMatches` tool). For each posting with suggestions:
- Selects the best match (highest confidence)
- Creates a pending action with payload: `posting_id`, `match_type`, `match_id`, `match_reference`, `other_candidates` (up to 3)
- Confidence is inherited from the best match

Returns `ActionBuildResult` with `pendingActions[]`, `summary`, `contextUpdate` (queued_matches count, confidence breakdown).

### ReconciliationReportFormatter

**File**: `src/agent/builders/ReconciliationReportFormatter.ts`
**Matches**: `goal_model === 'posting' && step.type === 'report' && plan has an action step`

The "plan has an action step" check distinguishes reconciliation flows from analytical posting queries. Both have `goal_model: 'posting'`, but only reconciliation has an action step in the plan.

Generates a plain-text summary: total unmatched postings scanned, match suggestions queued, confidence breakdown (high/medium/low), unmatched remainder.

### Session Flow Comparison

**V1 — Reconciliation (6 LLM turns)**:
```
LLM: createPlan → LLM: query → LLM: analysis → LLM: action (queueActionBatch) → [approval] → LLM: report
```

**V2 — Reconciliation (3 LLM turns)**:
```
LLM: createPlan → LLM: query → LLM: analysis+completeStep
  → DISPATCHER: action (ReconciliationActionBuilder) → [approval]
  → DISPATCHER: report (ReconciliationReportFormatter)
```

**V2 — Analytical query (unchanged, all LLM-driven)**:
```
LLM: createPlan → LLM: query → LLM: analysis → LLM: report (no formatter match → LLM writes narrative)
```

### Report Continuation After Approval

When all pending actions in a session are resolved (approved/rejected), `PendingActionService.resolvePendingAction()` triggers report continuation:

1. Check `checkAllPendingActionsResolved(sessionId)` — counts remaining `status='pending'`
2. If all resolved and session is `awaiting_approval`:
   - Try `ReportFormatterRegistry.get()` for deterministic report → complete session synchronously
   - If no formatter, fall back to LLM via `setImmediate(() => AgentService.handleRequest(...))`

### File Inventory — V2 New Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/agent/builders/ActionBuilderRegistry.ts` | ~60 | Registry: maps (goal_model, step) → ActionBuilder |
| `src/agent/builders/ReportFormatterRegistry.ts` | ~38 | Registry: maps (goal_model, step, session) → ReportFormatter |
| `src/agent/builders/ReconciliationActionBuilder.ts` | ~97 | Builds pending actions from match_results |
| `src/agent/builders/ReconciliationReportFormatter.ts` | ~45 | Formats reconciliation summary report |
| `src/agent/builders/index.ts` | ~22 | Centralized registration of all builders/formatters |
| `src/agent/__tests__/hybrid-execution.test.ts` | ~254 | Unit tests for registries + builders (14 tests) |
| `src/agent/__tests__/v2-analytical-e2e.test.ts` | ~591 | E2E test with real LLM + debug report generation |

### File Inventory — V2 Modified Files

| File | Change Summary |
|------|----------------|
| `src/agent/tools/sessionTools.ts` | Dispatcher loop in completeStep; auto-complete skipped steps; passes `session` to ReportFormatterRegistry |
| `src/agent/services/PendingActionService.ts` | Report continuation uses ReportFormatterRegistry with session param |
| `src/agent/AgentService.ts` | `RELATED_MODELS` mapping, session-derived context (modelName + focusModels), `_debug` field, `SESSION_MAX_STEPS` raised to 20 |
| `src/agent/prompt/DynamicPromptManager.ts` | `focusModels` filtering in `getAccessibleModels()`; filename hyphen normalization in local file loader; `generateDynamicPromptWithMetadata()` |

---

## Post-V2 Fixes

Issues discovered during E2E testing and resolved:

### 1. Prompt Selection — Session-Derived Context

**Problem**: When the test (or any service) calls `handleRequest` without page context, `DynamicPromptManager` defaults to loading all models. The system prompt included 20+ irrelevant procurement models, confusing the LLM.

**Fix** (`AgentService.ts`): When `sessionId` is present and `modelName` is 'default' or missing, derive `modelName` and `focusModels` from the session's `goal_model`:

```typescript
const RELATED_MODELS: Record<string, string[]> = {
  posting: ['posting', 'account', 'category', 'category_group', 'payment_receipt', 'invoice'],
  invoice: ['invoice', 'supplier', 'purchase_order', 'posting', 'account'],
  trade:   ['trade', 'instrument', 'holding', 'posting', 'account'],
};

// Before prompt selection:
if (sessionId && (!context?.modelName || context.modelName === 'default')) {
  const session = await getAgentSession(sessionId);
  if (session.goal_model) {
    effectiveContext.modelName = session.goal_model;
    effectiveContext.focusModels = RELATED_MODELS[session.goal_model];
  }
}
```

`DynamicPromptManager.getAccessibleModels()` then filters by `focusModels`, keeping only relevant models in the prompt.

### 2. ReconciliationReportFormatter Matching Analytical Sessions

**Problem**: The formatter matched any `goal_model: 'posting' + step.type: 'report'`, so analytical posting queries ("show expense breakdown") got the deterministic reconciliation report instead of an LLM-written narrative.

**Fix** (`ReconciliationReportFormatter.ts`): Added `session` parameter to `matches()`. Now checks `plan.some(s => s.type === 'action')` — only reconciliation flows (which have an action step) get the deterministic report. Analytical flows (query/analysis/report, no action step) fall through to the LLM.

### 3. LLM Exhausting Step Budget

**Problem**: With `SESSION_MAX_STEPS=10`, the LLM burned all steps on SQL trial-and-error (discovering `account.type` is a `text[]` array, running diagnostic queries) and never reached `completeStep`.

**Fix**: Raised `SESSION_MAX_STEPS` default from 10 to 20 (`AgentService.ts`). Also added type hints to the analytics prompt template:
```
- account.type (text[] array, e.g. '{BANK,CHECKING}')
- To filter account.type use array contains: account.type @> ARRAY['BANK']::text[]
- Do NOT use = or ILIKE on account.type — it is an array column
```

### 4. LLM Skipping completeStep for Early Steps

**Problem**: The LLM sometimes merges plan steps — e.g., it creates a plan, calls `getAnalyticsContext` (step 0), then runs the analytics query and calls `completeStep(1)` directly, never calling `completeStep(0)`. Step 0 stays `in_progress` forever, causing the "all steps completed" assertion to fail.

**Fix** (`sessionTools.ts` completeStep): Auto-complete any skipped prior steps:
```typescript
for (let i = 0; i < step_index; i++) {
  if (plan[i].status === 'in_progress' || plan[i].status === 'pending') {
    plan[i].status = 'completed';
    plan[i].result_summary = plan[i].result_summary || '(merged with subsequent step)';
    plan[i].completed_at = plan[i].completed_at || new Date().toISOString();
  }
}
```

### 5. Local Prompt File Loading — Hyphen/Underscore Mismatch

**Problem**: `DynamicPromptManager.getPromptTemplatesFromFiles()` normalized the view ID (replacing hyphens with underscores) but not the filename. Template files like `view_d8b6c832-62dd-48b4-b50d-20f24edbc969_analytics_zeiv.json` (with hyphens) never matched the normalized prefix `view_d8b6c832_62dd_48b4_b50d_20f24edbc969_`.

**Fix** (`DynamicPromptManager.ts`): Normalize the filename too before matching:
```typescript
const normalizedFile = file.replace(/-/g, '_');
if (!normalizedFile.startsWith(filePrefix)) return false;
```

### 6. Debug Visibility for Test Harness

**Problem**: No way to see what system prompt was sent, which templates loaded, what SQL the LLM generated, or what tools were available. Debugging LLM behavior required guesswork.

**Fix** (`AgentService.ts`): When `context.debug === true`, the response includes a `_debug` field:
```typescript
response._debug = {
  systemPrompt: finalSystemPrompt,
  promptMetadata,          // { templateIds, versions, promptTypes, viewName, modelName }
  promptSource,            // 'local-files' | 'database'
  toolNames: Object.keys(tools),
  modelName, llmModel, maxSteps,
};
```

The E2E test uses this to generate comprehensive debug reports in `src/agent/__tests__/reports/`.

---

## What Is Not Built (V1 Scope Boundaries)

- **SSE real-time events** — defined in plan, not implemented. Frontend polls instead.
- **Executor side effects** for invoice_match, send_email, escalate_collection — PlaceholderExecutor (no-op).
- **Approve with edits** — API supports `approved_with_edits` + `edited_payload`, no UI for inline editing yet.
- **Defer action** — API supports `deferred` + `defer_until`, no UI.
- **Session expiry** — `expires_at` fields exist, no cron job to clean up.
- **Visual plan step tracker** — SessionHeader shows text, no stepper UI.
- **Role-based action assignment** — `assigned_to` / `assigned_role` fields exist, not used in V1.

---

## Extending

### How To Add a New Action Type

1. **Define payload schema** in plan doc (Section 5)
2. **Create executor** in `backend/src/agent/executors/` implementing `PendingActionHandler`
3. **Register** in `EXECUTORS` map in `PendingActionExecutor.ts`
4. **Create detail component** in `frontend-1/src/components/workbench/`
5. **Register** in `ACTION_DETAIL_COMPONENTS` map in `PendingActionDetail.tsx`
6. Agent will naturally use the new type via `queueActionBatch` — no prompt changes needed if the tool schema is generic enough

### How To Add a New Deterministic Builder (V2)

1. **Create builder** in `backend/src/agent/builders/` implementing `ActionBuilder` or `ReportFormatter`
2. **Implement `matches()`** — return true for the (goal_model, step_type) combination this builder handles
3. **Implement `build()` or `format()`** — read from `accumulated_context`, return structured result
4. **Register** in `src/agent/builders/index.ts`
5. The dispatcher in `completeStep` will automatically pick it up — no changes to session tools needed

### How To Add focusModels for a New Goal Model

Add an entry to `RELATED_MODELS` in `AgentService.ts`:
```typescript
const RELATED_MODELS: Record<string, string[]> = {
  posting: ['posting', 'account', 'category', 'category_group', 'payment_receipt', 'invoice'],
  invoice: ['invoice', 'supplier', 'purchase_order', 'posting', 'account'],
  trade:   ['trade', 'instrument', 'holding', 'posting', 'account'],
  // Add new goal_model here:
  your_model: ['your_model', 'related_model_1', 'related_model_2'],
};
```

This ensures the system prompt only includes relevant model descriptions when the session's `goal_model` matches.
