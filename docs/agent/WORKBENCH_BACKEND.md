# Fabriq Agent Workbench — Backend Reference

**Audience**: Backend developers onboarding to the workbench module
**Assumes**: Familiarity with Fabriq's core architecture (models, views, org_id, Prisma, Express)
**Last updated**: 2026-04-02 (Phase 4 + Phase 5 complete; action creation strategies documented)

---

## Table of Contents

1. [What Is the Workbench?](#1-what-is-the-workbench)
2. [A Session from the User's Point of View](#2-a-session-from-the-users-point-of-view)
3. [System Architecture Map](#3-system-architecture-map)
4. [Database Layer](#4-database-layer)
5. [HTTP Entry Points](#5-http-entry-points)
6. [The Agent Service — Core Orchestrator](#6-the-agent-service--core-orchestrator)
7. [How Prompts and Context Are Assembled](#7-how-prompts-and-context-are-assembled)
8. [Tools — Definition, Registration, and Execution](#8-tools--definition-registration-and-execution)
9. [Session State Machine](#9-session-state-machine)
10. [The Agent Loop and Auto-Continuation](#10-the-agent-loop-and-auto-continuation)
11. [Pending Actions — Lifecycle](#11-pending-actions--lifecycle)
12. [Real-Time Events — SessionEventBus and SSE](#12-real-time-events--sessioneventbus-and-sse)
13. [LLM Observability — Traces](#13-llm-observability--traces)
14. [Debugging Guide](#14-debugging-guide)
15. [Agent Template Management](#15-agent-template-management)
16. [Session Timeout Watchdog](#16-session-timeout-watchdog)
17. [File Index](#17-file-index)

---

## 1. What Is the Workbench?

The Workbench is Fabriq's AI-powered operations console. Unlike the standard views (which are CRUD screens for individual records), the Workbench lets a user describe a **goal in plain English** — such as "reconcile all unmatched HDFC transactions for March" — and delegates execution to an LLM-driven agent.

The agent:
- Breaks the goal into a plan of 3–5 steps
- Executes each step using tools (SQL queries, record lookups, ML predictions)
- Proposes financial actions (bookings, reconciliations, categorizations) as **pending actions** for human review
- Waits for approval, then executes the approved actions and writes results to the database

The Workbench is **not a chatbot**. Each session has a defined goal and a structured plan. The LLM is guided by precise directives at every turn.

---

## 2. A Session from the User's Point of View

Walking through a complete session helps explain every backend component in context.

### Step 1 — The user picks a template and types a goal

The frontend fetches available templates (`GET /api/agent/templates`) and shows them as cards — "Reconcile Transactions", "Categorise Expenses", etc. Each template has a `system_prompt` and a `user_hint` (placeholder text). The user selects one and types their goal into a text field.

### Step 2 — Session is created

`POST /api/agent/sessions` creates an `agent_session` record with:
- `goal` = what the user typed
- `status = 'planning'`
- `template_id` = chosen template
- `mode` = supervised / semi_auto / autonomous

### Step 3 — Frontend triggers the first agent call

Immediately after session creation, the frontend calls `POST /api/agent/chat/stream` with the goal and the new `session_id`. This is a streaming call — it returns an SSE stream so the frontend can show live activity.

### Step 4 — The agent assembles its context and calls the LLM

Before calling the LLM, the backend:
1. Loads the session from DB
2. Assembles the full system prompt (base guidelines + template prompt + session context block + SESSION_DIRECTIVE)
3. Loads session message history (empty on first turn)
4. Selects tools appropriate for the session's `goal_model`
5. Calls `streamText()` from the AI SDK

### Step 5 — The LLM calls `createPlan`

Because the `SESSION_DIRECTIVE` instructs the agent: *"IF status is 'planning' AND no plan exists → call createPlan IMMEDIATELY"*, the LLM's first tool call is always `createPlan`. The tool receives an array of step objects and writes them to `agent_session.plan`, setting status to `'executing'`.

### Step 6 — Auto-continuation drives the plan forward

After the `createPlan` call, `shouldAutoContinue()` checks: status is `'executing'` and a current step exists → true. The backend fires a recursive `handleRequest()` call, now with the next step's context injected into the prompt. The agent executes the step (running SQL, calling ML tools, etc.) and calls `completeStep` when done. This loop repeats for each step.

### Step 7 — Action steps create pending actions

When the current step type is `'action'`, the agent calls `queueActionBatch` (or the deterministic `ActionBuilderRegistry` handles it automatically). Each pending action is created in the `pending_action` table with a type, payload, confidence score, and `status = 'pending'`. The session transitions to `'awaiting_approval'`.

### Step 8 — The user reviews and approves

The frontend shows each pending action. The user approves or rejects. On approval, the backend runs the matching executor (e.g., `ReconcilePostingExecutor`, `CategorizeTransactionExecutor`) which writes the actual financial data to the database.

### Step 9 — Session completes

When all pending actions are resolved, the backend checks if a deterministic report formatter exists for this session type. If yes, it generates the report automatically. Otherwise, the agent is resumed for the `report` step, writes a plain-text summary, and calls `completeStep` → session status becomes `'completed'`.

Throughout the entire flow, **SSE events** stream to the frontend (step progress, tool calls, action queued, status changes) via `SessionEventBus`.

---

## 3. System Architecture Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│  GoalSetter → POST /sessions → POST /chat/stream → SSE listener            │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTP / SSE
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                           routes.ts  (Express)                               │
│  POST /chat/stream   POST /sessions   GET /sessions/:id/events              │
│  GET /sessions       POST /pending-actions/:id/resolve   GET /templates      │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                           AgentService.ts                                    │
│                                                                               │
│  handleStreamingRequest()         handleRequest()                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. createSystemPrompt()  →  DynamicPromptManager                   │    │
│  │  2. Load session + messages (if sessionId)                          │    │
│  │  3. buildSessionContextBlock() + SESSION_DIRECTIVE                  │    │
│  │  4. ToolManager.getUnifiedTools() → tools                           │    │
│  │  5. streamText() / generateText() with messages + tools             │    │
│  │  6. onStepFinish → emit events, persist messages                    │    │
│  │  7. shouldAutoContinue() → recursive handleRequest()                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└───────┬──────────────────┬─────────────────────────────┬────────────────────┘
        │                  │                              │
┌───────▼──────┐  ┌────────▼────────┐       ┌────────────▼──────────┐
│ ToolManager  │  │SessionEventBus  │       │  PendingActionService  │
│              │  │                 │       │                         │
│ Model tools  │  │ step_started    │       │  create / resolve       │
│ Analytics    │  │ tool_called     │       │  PendingActionExecutor  │
│ Session tools│  │ step_completed  │       │  (reconcile, create,    │
│ (createPlan, │  │ action_queued   │       │   categorize)           │
│  completeStep│  │ status_changed  │       └─────────────────────────┘
│  queueAction)│  └─────────────────┘
└──────────────┘
        │
┌───────▼────────────────────────────────────────────┐
│                    External LLM                      │
│   (Google Gemini / Anthropic via AI SDK)             │
│   Receives: system prompt + message history + tools  │
│   Returns: text + tool_calls (in steps)              │
└────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────┐
│                   PostgreSQL                         │
│  agent_session  agent_message  agent_template        │
│  pending_action  llm_trace  llm_trace_step           │
└────────────────────────────────────────────────────┘
```

---

## 4. Database Layer

All agent-related tables are defined in `backend/prisma/schema/data.prisma`.

### `agent_template`

Pre-defined task templates (seeded via SQL, not created by users). Each template drives a specific type of session.

| Column | Purpose |
|--------|---------|
| `id` | `atpl_...` prefix |
| `org_id` | Null = system template (available to all orgs) |
| `name` | Display name, e.g. "Reconcile Transactions" |
| `system_prompt` | Extra instructions prepended to the base prompt when this template is used |
| `user_hint` | Placeholder text in the GoalSetter input box |
| `goal_model` | Prisma model the agent should focus on, e.g. `posting` |
| `default_mode` | `supervised` / `semi_auto` / `autonomous` |
| `icon` | Lucide icon name for the UI card |

Templates are seeded in `backend/prisma/seed-agent-templates.sql`.

---

### `agent_session`

One row per user goal. The central record that tracks all session state.

| Column | Purpose |
|--------|---------|
| `id` | `ses_...` prefix |
| `goal` | Raw goal text typed by the user |
| `name` | Auto-generated 4–6 word title (set after `createPlan` fires) |
| `goal_model` | Inherited from template or inferred, e.g. `posting` |
| `template_id` | FK to `agent_template` |
| `plan` | JSON array of `PlanStep` objects (set by `createPlan`) |
| `status` | See [Session State Machine](#9-session-state-machine) |
| `current_step_index` | Zero-based index of the step the agent is working on |
| `accumulated_context` | JSON object passed between steps (e.g. `{match_results: [...]}`) |
| `pending_actions_count` | Total actions queued this session |
| `completed_actions_count` | Actions resolved (approved or rejected) |
| `mode` | `supervised` / `semi_auto` / `autonomous` |

**`accumulated_context` is critical**: it is how query step results flow into action steps. When step 1 finds 23 unmatched postings, it writes `{unmatched_count: 23, postings: [...]}` into `accumulated_context`. Step 3 (action step) reads it via the session context block injected into the prompt.

---

### `agent_message`

Every message exchanged within a session is persisted here — user messages, assistant responses, and tool call/result pairs.

| Column | Purpose |
|--------|---------|
| `role` | `user` / `assistant` / `tool` |
| `content` | Message text |
| `tool_calls` | JSON — `[{toolName, toolCallId, args}]` for assistant turns |
| `tool_results` | JSON — `[{toolCallId, toolName, result}]` for tool response turns |
| `step_index` | Which plan step this message was generated in |

These rows are the **session memory**. On each subsequent call, they are loaded and prepended to `allMessages` so the LLM has full context of prior steps.

---

### `pending_action`

One row per proposed financial action awaiting human review.

| Column | Purpose |
|--------|---------|
| `action_type` | e.g. `reconcile_posting`, `categorize_transaction`, `create_posting` |
| `payload` | JSON — action-specific parameters (posting IDs, predicted accounts, amounts) |
| `confidence` | `high` / `medium` / `low` |
| `confidence_score` | Float 0–1 |
| `status` | `pending` → `approved` / `rejected` → `executed` |
| `batch_id` | Groups related actions created in one `queueActionBatch` call |
| `on_approve` | `execute_immediately` — run executor right away on approval |
| `execution_result` | JSON result written by the executor after approval |
| `session_id` | FK to `agent_session` (nullable — actions can exist outside sessions) |

---

### `llm_trace` and `llm_trace_step`

Observability tables written after every LLM call.

`llm_trace` — one row per call to `generateText`/`streamText`:
- Tokens (prompt / completion / total)
- Duration
- Model name
- Tools called (array of tool names)
- Response text preview

`llm_trace_step` — one row per **step** within the call (the AI SDK can run multiple tool-call rounds before returning):
- Tool calls JSON: `[{toolName, args}]`
- Tool results JSON: `[{toolName, result_preview}]`
- SQL queries extracted from tool calls: `[{sql, description}]`

These are your primary debugging tool. See [Debugging Guide](#14-debugging-guide).

---

## 5. HTTP Entry Points

All routes are in `backend/src/agent/routes.ts`.

### Session management

| Method | Path | What it does |
|--------|------|-------------|
| `POST` | `/api/agent/sessions` | Create a new session. Body: `{goal, mode, goalModel, templateId}` |
| `GET` | `/api/agent/sessions` | List sessions for the current org |
| `GET` | `/api/agent/sessions/:id` | Get a single session with its pending actions |
| `GET` | `/api/agent/sessions/:id/events` | SSE stream — sends snapshot on connect, then live events |
| `GET` | `/api/agent/sessions/:id/trace` | Full audit trace (messages + LLM calls + actions) |
| `GET` | `/api/agent/messages` | Session messages, filtered by `session_id` |

### Agent invocation

| Method | Path | What it does |
|--------|------|-------------|
| `POST` | `/api/agent/chat` | Non-streaming agent call (used by tests) |
| `POST` | `/api/agent/chat/stream` | Streaming agent call (used by frontend). Returns SSE stream |

Both accept: `{message, context, sessionId, previousMessages?}`

### Pending actions

| Method | Path | What it does |
|--------|------|-------------|
| `POST` | `/api/agent/pending-actions/:id/resolve` | Approve or reject an action. Body: `{status, resolved_by, resolution_note, edited_payload?}` |
| `POST` | `/api/agent/pending-actions/bulk-approve` | Approve all high-confidence actions for a batch |
| `GET` | `/api/agent/pending-actions/paginated` | Paginated list with filters: `session_id`, `action_type`, `confidence`, `status` |

### Templates

| Method | Path | What it does |
|--------|------|-------------|
| `GET` | `/api/agent/templates` | List active templates (used by GoalSetter) |

---

## 6. The Agent Service — Core Orchestrator

**File**: `backend/src/agent/AgentService.ts`

`AgentService` is the single class responsible for preparing inputs, calling the LLM, handling tool calls, persisting results, and deciding whether to continue.

It has three entry points:

### `handleStreamingRequest()`
Used by the frontend. Returns a `ReadableStream` (SSE-compatible). The LLM response tokens are streamed back in real time. Tool executions happen during the stream.

### `handleRequest()`
Used by tests and by the auto-continuation loop internally. Returns a plain object with the full result after the LLM finishes. Not streamed.

### `handleRequestViaStreaming()`
Internal adapter that runs `streamText` but awaits it to completion, returning the same shape as `handleRequest`. Exists for compatibility.

### Inside each call

Both `handleStreamingRequest` and `handleRequest` share the same setup logic:

```
1. prepareRequestSetup()
   └─ Get accessible models
   └─ Process message (convert base64 file attachments to Uint8Array)
   └─ Call createSystemPrompt() → full system prompt string

2. If sessionId present:
   └─ Load session from DB
   └─ Load last 50 agent_messages
   └─ Determine isFirstTurn (no messages yet) and justCreatedPlan
   └─ Build session context block → appended to system prompt
   └─ Emit 'step_started' event via SessionEventBus

3. ToolManager.getUnifiedTools()
   └─ Returns tool set for this session's goal_model + analytics + session tools

4. Build allMessages array
   └─ [system message, ...session message history, current user message]

5. Call streamText() / generateText()
   └─ model, messages (allMessages), tools, maxSteps, onStepFinish

6. onStepFinish callback (fires after each LLM step)
   └─ Emit tool_called, step_completed events
   └─ Trigger session name generation if createPlan just fired

7. After completion (onFinish / after await):
   └─ Persist all messages to agent_message table
   └─ Log llm_trace + llm_trace_step records
   └─ Check shouldAutoContinue() → if true, call handleRequest() recursively
```

### Key variable: `allMessages`

This is what the LLM actually sees. It is an array of AI SDK message objects:

```
[
  { role: 'system', content: '<full system prompt>' },
  { role: 'user',   content: '<step 1 user turn>' },
  { role: 'assistant', content: [...tool calls from step 1...] },
  { role: 'tool',   content: [...tool results from step 1...] },
  { role: 'assistant', content: 'Step 1 complete.' },
  { role: 'user',   content: '<step 2 continuation prompt>' },   ← current turn
]
```

The session message history (from `agent_message`) is converted back into AI SDK format before being added to `allMessages`. This is why `agent_message.tool_calls` and `agent_message.tool_results` store the raw JSON from the AI SDK — they are replayed verbatim on subsequent calls.

---

## 7. How Prompts and Context Are Assembled

This is the area most developers find confusing, because there is no single "prompt string" — it is built up from four separate layers that merge at request time.

### Layer 1 — Base system prompt from `DynamicPromptManager`

**File**: `backend/src/agent/prompt/DynamicPromptManager.ts`

`DynamicPromptManager` fetches `prompt_template` records from the database (filtered by view and model), merges them by priority, and substitutes placeholders:

- `{{org_id}}` → user's org
- `{{user_id}}` → user's ID
- `{{accessibleModels}}` → human-readable list of all models the user can access + their descriptions

The base prompt covers global agent rules: how to handle structured data responses, ID display restrictions, tool response formatting guidelines. These come from `TOOL_RESPONSE_HANDLING_GUIDELINE` in `backend/src/agent/prompt/constants.ts`.

### Layer 2 — Template system prompt

When a session has a `template_id`, `AgentService` loads the template and **prepends** `template.system_prompt` to the base system prompt. Template prompts are task-specific. For example, the "Reconcile Transactions" template prompt explains Fabriq's double-entry model, describes what "matched" means, and instructs the agent to use broad keyword search for account names rather than exact matches.

Template prompts are stored in the database and can be edited without a code deploy.

### Layer 3 — Session context block

**Function**: `buildSessionContextBlock()` in `backend/src/agent/prompt/constants.ts`

On every turn inside a session, this block is appended to the system prompt:

```
## Active Session Context
Goal: Reconcile all unmatched HDFC transactions for March
Mode: supervised
Status: executing — Step 2 of 4: Suggest matches
Pending actions: 0 awaiting review
Accumulated: {"unmatched_count": 23, "hdfc_account_id": "acc_..."}

## Full Plan    ← only on first turn or after createPlan
[{"index":0,"type":"query","title":"Find unmatched postings",...}, ...]
```

The `accumulated_context` JSON is how earlier steps pass data to later ones. A query step stores its results here; the action step reads them. Without this, the LLM would have no data to act on in the action step.

On the **first turn** or immediately **after `createPlan` is called**, the full plan JSON is included. On subsequent turns, only the header is shown (saves tokens).

### Layer 4 — SESSION_DIRECTIVE

`SESSION_DIRECTIVE` (in `backend/src/agent/prompt/constants.ts`) is always appended after the session context block. It is a decision tree that tells the LLM exactly what to do based on the current `status` and `current step type`:

- `planning` + no plan → call `createPlan` immediately
- `executing` + `query` step → use tools, call `completeStep` with result_summary
- `executing` + `analysis` step → run analysis tools, pass full structured output in `accumulated_context_update`
- `executing` + `action` step → call `queueActionBatch` (unless dispatcher handled it)
- `executing` + `report` step → write summary, call `completeStep`

This directive is what keeps the agent on-track. Without it, the LLM would wander.

### How it all fits together

```
Final system prompt =
  [template.system_prompt]       ← task-specific instructions
  +
  [base prompt from DB templates]  ← global rules + model descriptions
  +
  [session context block]          ← current status, plan, accumulated data
  +
  [SESSION_DIRECTIVE]              ← exact behavioral decision tree
```

This final string is the `content` of the first element in `allMessages` (role: `system`).

---

## 8. Tools — Definition, Registration, and Execution

### What is a tool?

In the AI SDK, a tool is a function that the LLM can call. The LLM sees the tool's name, description, and JSON schema for its parameters. The LLM outputs a `tool_call` with the tool name and arguments; the SDK executes the tool and returns the result to the LLM as a `tool_result`. This round-trip is one "step".

### Tool categories

**Model-specific tools** (CRUD and search for business data):
Registered per `goal_model` in `ToolManager.getToolsForModel()`.
File: `backend/src/agent/AgentTools.ts`

Examples: `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`, `processInvoiceFromPdf`

The `posting` model also gets: `suggestReconciliationMatches`, `categorizePostings`

**Analytics tools** (always available):
File: `backend/src/agent/tools/analyticsQuery.ts` and `analyticsContext.ts`

- `getAnalyticsContext` — Returns the org's accessible models, workflow states, and multi-tenancy rules. The LLM should call this before writing complex SQL.
- `analyticsQuery` — Executes a read-only SQL query with org_id enforcement. Returns rows with column metadata and currency detection.

**Session tools** (only when `sessionId` is present):
File: `backend/src/agent/tools/sessionTools.ts`

- `createPlan` — Receives an array of steps, writes to `agent_session.plan`, sets status to `executing`
- `completeStep` — Marks the current step complete, advances `current_step_index`, stores `result_summary` and `accumulated_context_update` into the session
- `queueAction` — Creates a single `pending_action` record
- `queueActionBatch` — Creates multiple `pending_action` records in one call, with a shared `batch_id`

### How tools are selected and passed to the LLM

**File**: `backend/src/agent/ToolManager.ts`, method `getUnifiedTools()`

```
getUnifiedTools(modelName, auth, context, sessionId)
  → model-specific tools for modelName
  + analyticsQuery + getAnalyticsContext
  + [createPlan, completeStep, queueAction, queueActionBatch] if sessionId present
```

All tools are passed as a single flat object to the AI SDK. **The LLM receives all tools simultaneously and decides which to use** — there is no pre-routing.

### Tool execution

Each tool factory function returns an AI SDK `tool()` object with:
- `description` — what the LLM reads to decide when to use it
- `parameters` — Zod schema validated before execution
- `execute` — async function that runs the actual logic

Tools receive `AuthContext` (which contains `org_id`) so they can enforce multi-tenancy. `analyticsQuery` validates that the SQL is read-only and that the `org_id` filter is present.

### The `categorizePostings` tool (special case)

**File**: `backend/src/agent/tools/categorizePostings.ts`

This tool does **not write to the database**. It:
1. Queries postings where the counter-account is null (uncategorized)
2. Calls the AI categorizer in `dry_run: true` mode
3. Returns structured predictions: posting details + predicted account + confidence + reasoning

The agent then uses these predictions to call `queueActionBatch`, creating one `categorize_transaction` pending action per prediction. The actual categorization write happens in `CategorizeTransactionExecutor` only after the user approves.

---

## 9. Session State Machine

```
              ┌──────────────┐
              │   planning   │  ← initial state on session create
              └──────┬───────┘
                     │ createPlan tool called
                     ▼
              ┌──────────────┐
              │  executing   │  ← agent works through steps
              └──────┬───────┘
                     │ action step: pending_actions_count > completed_actions_count
                     ▼
         ┌───────────────────────┐
         │   awaiting_approval   │  ← human reviews actions
         └───────────┬───────────┘
                     │ all actions resolved
                     ▼
              ┌──────────────┐   ← auto-continue resumes agent
              │  executing   │      (or deterministic formatter runs)
              └──────┬───────┘
                     │ last step (report) completed
                     ▼
              ┌──────────────┐
              │  completed   │
              └──────────────┘

              ┌──────────────┐   ← any state on unrecoverable error
              │    failed    │
              └──────────────┘
```

State transitions are managed in:
- `sessionTools.ts` — `createPlan` sets `executing`; `completeStep` may set `awaiting_approval`
- `PendingActionService.resolvePendingAction()` — checks if all actions resolved → resumes executing or sets completed
- `SessionService.updateAgentSession()` — direct status writes

Status changes emit `session_status_changed` events on `SessionEventBus`.

---

## 10. The Agent Loop and Auto-Continuation

The LLM is **stateless**. Between steps, the backend is responsible for:
1. Persisting what happened (messages, plan, accumulated_context)
2. Deciding whether to continue
3. Building the next prompt with updated context

### How continuation works

After `generateText` / `streamText` resolves:

```typescript
// backend/src/agent/AgentService.ts (within onFinish / post-await)

const updatedSession = await getAgentSession(sessionId);
const stepAdvanced = updatedSession.current_step_index !== session.current_step_index;

if (shouldAutoContinue(updatedSession) && stepAdvanced) {
  // Build a continuation user message and call handleRequest recursively
  const continuationMsg = `Continue with step ${updatedSession.current_step_index + 1}: ...`;
  await this.handleRequest(continuationMsg, auth, [], context, sessionId);
}
```

`shouldAutoContinue()` returns `true` when `status === 'executing'` and a current step exists. It returns `false` when status is `awaiting_approval` or `completed`.

The `stepAdvanced` guard prevents infinite loops: if `completeStep` was not called (no step index change), auto-continuation does not fire.

### Why the loop pauses at action steps

When the agent calls `queueActionBatch`, `completeStep` inside `sessionTools.ts` checks:
```
pending_actions_count > completed_actions_count → status = 'awaiting_approval'
```

`shouldAutoContinue()` then returns `false` (status is not `executing`), so the loop pauses. It resumes only when `PendingActionService.resolvePendingAction()` detects all actions are resolved and transitions status back to `executing`.

### Action Creation — Two Strategies

When a session reaches an action step, pending actions must be created for human review. There are two fundamentally different strategies for creating these actions, and the choice between them reflects a deliberate design trade-off between **reliability** and **flexibility**.

#### Strategy 1 — Deterministic Builder (backend creates actions from structured data)

**Used by**: Reconciliation (`atpl_reconcile`)
**Files**: `builders/ActionBuilderRegistry.ts`, `builders/ReconciliationActionBuilder.ts`

In this strategy, the LLM never decides what actions to create. Instead:

1. During an earlier analysis step, the LLM calls a tool that returns structured results (e.g., `suggestReconciliationMatches` returns match suggestions per posting)
2. The tool stores those results in `accumulated_context` via `completeStep({ accumulated_context_update })`
3. When `completeStep` fires for the action step, the backend checks `ActionBuilderRegistry.get(goal_model, step, accumulated_context)`
4. If a builder matches, it reads the structured data from `accumulated_context` and creates pending actions **directly** — the LLM is never called for this step

```
suggestReconciliationMatches → accumulated_context.match_results
                                         ↓
                          completeStep (action step)
                                         ↓
                    ReconciliationActionBuilder.matches() → true
                                         ↓
                    ReconciliationActionBuilder.build()
                      reads match_results, creates pending_action rows
                                         ↓
                           session → awaiting_approval
```

**How the builder decides what to create**: `ReconciliationActionBuilder.build()` iterates through `match_results` (an array of postings with their best match suggestions). For each posting that has at least one suggestion, it creates a pending action with `action_type: 'reconcile_posting'`. The payload contains `posting_id`, `match_type`, `match_id`, `match_reference`, and a preview of both sides of the match. The confidence score is copied from the suggestion's confidence level.

The builder is pure data transformation — no LLM call, no network request, no nondeterminism. The `matches()` method self-selects based on whether `match_results` exists in the accumulated context, so it doesn't greedily intercept unrelated action steps (e.g., categorization).

**Why this works for reconciliation**: The matching logic is fully deterministic (amount matching, reference extraction, date proximity scoring). Once the tool returns structured suggestions, there is exactly one correct way to turn them into pending actions. There is no judgement call for the LLM to make.

Similarly, `ReportFormatterRegistry` can generate the final report deterministically from step summaries, skipping the LLM's report step entirely.

#### Strategy 2 — LLM-Driven Queuing (the LLM decides what actions to create)

**Used by**: Categorization (`atpl_categorise`)
**Files**: `tools/categorizePostings.ts`, `tools/sessionTools.ts` (`queueActionBatchTool`)

In this strategy, the LLM receives structured data from a tool, interprets it, and decides which actions to queue:

1. During an analysis step, the LLM calls `categorizePostings(account_id)`, which runs AI categorization in **dry-run mode** — no database writes, only predictions returned
2. The tool returns an array of predictions: `{ posting_id, predicted_account_id, confidence_score, reasoning }`
3. The LLM receives these predictions as a tool result and **itself decides** to call `queueActionBatch` with `action_type: 'categorize_transaction'`
4. The LLM constructs each action's `payload` from the prediction data, sets the title and confidence, and chooses `on_approve: 'execute_immediately'`

```
categorizePostings(account_id)
  → runs AI categorizer in dry_run=true mode
  → returns predictions[] to LLM
                    ↓
        LLM reads predictions, calls:
        queueActionBatch({
          action_type: 'categorize_transaction',
          actions: [{
            title: "Categorise AMAZON BUSINESS → Office Supplies",
            payload: { posting_id, predicted_account_id, confidence_score },
            confidence: 'high'
          }, ...]
        })
                    ↓
        queueActionBatchTool creates pending_action rows
                    ↓
        session → awaiting_approval
```

**Why the LLM is involved here**: Categorization predictions come from an AI model and may need filtering, grouping, or context-dependent decisions. The LLM can:
- Skip predictions it considers unreliable based on the reasoning field
- Adjust confidence labels based on the overall pattern it sees
- Group actions meaningfully for the user (e.g., by category or date range)
- Write human-readable titles and descriptions that summarise the prediction

The template's system prompt instructs the LLM to call `queueActionBatch` after receiving categorization results, but the LLM has discretion over how to construct each action.

#### The dry-run pattern

Both strategies depend on a common principle: **the analysis tool does not write to the database**.

| Tool | What it returns | Writes to DB? |
|------|-----------------|---------------|
| `suggestReconciliationMatches` | Match suggestions with confidence scores | No |
| `categorizePostings` | Predictions with confidence scores | No (`dry_run: true`) |

Database writes happen **only** in the executor, **only** after human approval. This is what makes the pending action / approval workflow trustworthy — the user reviews a proposal before anything changes.

#### When to choose which strategy

| | Deterministic Builder | LLM-Driven |
|---|---|---|
| **Use when** | The tool output maps 1:1 to pending actions with no interpretation needed | The tool output needs filtering, judgement, or presentation decisions |
| **Reliability** | Guaranteed — no LLM variability, no risk of skipped actions | Depends on prompt quality — the LLM might skip `queueActionBatch` or format payloads incorrectly |
| **LLM cost** | Saves one full LLM round-trip per action step | Costs one extra LLM turn to interpret results and create actions |
| **Flexibility** | Fixed logic — adding new payload fields requires a code change | The LLM can adapt to new data shapes without code changes |
| **Example** | Reconciliation: structured matches → structured actions | Categorization: AI predictions → human-readable action proposals |

#### The shared execution layer

Regardless of how a pending action was created (builder or LLM), the executor that runs on approval is **identical**. The executor reads the `payload` JSONB field and doesn't know or care whether a builder or the LLM wrote it. This decoupling is intentional — it means you can switch a template from LLM-driven to builder-driven (or vice versa) without changing the executor.

---

## 11. Pending Actions — Lifecycle

### The Payload as Contract

A pending action's `payload` is a **self-contained instruction**. It stores everything the executor needs to perform the action at approval time, with no need to re-run any AI or re-query any data. The payload is written once (at creation) and read once (at execution).

This is the contract between action creation and action execution:

| Action type | Payload fields | Who writes the payload | Who reads it |
|-------------|---------------|----------------------|--------------|
| `reconcile_posting` | `posting_id`, `match_type`, `match_id`, `match_reference`, `confidence_detail`, `preview` | `ReconciliationActionBuilder` | `ReconcilePostingExecutor` |
| `categorize_transaction` | `posting_id`, `predicted_account_id`, `predicted_account_name`, `confidence_score` | LLM via `queueActionBatch` | `CategorizeTransactionExecutor` |
| `create_posting` | Full posting fields (`description`, `amount`, `account_id`, etc.) | LLM via `queueAction` | `CreatePostingExecutor` |

Because the payload captures a snapshot of the prediction at queue time, the executor doesn't need to call the AI model again. Approval is a fast, deterministic database write.

### Creation

Actions are created by one of two paths:

1. **Deterministic builder** — `ActionBuilderRegistry` intercepts `completeStep` on an action step and calls `createPendingActionBatch` directly (see section 10 above)
2. **LLM tool call** — the LLM calls `queueActionBatch` (or `queueAction`), which calls `createPendingActionBatch` in `sessionTools.ts`

Both paths create `pending_action` records and emit:
- `action_queued` — once per action
- `inbox_count_changed` — after the batch, with the new total

### Resolution

`POST /api/agent/pending-actions/:id/resolve` calls `PendingActionService.resolvePendingAction()`:

1. Update `pending_action` record: status, resolved_by, resolved_at, resolution_note
2. If approved (`approved` or `approved_with_edits`):
   - Look up executor for `action_type` in `PendingActionExecutor` registry
   - Call `executor.execute(action, auth)` — reads the payload and writes to the database
   - Store `execution_result` or `execution_error` on the record
3. Increment `session.completed_actions_count`
4. Check: `completed_actions_count >= pending_actions_count`?
   - If yes, check for deterministic report formatter → generate + complete
   - Or check `shouldAutoContinue` → resume agent
   - Or mark session `completed`

### Executors

**File**: `backend/src/agent/executors/PendingActionExecutor.ts`

Each executor is a simple object registered by `action_type`:

| Action type | What the executor does |
|-------------|----------------------|
| `reconcile_posting` | Writes `matched_reference` to the posting, calls `confirmReconciliation()` to create payment receipt and set `reconciliation_status: 'MATCHED'` |
| `create_posting` | Creates a `posting` record with `status: 'booked'` |
| `categorize_transaction` | Determines money direction via `determineTransactionDirection()`, calls `updatePostingWithCategorization()` to set the counter-account |

Executors run **only on approval** — rejected actions do nothing. Executors are **stateless** — they depend only on the payload and auth context, never on session state or prior LLM output.

---

## 12. Real-Time Events — SessionEventBus and SSE

### SessionEventBus

**File**: `backend/src/agent/services/SessionEventBus.ts`

A singleton `EventEmitter` used as an in-process message bus. When `AgentService` emits an event, the SSE route handler picks it up and forwards it to the connected client.

Events have this shape:
```json
{
  "id": "evt_...",
  "sessionId": "ses_...",
  "orgId": "org_...",
  "type": "tool_called",
  "timestamp": "2026-03-31T10:23:45.123Z",
  "data": {
    "tool_name": "analyticsQuery",
    "step_index": 1,
    "args_preview": "{\"query\":\"SELECT account_id, sum(amount)...\"}"
  }
}
```

### Event types

| Event | Emitted from | When |
|-------|-------------|------|
| `snapshot` | SSE route handler | Immediately on SSE connect (full session state) |
| `step_started` | `AgentService` | Before each LLM call |
| `tool_called` | `AgentService.onStepFinish` | After each LLM step, once per tool called |
| `step_completed` | `AgentService.onStepFinish` | After each LLM step |
| `session_status_changed` | `SessionService.updateAgentSession` | When status field changes |
| `action_queued` | `sessionTools.ts` | When a pending action is created |
| `inbox_count_changed` | `sessionTools.ts` | After a batch of actions is queued |
| `heartbeat` | SSE route handler | Every 30 seconds (connection keepalive) |

### SSE endpoint

`GET /api/agent/sessions/:id/events` in `routes.ts`:

1. Verifies session belongs to the requesting org
2. Calls `getSessionTrace(sessionId)` and sends the result as an immediate `snapshot` event
3. Subscribes to `sessionEventBus` on channel `session:{sessionId}`
4. Forwards every event as `data: {JSON}\n\n`
5. Sends heartbeat every 30s
6. Cleans up listener on client disconnect

---

## 13. LLM Observability — Traces

Every call to `generateText` or `streamText` (whether or not it is inside a session) is logged to `llm_trace` and `llm_trace_step`. This is written in `AgentService` after the call completes.

To see what the LLM actually received and returned, query these tables:

```sql
-- Find traces for a session
SELECT id, created_at, llm_model, prompt_tokens, completion_tokens,
       duration_ms, status, tools_called
FROM llm_trace
WHERE session_id = 'ses_...'
ORDER BY created_at;

-- See each step within a trace
SELECT step_number, tool_calls, tool_results, sql_queries, response_text
FROM llm_trace_step
WHERE trace_id = 'llmt_...'
ORDER BY step_number;
```

The `SessionTraceService` (`backend/src/agent/services/SessionTraceService.ts`) aggregates all of this into a single response at `GET /api/agent/sessions/:id/trace`. Use this endpoint to get a complete chronological picture of a session.

---

## 14. Debugging Guide

### Problem: Session stuck in `planning` (LLM never calls `createPlan`)

**Cause**: The system prompt did not reach the LLM, or `SESSION_DIRECTIVE` was missing. Check that `allMessages[0].role === 'system'` has both the session context block and the `SESSION_DIRECTIVE` text. In `handleStreamingRequest`, the `messages` parameter passed to `streamText` should be `allMessages` (which already includes the system message as the first element) — **not** a separate `system:` parameter alongside a different `messages` array.

**Check**: Query `llm_trace` for the session. If `prompt_tokens` is very low (< 1000), the system prompt was stripped. If `tools_called` is empty, the session tools were not registered — verify `sessionId` was passed through correctly.

---

### Problem: Action step completes but no pending actions are created

**Cause**: The `ActionBuilderRegistry` matched and ran a builder (deterministic path), but the builder found no data in `accumulated_context`. Or the builder's `matches()` method returned `true` incorrectly.

**Check**: Look at `agent_session.accumulated_context` after the analysis step. If it is empty or missing the expected key (e.g., `match_results`), the analysis step did not write its output correctly — the LLM may have omitted it from `accumulated_context_update` in its `completeStep` call. The analysis step's `SESSION_DIRECTIVE` says: *"pass the FULL structured tool output in `accumulated_context_update` under a descriptive key"* — if this is not happening, the template's system prompt may need a stronger instruction.

**File to check**: `backend/src/agent/builders/ActionBuilderRegistry.ts` — the `matches()` method should only return `true` when `accumulated_context` has the required data.

---

### Problem: Auto-continuation fires indefinitely / session loops

**Cause**: `completeStep` is being called but the step index is not advancing. Check `sessionTools.ts` — `completeStep` increments `current_step_index` in the DB. If it threw an error mid-execution, the index may not have been written.

**Check**: The `stepAdvanced` guard in `AgentService` prevents infinite loops — continuation only fires when `updatedSession.current_step_index !== session.current_step_index`. If the session is looping, one of the two index reads must be returning stale data.

---

### Problem: Bulk approve doesn't execute the actions

**Cause**: The old `bulkApproveByConfidence` implementation used `prisma.pending_action.updateMany` which bypasses the executor registry. Executors only run when `resolvePendingAction()` is called per-action.

**Fix**: `PendingActionService.bulkApproveByConfidence` iterates and calls `resolvePendingAction` for each matching action.

---

### Problem: "How do I see what prompt the LLM received?"

There is no direct log of the full assembled prompt, but you can reconstruct it:

1. Query `llm_trace` for `prompt_tokens` to see how many tokens were sent
2. Query `agent_message` where `session_id = '...'` and `role = 'user'` ordered by `created_at` — these are the user turns the LLM received
3. Call `GET /api/agent/sessions/:id/trace` for the full assembled timeline
4. To see the exact system prompt: add a temporary `console.log(allMessages[0].content)` in `AgentService` around line 228/640 (inside the session branch of `allMessages` construction)

The system prompt is **never stored to the database** — it is assembled fresh on every request. This is by design (template prompts can be updated without migrating stored data).

---

### Problem: Tool results are not in the LLM's next response

The LLM sees tool results because they are included in `allMessages` as `tool` role messages. If the LLM appears to ignore tool results:

1. Check `agent_message` — are the `tool_results` JSON being written correctly after the call?
2. Check `llm_trace_step.tool_results` — is the result preview there?
3. Some tool results are very large (e.g., full SQL result sets). If the result exceeds token limits, the LLM may truncate its processing. `analyticsQuery` returns a row limit and column metadata to mitigate this.

---

### Useful SQL for debugging sessions

```sql
-- Full session state
SELECT id, goal, status, current_step_index, plan, accumulated_context,
       pending_actions_count, completed_actions_count, mode
FROM agent_session
WHERE id = 'ses_...';

-- All messages in order
SELECT role, content, tool_calls, tool_results, step_index, created_at
FROM agent_message
WHERE session_id = 'ses_...'
ORDER BY created_at;

-- Pending actions and their outcomes
SELECT action_type, confidence, status, payload, execution_result, execution_error
FROM pending_action
WHERE session_id = 'ses_...'
ORDER BY created_at;

-- LLM traces for the session
SELECT id, created_at, prompt_tokens, completion_tokens, duration_ms,
       tools_called, status, error_message
FROM llm_trace
WHERE session_id = 'ses_...'
ORDER BY created_at;

-- Steps within a trace
SELECT step_number, tool_calls, tool_results, sql_queries, response_text
FROM llm_trace_step
WHERE trace_id = 'llmt_...'
ORDER BY step_number;
```

---

## 15. Agent Template Management

Templates are the pre-defined task types shown to users in the GoalSetter (e.g. "Reconcile Transactions", "Categorise Expenses"). There are two audiences with different access patterns:

- **The agent runtime** — reads active templates at session-start to merge the `system_prompt` into the assembled prompt. Uses `GET /api/agent/templates` (active-only, no auth beyond org).
- **Super Admins** — create, edit, deactivate, and delete templates via the Settings UI. Uses a separate set of admin endpoints.

### Admin API endpoints

All under `/api/agent/admin/templates`, defined in `backend/src/agent/routes.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/templates` | List all templates (active + inactive) |
| `GET` | `/admin/templates/:id` | Fetch single template by ID (used by edit form) |
| `POST` | `/admin/templates` | Create template. `org_id` is always set to `null` (system template, visible to all orgs) |
| `PUT` | `/admin/templates/:id` | Partial update — only fields present in the request body are changed |
| `DELETE` | `/admin/templates/:id` | Hard delete |

All admin routes require `authMiddleware`. They do **not** enforce a Super Admin role check in the backend — access is controlled by the frontend routing guard and the `allowedRoles: ['Super Admin']` sidebar restriction.

### Template fields

| Field | Type | Purpose |
|-------|------|---------|
| `name` | String | Display name on the GoalSetter card |
| `description` | String | One-sentence card subtitle |
| `icon` | String | Lucide icon name (e.g. `tag`, `arrow-right-left`) |
| `goal_model` | String? | Prisma model the agent focuses on — determines which tools are registered. `null` = general purpose |
| `system_prompt` | Text | Prepended to the base system prompt for every session using this template. Describes the task, which tools to use, and domain rules |
| `user_hint` | String | Placeholder text shown in the GoalSetter goal input box |
| `default_mode` | String | `supervised` / `semi_auto` / `autonomous` |
| `is_active` | Boolean | `false` = hidden in GoalSetter, still visible in admin UI |
| `sort_order` | Int | Display order in GoalSetter (lower = first) |
| `org_id` | String? | `null` = system template available to all orgs |

### How `system_prompt` is merged at runtime

When a session has a `template_id`, `AgentService` loads the template before assembling the prompt and prepends `template.system_prompt` to the base system prompt from `DynamicPromptManager`. The merged prompt is never stored — it is re-assembled on every request. This means editing a template's `system_prompt` takes effect immediately for all new LLM calls in sessions using that template.

See [Section 7](#7-how-prompts-and-context-are-assembled) for the full prompt assembly sequence.

### Frontend: Settings → AI Templates

The admin UI lives at `/settings/ai-templates` (sidebar label: **AI Templates**), accessible only to Super Admins.

**Two tabs on the same page:**

**Prompt Templates tab** — the existing metadata-driven `Master` component for `prompt_template`. Uses the standard view/permissions/CRUD path — unchanged from before.

**Agent Templates tab** — a custom list and form that talk directly to the admin API above, bypassing the metadata-driven system (agent_template has no view configured in the metadata tables).

| Frontend file | Purpose |
|---------------|---------|
| `frontend-1/src/pages/settings/AITemplatesPage.tsx` | Tabbed container. Tab state persists in URL (`?tab=prompt` / `?tab=agent`). Both `/settings/ai-templates` and the legacy `/settings/prompt-templates` URL route here |
| `frontend-1/src/components/forms/Masters/AgentTemplatesList.tsx` | Inline table: name, description, goal model, mode badge, active indicator, sort order. Edit/delete per row |
| `frontend-1/src/components/forms/Masters/AgentTemplateForm.tsx` | Create/edit form. `system_prompt` uses `CodeEditor` (Monaco, plaintext). Routes: `/settings/agent-templates/new` and `/settings/agent-templates/:id/edit` |

### Seeding system templates

System templates are not seeded via Prisma migrations — they are inserted directly via SQL or through the admin UI. To add a new template for a new task type:

1. Open **Settings → AI Templates → Agent Templates tab**
2. Click **New Agent Template**
3. Fill in all fields. For `system_prompt`, follow the pattern from existing templates:
   - Describe what "uncategorized" or "unmatched" means for this task
   - Name the tools the agent should use and in what order
   - Include broad-search tips (e.g. `ILIKE '%keyword%'`)
   - Remind the agent to always queue actions, never write directly
4. Set `is_active = true` and `sort_order` to control position in GoalSetter
5. The template is live immediately — no restart needed

---

## 16. Session Timeout Watchdog

### The Problem It Solves

The agent loop runs entirely server-side. If the LLM gets stuck — returns a plain-text response instead of calling `completeStep`, hits a rate-limit error, or simply hangs — the session stays in `planning` or `executing` forever. There is no client watchdog (the frontend just reconnects via SSE), and the `setImmediate` auto-continuation never fires again. The session is a zombie.

### Design

**File**: `backend/src/agent/services/SessionTimeoutService.ts`

`SessionTimeoutService` is a singleton that maintains one `NodeJS.Timeout` per active session in a `Map<sessionId, Timeout>`. The timer counts wall-clock time against the current *running* period only — time spent waiting for human approval (`awaiting_approval`) does not count.

```
arm(sessionId)    → sets / resets the timer
cancel(sessionId) → clears the timer (no-op if none exists)
```

When the timer fires, it:
1. Re-fetches the session to confirm it is still `planning` or `executing`
2. Updates status to `failed`, sets `completed_at`
3. Emits `session_status_changed` on `SessionEventBus` — the frontend SSE client receives it and transitions the UI to the failed state immediately

### Where It's Wired

| Location | Action | Reason |
|----------|--------|--------|
| `AgentService.handleRequest` — top of try block | `arm(sessionId)` | Every non-streaming agent turn starts fresh; resets the clock |
| `AgentService.handleStreamingRequest` — top of try block | `arm(sessionId)` | Same for the streaming path used by the frontend |
| `SessionService.updateAgentSession` — when new status is `completed`, `failed`, or `awaiting_approval` | `cancel(sessionId)` | Timer no longer needed; human-approval pause is not charged |
| `PendingActionService` → `setImmediate` → `handleRequest` | `arm()` fires automatically via the `handleRequest` path above | Re-arms when agent resumes after all actions are approved |

The `awaiting_approval` cancel + re-arm on resume means a session that waits two hours for a human to click Approve is not incorrectly killed.

### Configuration

| Env var | Default | Effect |
|---------|---------|--------|
| `AGENT_SESSION_TIMEOUT_MS` | `300000` (5 min) | Milliseconds before a running session is killed |
| Set to `0` | — | Disables the watchdog entirely |

```bash
# .env — shorten timeout during testing
AGENT_SESSION_TIMEOUT_MS=60000   # 1 minute
```

### What Happens in the UI

When `session_status_changed { status: 'failed', reason: 'timeout' }` arrives over SSE, `SessionView` re-fetches the session and renders the failed state:

```
Session failed
Check the session trace for details.
```

The user can inspect the LLM trace (`GET /api/agent/sessions/:id/trace`) to see at which step the agent stopped calling tools.

### Why Not `AbortController` on the LLM Call?

`AbortController` would cancel the in-flight HTTP call to the LLM provider but would not clean up session state in the database — the session would remain stuck in `executing`. The timeout service marks the session `failed` in the DB first, so the state is always consistent regardless of whether the LLM request has actually finished.

---

## 17. File Index

All paths relative to `backend/src/agent/`.

| File | Role |
|------|------|
| `AgentService.ts` | Core orchestrator. `handleRequest`, `handleStreamingRequest`, prompt assembly, tool wiring, auto-continuation |
| `ToolManager.ts` | Selects and assembles the tool set per model and session |
| `AgentTools.ts` | Model-specific CRUD/search tool factories |
| `routes.ts` | All Express endpoints: sessions, chat, pending actions, templates, SSE, trace |
| `prompt/constants.ts` | `SESSION_DIRECTIVE`, `buildSessionContextBlock()`, `shouldAutoContinue()` |
| `prompt/DynamicPromptManager.ts` | Assembles base system prompt from DB templates + model descriptions |
| `tools/sessionTools.ts` | `createPlan`, `completeStep`, `queueAction`, `queueActionBatch` |
| `tools/analyticsQuery.ts` | Read-only SQL execution with org_id enforcement |
| `tools/analyticsContext.ts` | Schema introspection — models, workflow states, multi-tenancy rules |
| `tools/categorizePostings.ts` | ML-based posting categorization predictions (dry-run, no writes) |
| `tools/suggestReconciliationMatches.ts` | Reconciliation match suggestions |
| `services/SessionService.ts` | CRUD for `agent_session` and `agent_message` |
| `services/SessionEventBus.ts` | In-process event emitter for real-time SSE events |
| `services/SessionTimeoutService.ts` | Watchdog that kills sessions stuck in `planning`/`executing` after a configurable timeout |
| `services/SessionTraceService.ts` | Aggregates session data into the trace API response |
| `services/PendingActionService.ts` | CRUD + resolution logic for `pending_action`, triggers executors |
| `executors/PendingActionExecutor.ts` | Executor registry: `reconcile_posting`, `create_posting`, `categorize_transaction` |
| `builders/ActionBuilderRegistry.ts` | Deterministic action creation without LLM round-trip |
| `builders/ReconciliationActionBuilder.ts` | Builds reconcile pending actions from `match_results` |
| `builders/ReportFormatterRegistry.ts` | Deterministic report generation without LLM |
| `builders/ReconciliationReportFormatter.ts` | Formats reconciliation session report |
| `handlers/erp/categorizeTransactionBatch.ts` | Batch ML categorization handler (used by `categorizePostings` tool) |
| `models/ModelProvider.ts` | Selects AI model (`getModel('agent')`) |
| `schema/SchemaGenerator.ts` | Generates schema context for prompt injection |

**Frontend files** (paths relative to `frontend-1/src/`):

| File | Role |
|------|------|
| `pages/settings/AITemplatesPage.tsx` | Tabbed Settings page — Prompt Templates + Agent Templates |
| `components/forms/Masters/AgentTemplatesList.tsx` | Inline list component for agent templates |
| `components/forms/Masters/AgentTemplateForm.tsx` | Create/edit form for agent templates |
| `components/forms/Masters/PromptTemplateForm.tsx` | Create/edit form for prompt templates (unchanged) |
| `pages/workbench/SessionView.tsx` | Per-session page — connects SSE, routes to view components |
| `components/workbench/ExecutingView.tsx` | Live activity feed + `ConnectionBadge` (shows Reconnecting/Offline) |
| `components/workbench/AwaitingApprovalView.tsx` | Inline approve/reject per pending action |
| `components/workbench/CompletedView.tsx` | Plan summary + session report |
| `components/workbench/SessionsSidebar.tsx` | Session list + inbox count badge |
| `pages/workbench/InboxPage.tsx` | Global inbox — all pending actions across sessions |
| `components/workbench/ActionDetailDrawer.tsx` | Slide-in drawer for a single pending action |
| `components/workbench/actions/registry.ts` | Per-action-type label, icon, row summary, detail component |
| `components/workbench/GoalSetter.tsx` | Template picker + goal input (two-screen flow) |
| `hooks/useSessionEvents.ts` | SSE hook — `snapshot`, `events[]`, `connectionStatus` |
| `contexts/AgentSessionContext.tsx` | Session list, inbox count, approve/reject/bulkApprove actions |

**Related documentation** (all in `docs/agent/`):

| File | What it covers |
|------|---------------|
| `WORKBENCH_CATEGORIZE_EXPENSES.md` | **Deep dive**: one complete session traced step by step — prompts, tool calls, DB writes |
| `WORKBENCH_FUNCTIONAL_SPEC.md` | Product-level specification: what the workbench does for users |
| `WORKBENCH_IMPLEMENTATION_PLAN.md` | Phase-by-phase implementation log with completion status |
| `WORKBENCH_AGENT_LOOP.md` | Deep dive into the agent loop logic |
| `RECONCILIATION_TOOL.md` | Reconciliation tool details |
| `LLM_OBSERVABILITY.md` | LLM trace schema and querying guide |

---

*End of document.*
