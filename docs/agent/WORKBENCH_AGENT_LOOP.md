# Fabriq Workbench — Agent Loop & Architecture

**Date**: 2026-03-30
**Audience**: Backend developers working on the agent system

This document explains how the workbench and agent loop work as currently implemented. For the user-facing design, see [WORKBENCH_FUNCTIONAL_SPEC.md](./WORKBENCH_FUNCTIONAL_SPEC.md).

---

## Table of Contents

1. [High-Level Flow](#1-high-level-flow)
2. [Session Lifecycle](#2-session-lifecycle)
3. [The Agent Loop (AgentService)](#3-the-agent-loop-agentservice)
4. [Tool Registration](#4-tool-registration)
5. [Plan Creation and Step Execution](#5-plan-creation-and-step-execution)
6. [The Hybrid Dispatcher](#6-the-hybrid-dispatcher)
7. [Pending Actions and Approval](#7-pending-actions-and-approval)
8. [SSE Event System](#8-sse-event-system)
9. [Session Completion](#9-session-completion)
10. [Key Files Reference](#10-key-files-reference)
11. [Sequence Diagrams](#11-sequence-diagrams)

---

## 1. High-Level Flow

```
User submits goal
      │
      ▼
POST /api/agent/sessions        ← creates session record (status: planning)
      │
      ▼
POST /api/agent/sessions/:id/stream   ← first LLM call (streaming)
      │                               ← agent creates a plan, session → executing
      ▼
[auto-continuation loop]
      │
      ├── step is query/analysis → agent calls tools (analyticsQuery, categorizePostings, etc.)
      │                          → calls completeStep() → dispatcher fires
      │
      ├── step is action (deterministic) → builder creates pending actions → awaiting_approval
      │
      ├── step is action (LLM-driven) → agent calls queueActionBatch → awaiting_approval
      │
      └── step is report (deterministic) → formatter writes report → completed
                         (LLM-driven)   → agent writes report text → completed
      │
      ▼
User approves pending actions (POST /api/agent/pending-actions/:id/resolve)
      │
      ▼
PendingActionService checks if all resolved → resumes agent or marks completed
```

---

## 2. Session Lifecycle

### States

```
planning → executing → awaiting_approval ⇄ executing → completed
                                                     ↘ failed
```

| State | When set |
|-------|---------|
| `planning` | Session created |
| `executing` | First LLM call starts; also restored from `awaiting_approval` when actions are all resolved and more steps remain |
| `awaiting_approval` | Agent calls `queueAction` or `queueActionBatch`; or dispatcher creates actions via a builder |
| `completed` | All plan steps done and all pending actions resolved |
| `failed` | Unhandled error in AgentService |

### Session Record Fields (key ones)

| Field | Purpose |
|-------|---------|
| `goal` | Original user input |
| `goal_model` | Which model tools to provide (`posting`, `invoice`, etc.) |
| `template_id` | Which agent template was used (nullable) |
| `name` | Auto-generated 4-6 word title |
| `plan` | JSON array of `PlanStep` objects |
| `current_step_index` | Which step the agent is currently on |
| `accumulated_context` | JSON bag the agent fills in via `completeStep` — carries data between steps |
| `status` | Current lifecycle state |
| `mode` | `supervised` / `semi_auto` / `autonomous` |

---

## 3. The Agent Loop (AgentService)

### Entry Points

```typescript
// Non-streaming (used by auto-continuation and tests)
AgentService.handleRequest(message, auth, previousMessages, context, sessionId)

// Streaming (used by the frontend's first call)
AgentService.handleStreamingRequest(message, auth, previousMessages, context, sessionId)
```

Both paths are nearly identical. `handleStreamingRequest` returns a `ReadableStream` for SSE to the browser; internally it calls `streamText` instead of `generateText`.

### Context Derivation

When a `sessionId` is provided and `context.modelName === 'default'`, the agent derives the real model name from `session.goal_model`:

```typescript
if (sessionId && (!context?.modelName || context.modelName === 'default')) {
  effectiveContext.modelName = session.goal_model; // e.g. 'posting'
}
```

This ensures the correct model-specific tools are provided (e.g. `categorizePostings` for posting sessions).

### Template Prompt Merging

If the session has a `template_id`:
```
finalSystemPrompt = template.system_prompt
                  + "\n\n---\n\n"
                  + baseAgentSystemPrompt
```

This is applied on every LLM call including auto-continuations, so the agent always has its expert brief.

### System Prompt Construction

The base system prompt is built from the user's accessible models (filtered by permissions), prompt type blocks (`analytics`, `reconciliation`, `default`), and the session context block (plan state, current step, accumulated context).

### Session Context Block

`buildSessionContextBlock(session, isFirstTurn, justCreatedPlan)` injects a structured block into the system prompt that tells the agent:
- What the current plan is (step titles, statuses, result summaries)
- Which step it is currently on
- What data was accumulated in previous steps (`accumulated_context`)
- What to do next

This is how the agent knows what happened in previous LLM calls even though those calls aren't in the message history.

### `onStepFinish` Callback

Both `generateText` and `streamText` receive an `onStepFinish` callback that fires after each tool-call round. This is where:
- `tool_called` SSE events are emitted for each tool call in the step
- `step_completed` SSE event is emitted with a preview of the result
- `generateSessionName` is triggered if `createPlan` was called

### Auto-Continuation

After each LLM call completes, if `shouldAutoContinue(session)` returns true and the step advanced:
```typescript
setImmediate(async () => {
  await agentService.handleRequest(
    `Continue with step ${nextStep.index + 1}: "${nextStep.title}". ${nextStep.description}`,
    auth, [], { modelName: session.goal_model }, sessionId
  );
});
```

`shouldAutoContinue` returns true when `session.status === 'executing'` and there are remaining plan steps.

**Loop prevention**: If the step index did not advance after an LLM call, auto-continuation is skipped with a warning. This prevents infinite loops when the agent fails to call `completeStep`.

---

## 4. Tool Registration

### `ToolManager.getUnifiedTools(modelName, auth, context, sessionId)`

This is called once per LLM invocation to build the complete tool set. It combines:

1. **Model-specific tools** from `getToolsForModel(modelName)`:

| Model | Tools |
|-------|-------|
| `default` | `searchRecords`, `advancedSqlQuery`, `extractInvoiceFromFile`, `createRecord` |
| `posting` | `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`, `suggestReconciliationMatches`, **`categorizePostings`** |
| `purchase_requisition` | Full CRUD + related model search + ERP connector |
| `invoice` | Invoice processing tools |
| `purchase_order` | Standard tools + ERP connector |

2. **Analytics tools** (always added): `getAnalyticsContext`, `analyticsQuery`

3. **Session tools** (added only when `sessionId` is set): `createPlan`, `completeStep`, `queueAction`, `queueActionBatch`

### The `categorizePostings` Tool

Specific to the `posting` model. When called with an `account_id`:
1. Fetches postings where the bank account is on one side and the counter-account is null
2. Passes posting IDs to `categorizeTransactionBatchHandler.execute(null, { posting_ids, options: { dry_run: true } }, {}, auth)`
3. Returns predictions with `posting_id`, `description`, `amount`, `value_date`, `predicted_account_id`, `predicted_account_name`, `confidence`, `confidence_score`, `reasoning`

The `null` connector is safe — `categorizeTransactionBatch` uses `prisma` directly, not the ERP connector.

---

## 5. Plan Creation and Step Execution

### `createPlan` Tool

The agent calls this on the first turn to decompose the goal into steps. Each step has:

```typescript
interface PlanStep {
  index: number;
  type: 'query' | 'analysis' | 'action' | 'report';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  requires_approval: boolean;
  result_summary?: string;
  completed_at?: string;
}
```

`createPlan` writes the plan to `agent_session.plan` and emits a `session_status_changed` event (`executing`). After `createPlan` completes (detected in `onStepFinish`), `generateSessionName` is called asynchronously.

### `completeStep` Tool

The agent calls this at the end of each step. Parameters:
- `step_index` — which step is being completed
- `result_summary` — what was found/done (stored in `plan[index].result_summary`)
- `accumulated_context_update` — key facts to carry forward (merged into `session.accumulated_context`)

After marking the step complete, `completeStep` runs the **hybrid dispatcher** (see Section 6).

The tool returns a structured response telling the agent which step comes next, enabling multi-step execution within a single LLM call (up to `maxSteps = 20`).

---

## 6. The Hybrid Dispatcher

Inside `completeStep`, after marking a step done, the dispatcher walks forward through the remaining plan steps trying to execute them without an LLM round-trip:

```typescript
while (cursor < plan.length) {
  const nextStep = plan[cursor];

  if (nextStep.type === 'action') {
    const builder = ActionBuilderRegistry.get(goal_model, nextStep, mergedContext);
    if (!builder) break; // → LLM handles this step
    // Run builder → create pending actions → awaiting_approval
  }

  if (nextStep.type === 'report') {
    const formatter = ReportFormatterRegistry.get(goal_model, nextStep, session);
    if (!formatter) break; // → LLM handles this step
    // Run formatter → write report → completed
  }

  // query/analysis steps always need the LLM
  break;
}
```

### Currently Registered Builders

**`ReconciliationActionBuilder`** — matches when:
- `goal_model === 'posting'`
- `step.type === 'action'`
- **`accumulated_context.match_results` is a non-empty array** ← critical condition

Creates one `reconcile_posting` pending action per posting with match suggestions. If `match_results` is absent, the builder does NOT claim the step — the LLM handles it instead.

> **Why this condition matters**: Before this fix, the builder claimed ALL action steps on the posting model. The categorise expenses flow's action step had no `match_results`, so the builder created 0 actions and the session slid to `completed` without ever calling `categorizePostings`. The context check prevents this.

### Currently Registered Formatters

**`ReconciliationReportFormatter`** — matches when:
- `goal_model === 'posting'`
- `step.type === 'report'`
- The plan has at least one action step (distinguishes action flows from pure analysis flows)

Produces a markdown summary of reconciliation results from `accumulated_context`.

### LLM Fallback

When no builder/formatter matches, the dispatcher `break`s. The session stays `executing` and auto-continuation fires the next LLM call. The agent then calls tools directly (e.g. `queueActionBatch` for categorise expenses).

---

## 7. Pending Actions and Approval

### Creation

Two tools create pending actions:

- **`queueAction`** — single action
- **`queueActionBatch`** — multiple actions in one call (preferred)

Both tools:
1. Write `pending_action` records to the DB
2. Increment `agent_session.pending_actions_count`
3. Emit `action_queued` and `inbox_count_changed` SSE events
4. The session transitions to `awaiting_approval` (set by `completeStep` or by the builder)

### Payload Convention

Each action type has its own payload shape. The executor for that type reads the payload on approval. Example for `categorize_transaction`:
```json
{
  "posting_id": "post_abc",
  "predicted_account_id": "acco_xyz",
  "predicted_account_name": "Office Expenses",
  "confidence_score": 0.87,
  "description": "Staples - office supplies",
  "amount": 4200.00,
  "value_date": "2024-03-15"
}
```

### Approval Flow

`POST /api/agent/pending-actions/:id/resolve` → `PendingActionService.resolvePendingAction`

1. Updates `pending_action.status`
2. If approved: runs the executor for the action type
3. On executor success: status → `executed`, writes `execution_result`
4. On executor failure: status stays `approved`, writes `execution_error`
5. Updates `agent_session.completed_actions_count`
6. Calls `checkAllPendingActionsResolved` — if count is 0, triggers session continuation

### Executor Registry

```typescript
const EXECUTORS: Record<string, PendingActionHandler> = {
  reconcile_posting:       ReconcilePostingExecutor,
  create_posting:          CreatePostingExecutor,
  categorize_transaction:  CategorizeTransactionExecutor,
  invoice_match:           PlaceholderExecutor,
  send_email:              PlaceholderExecutor,
  escalate_collection:     PlaceholderExecutor,
};
```

If no executor is registered, the action is still approved (status = `approved`) but no side effect runs. The `PlaceholderExecutor` logs the intent and returns success.

An executor is run if either `on_approve === 'execute_immediately'` **or** `PendingActionExecutor.hasExecutor(action_type)` — this prevents the LLM from blocking execution by accidentally setting `on_approve` to something other than `execute_immediately`.

---

## 8. SSE Event System

### Architecture

```
AgentService ──emits──▶ sessionEventBus (EventEmitter)
SessionService                  │
PendingActionService             │
sessionTools.ts                  ▼
                    route handler subscriber
                          │
                          ▼
                    GET /api/agent/sessions/:id/events
                          │ (SSE)
                          ▼
                       Browser
```

`sessionEventBus` is a singleton `EventEmitter` (class `SessionEventBusImpl`) shared across the entire Node.js process. It emits on two channels:
- `session:<sessionId>` — per-session events
- `org:<orgId>` — org-wide events (inbox count changes)

Max listeners set to 200 to avoid Node.js warnings with many concurrent SSE connections.

### SSE Endpoint Behaviour

`GET /api/agent/sessions/:id/events`:
1. Auth check + org_id verification
2. Set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`)
3. Send immediate `snapshot` event with current session state
4. Subscribe to `sessionEventBus.subscribeSession(sessionId, handler)`
5. Each event: write `data: ${JSON.stringify(event)}\n\n`
6. Heartbeat every 30 seconds
7. On `req.on('close')`: unsubscribe, clear heartbeat

### Event ID Format

`evt_${randomBytes(8).toString('hex')}` — generated by `SessionEventBusImpl.emitSessionEvent`. The `crypto` module is used instead of `uuid` to avoid `@types/uuid` issues.

---

## 9. Session Completion

A session completes when all plan steps are done AND all pending actions are resolved. There are two paths:

### Path A: Deterministic (no LLM call)

After the last pending action is resolved, `PendingActionService` checks for a pending report step with a registered formatter. If found:
1. Calls `formatter.format(accumulated_context, session)`
2. Writes the report as an `agent_message`
3. Sets `agent_session.status = 'completed'`
4. Emits `session_status_changed` SSE event

### Path B: Agent-driven (LLM call)

If no formatter matches but `shouldAutoContinue` returns true, the service:
1. Sets `agent_session.status = 'executing'`
2. Fires `setImmediate(() => agentService.handleRequest("All pending actions reviewed. Continue...", ...))`
3. The agent then executes remaining steps and eventually calls `completeStep` on the final step

### Path C: Direct completion

If no more steps remain and `shouldAutoContinue` returns false:
1. Sets `agent_session.status = 'completed'`
2. Emits SSE event

---

## 10. Key Files Reference

| File | Purpose |
|------|---------|
| `backend/src/agent/AgentService.ts` | Main agent loop — `handleRequest`, `handleStreamingRequest`, auto-continuation, event emission |
| `backend/src/agent/ToolManager.ts` | Tool set construction per model |
| `backend/src/agent/tools/categorizePostings.ts` | `categorizePostings` agent tool |
| `backend/src/agent/tools/sessionTools.ts` | `createPlan`, `completeStep`, `queueAction`, `queueActionBatch` tools + hybrid dispatcher |
| `backend/src/agent/builders/ActionBuilderRegistry.ts` | Registry of deterministic action builders |
| `backend/src/agent/builders/ReconciliationActionBuilder.ts` | Reconciliation action builder |
| `backend/src/agent/builders/ReportFormatterRegistry.ts` | Registry of deterministic report formatters |
| `backend/src/agent/services/SessionEventBus.ts` | Singleton in-process event bus |
| `backend/src/agent/services/SessionService.ts` | Session CRUD + event emission on status change |
| `backend/src/agent/services/PendingActionService.ts` | Pending action lifecycle + completion trigger |
| `backend/src/agent/executors/PendingActionExecutor.ts` | Executor registry + all executor implementations |
| `backend/src/agent/routes.ts` | All `/api/agent/*` routes including SSE endpoint |
| `backend/src/agent/prompt/constants.ts` | `buildSessionContextBlock`, `shouldAutoContinue` |
| `backend/prisma/seed-agent-templates.sql` | System template seed data |
| `backend/src/agent/__tests__/v2-create-posting-e2e.test.ts` | E2E test: book transactions |
| `backend/src/agent/__tests__/v2-categorise-expenses-e2e.test.ts` | E2E test: categorise expenses |

---

## 11. Sequence Diagrams

### Full Session (Categorise Expenses)

```
Browser         AgentService        DB              categorizePostings   sessionEventBus
  │                  │               │                     │                  │
  │──POST /sessions─▶│               │                     │                  │
  │                  │──create──────▶│                     │                  │
  │◀──session_id─────│               │                     │                  │
  │                  │               │                     │                  │
  │──POST /stream───▶│               │                     │                  │
  │                  │──streamText──▶[LLM]                 │                  │
  │                  │◀──createPlan──│                     │                  │
  │◀─────────────────│──emit step_started──────────────────────────────────▶ │
  │                  │──update plan─▶│                     │                  │
  │                  │◀──analyticsQuery (find account)     │                  │
  │                  │◀──categorizePostings─────────────▶ │                  │
  │                  │               │◀──fetch postings────│                  │
  │                  │               │◀──fetch accounts────│                  │
  │                  │               │◀──LLM predictions───│                  │
  │                  │◀──predictions──────────────────────│                  │
  │                  │◀──queueActionBatch──[creates pending_actions]          │
  │                  │──update session (awaiting_approval)▶│                  │
  │◀─────────────────│──emit action_queued (×N)───────────────────────────▶ │
  │◀─────────────────│──emit session_status_changed──────────────────────▶  │
  │◀─────────stream complete──────────                     │                  │
  │                  │               │                     │                  │
  │──GET /events────▶│               │                     │                  │
  │◀──snapshot───────│               │                     │                  │
  │                  │               │                     │                  │
  │──POST /resolve──▶│               │                     │                  │ (×N, each action)
  │    (approve)     │──executor────▶│ (update posting)    │                  │
  │                  │──check all resolved?─────────────▶ │                  │
  │                  │──session → completed──────────────▶│                  │
  │◀─────────────────│──emit session_status_changed──────────────────────▶  │
  │◀──SSE event──────│               │                     │                  │
```

### Auto-Continuation (Reconciliation Multi-Step)

```
LLM Call 1 (streaming):
  createPlan → step 0 in_progress → analyticsQuery → completeStep(0)
              ↓ [dispatcher: no builder for query step, break]
              ↓ [shouldAutoContinue → true, stepAdvanced → true]
              ↓ setImmediate(handleRequest("Continue step 1..."))

LLM Call 2 (non-streaming, setImmediate):
  suggestReconciliationMatches → completeStep(1, ..., { match_results: [...] })
              ↓ [dispatcher: ReconciliationActionBuilder.matches → true (match_results present)]
              ↓ [builder runs → creates reconcile_posting actions]
              ↓ [session → awaiting_approval]
              ↓ [dispatcher marks report step in_progress, breaks]

[User approves all actions]
  PendingActionService.resolvePendingAction (last action):
              ↓ [all resolved → check report step]
              ↓ [ReconciliationReportFormatter.matches → true]
              ↓ [formatter writes report]
              ↓ [session → completed]
```

---

## Known Limitations and Planned Improvements

| Issue | Current behaviour | Planned fix |
|-------|------------------|-------------|
| Agent asks for clarification mid-run | Session stalls in `executing`, auto-continuation eventually loops | `waiting_for_input` session state + reply endpoint |
| Message history on continuation | Only text messages saved; tool call/result pairs lost between LLM calls. Agent relies on `accumulated_context` and session context block instead | Store tool call messages in `agent_message` table |
| Provider errors on retry | If the first LLM call fails and auto-continues, accumulated messages can be malformed for some providers | Improve message history format on reload |
| In-process execution | `setImmediate` runs agent in same Node.js process. One slow agent can delay others | BullMQ + Redis worker queue |
| No crash recovery | If server restarts mid-session, sessions in `executing` stay stuck | Worker queue with job persistence |
