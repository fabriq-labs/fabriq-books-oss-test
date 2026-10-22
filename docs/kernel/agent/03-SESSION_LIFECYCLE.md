# Fabriq Agent — Session Lifecycle

**Audience**: Anyone debugging session state, auto-continuation, or timeouts.
**Primary file**: `backend/src/agent/AgentService.ts`
**Supporting files**: `prompt/constants.ts`, `services/SessionService.ts`,
`services/SessionTimeoutService.ts`, `tools/sessionTools.ts`, `routes.ts`

---

## State Machine

```
planning → executing → awaiting_approval ⇄ executing → completed
         ↘ awaiting_input ⇄ executing            ↘ failed
```

| State | Meaning |
|-------|---------|
| `planning` | Session created; first LLM call not yet started |
| `executing` | Agent is actively running a step |
| `awaiting_approval` | Agent queued pending actions; waiting for user review |
| `awaiting_input` | Agent paused via `requestClarification`, waiting for the user to answer a clarifying question — **implemented**, see below |
| `completed` | All steps done, all actions resolved |
| `failed` | Unhandled error or watchdog timeout |
| `paused` | Reserved — not currently used |
| `abandoned` | Reserved — not currently used |

State transitions are set by `SessionService.updateAgentSession()` and always
emit a `session_status_changed` SSE event.

---

## Two Execution Strategies

`AgentService` has two entry points with different output formats but
identical logic internals.

### `handleStreamingRequest()` — streaming path

**Used by**: Frontend (first user turn, `POST /api/agent/chat/stream`)
**AI SDK function**: `streamText()`
**Returns**: `ReadableStream` (SSE-compatible, tokens arrive in real time)
**Error handling**: Catches errors, sets `session.status = 'failed'`
immediately, emits `session_status_changed` before the stream closes

### `handleRequest()` — non-streaming path

**Used by**: Auto-continuation (every subsequent turn), clarification
continuation, tests, internal tooling
**AI SDK function**: `generateText()`
**Returns**: `{ content, toolResults, steps, classification }` (full result
after LLM completes)
**Error handling**: Throws exception; caught by route handler (but does NOT
update session status — the watchdog handles cleanup)

### Key differences

| Aspect | `handleStreamingRequest` | `handleRequest` |
|--------|--------------------------|----------------|
| AI SDK function | `streamText()` | `generateText()` |
| Return type | `ReadableStream` | Plain object |
| Token delivery | Real-time incremental | All at once |
| Error → session status | Sets `'failed'` immediately | Relies on watchdog |
| Message persistence | `onFinish` callback | `onStepFinish` + after await |
| Auto-continuation | Identical — both call `handleRequest` via `setImmediate` |

Both paths share: identical tool selection, identical system prompt
construction, identical session context injection, identical `maxSteps`
budget (default 20 for sessions).

---

## Phase 1: Planning

**Trigger**: Frontend calls `POST /api/agent/chat/stream` with the goal and
`sessionId`.

`AgentService.handleStreamingRequest()` runs:

1. Load session from DB (`status = 'planning'`, `plan = null`)
2. Assemble system prompt (see [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md))
3. Inject `SESSION_DIRECTIVE` — includes: *"IF status is 'planning' AND no
   plan exists → call createPlan IMMEDIATELY"*
4. Get tools via `ToolManager.getUnifiedTools()` including `createPlan`
5. Call `streamText()` → LLM sees directive and calls `createPlan({ goal, steps })`

`createPlan` tool (`tools/sessionTools.ts`):
- Writes `plan` (array of `PlanStep`) to `agent_session`
- Sets `status = 'executing'`, `current_step_index = 0`
- Emits `session_status_changed` SSE event
- Returns structured response to LLM

After `createPlan` is detected in `onStepFinish`, `generateSessionName()` is
called asynchronously (fire-and-forget LLM call that sets `agent_session.name`).

---

## Phase 2: Executing (The Agent Loop)

After planning, auto-continuation drives the plan forward without browser
interaction.

### Auto-Continuation Logic (`AgentService`)

```typescript
// After each LLM call completes:
const stepIndexBeforeLLM = session.current_step_index ?? null;
const result = await generateText({ ... });                  // or streamText
const updatedSession = await getAgentSession(sessionId);
const stepIndexAfterLLM = updatedSession.current_step_index ?? null;
const stepAdvanced = stepIndexAfterLLM !== stepIndexBeforeLLM;

if (shouldAutoContinue(updatedSession) && stepAdvanced) {
  const nextStep = plan[updatedSession.current_step_index ?? 0];
  const continuationMessage =
    `Continue with step ${nextStep.index + 1}: "${nextStep.title}". ${nextStep.description}`;
  setImmediate(() => {
    this.handleRequest(continuationMessage, auth, [], context, sessionId)
      .catch(err => logger.error('Auto-continuation failed', { sessionId, err }));
  });
} else if (!stepAdvanced && shouldAutoContinue(updatedSession)) {
  logger.warn('Auto-continuation skipped — step did not advance (preventing infinite loop)', { sessionId });
}
```

**`shouldAutoContinue(session)`** — exact implementation in `prompt/constants.ts`:

```typescript
export function shouldAutoContinue(session: {
  status: string;
  plan?: any;
  current_step_index?: number | null;
}): boolean {
  if (session.status !== 'executing') return false;
  const plan = session.plan as any[] | null;
  const currentStep = plan?.[session.current_step_index ?? 0];
  if (!currentStep) return false;
  return true;
}
```

Returns `true` only if `status === 'executing'` AND the current step exists
in the plan. Any other status (`awaiting_approval`, `awaiting_input`,
`completed`, `failed`) immediately stops the loop.

**Loop prevention guard**: `stepAdvanced` must be `true` for
auto-continuation to fire. If the LLM made tool calls but did not call
`completeStep`, the step index stays the same, `stepAdvanced === false`, and
continuation is skipped with a warning log. This is the primary defence
against an infinite loop when the model calls tools without advancing the step.

### Per-Step Execution

Each step type expects the LLM to:

| Step Type | Expected LLM actions |
|-----------|---------------------|
| `query` | Call analytics/search tools; call `completeStep` with `result_summary` + `accumulated_context_update`. If a query returns 0 rows due to an ambiguous reference, call `requestClarification` instead (see below) |
| `analysis` | Call analysis tools (e.g. `suggestReconciliationMatches`); call `completeStep` with full structured output in `accumulated_context_update` |
| `action` | Call `queueActions` with predictions; OR hybrid dispatcher handles it automatically |
| `report` | Write plain-text summary; call `completeStep`; OR deterministic formatter handles it |

### `completeStep` Tool

Called by the LLM at the end of each step. Parameters:
- `step_index` — which step is being completed
- `result_summary` — human-readable summary (stored in `plan[index].result_summary`)
- `accumulated_context_update` — key facts to carry forward (merged into `session.accumulated_context`)

After marking the step complete, `completeStep` may run a deterministic
follow-up for the next step. That follow-up is a domain executor when one
is registered. This tree does not ship one.

### Session Context Block

On every LLM call, `buildSessionContextBlock()` (`prompt/constants.ts`)
appends to the system prompt:

```
## Active Session Context
Goal: List roles on this org
Mode: supervised
Status: executing — Step 2 of 3: Search roles
Pending actions: 0 awaiting review
Accumulated: {"role_count": 1}

## Full Plan    ← only on first turn or after createPlan
[{"index":0,"type":"query","title":"Search roles",...}, ...]
```

The `accumulated_context` JSON is how earlier steps pass data to later ones —
a query step stores its results here; the action step reads them.

On the **first turn** or immediately after `createPlan`, the full plan JSON
is included. On subsequent turns, only the header is shown (token savings).

---

## Phase 2b: Awaiting Input (`requestClarification`)

**Tool**: `requestClarificationTool` in `tools/sessionTools.ts`. Made
available to the LLM via `ToolManager` (`tools.requestClarification = ...`).

**When the LLM should call it**: only from a `query` step, when a query
returned 0 rows because the user's goal referenced an ambiguous or
unresolvable entity — the goal names something the search did not uniquely match. Per `SESSION_DIRECTIVE`
(`prompt/constants.ts`), the LLM must run a broader query first to gather
candidates, then call `requestClarification` with the question and those
candidates — never respond in plain text instead of calling a tool.

**Parameters**:
```typescript
{
  question: string,          // shown to the user verbatim
  context?: {                // optional, stored for later steps
    searched_for?: string,
    available?: string[],
  },
}
```

**What happens on call**:

1. `agent_session.status → 'awaiting_input'`
2. `agent_session.clarification_request = { question, context, step_index }`
3. `SessionTimeoutService.cancel(sessionId)` — the watchdog does not kill a
   session waiting on a human
4. `session_status_changed` SSE event emitted with the clarification payload
5. Tool returns a confirmation message to the LLM; **the LLM must not also
   call `completeStep`** — the turn ends with the session paused

**Resuming**: `POST /api/agent/sessions/:id/clarify` with `{ response: string }`
(`routes.ts`):

1. Validates `session.status === 'awaiting_input'`
2. Appends `{ step_index, question, answer, context }` to
   `accumulated_context.clarifications[]`
3. Persists the user's answer as an `agent_message` (role `user`) so the LLM
   sees it in history
4. Clears `clarification_request`, sets `status = 'executing'`
5. Emits `session_status_changed`
6. `setImmediate(() => agentService.handleRequest(response, auth, [], ..., sessionId))`
   — same continuation pattern as auto-continuation, re-arms the watchdog

The clarification answer becomes part of `accumulated_context`, so later
steps (and `accumulated_context_update` merges) can reference
`clarifications[].answer` the same way they reference any other accumulated
fact.

---

## Phase 3: Awaiting Approval

When the action step runs, the session transitions to `awaiting_approval`:

1. Agent calls `queueActions`
2. `pending_action` records are created in the DB
3. `agent_session.status = 'awaiting_approval'`, `pending_actions_count` updated
4. `action_queued` and `session_status_changed` SSE events emitted

The user then reviews actions in the Inbox or session view.

### Approval Flow

`PATCH /api/agent/pending-actions/:id` → `resolvePendingAction`:
1. Updates `pending_action.status` when the row's org is the caller org
2. If approved: runs the executor registered for `action_type`, when one exists
3. Updates `completed_actions_count`
4. Calls `checkAllPendingActionsResolved()` — if 0 remaining, triggers session continuation

---

## Phase 4: Session Completion

Three paths to completion after all pending actions are resolved:

### Path A: Deterministic (no LLM call)

If a report formatter is registered for this session type:
1. `PendingActionService` calls `formatter.format(accumulated_context, session)`
2. Writes report as an `agent_message`
3. Sets `status = 'completed'`
4. Emits `session_status_changed`

### Path B: Agent-driven (LLM call)

If no formatter matches but `shouldAutoContinue` is true:
1. Sets `status = 'executing'`
2. `setImmediate(() => agentService.handleRequest("All pending actions reviewed. Continue...", ...))`
3. Agent executes remaining steps (report step), calls `completeStep` on last step → `completed`

### Path C: Direct completion

If no more steps remain after all actions resolve:
1. Sets `status = 'completed'` directly
2. Emits SSE event

---

## First-Turn vs Subsequent-Turn Differences

`AgentService` detects whether it is the first turn in a session and adjusts
prompt content accordingly.

```typescript
const isFirstTurn = sessionMessages.length === 0;

// Detect if createPlan just fired in the previous assistant message
const justCreatedPlan = sessionMessages.length > 0 &&
  sessionMessages[sessionMessages.length - 1]?.tool_calls?.some?.(
    (tc: any) => tc.name === 'createPlan' || tc.toolName === 'createPlan'
  );
```

| Aspect | First turn (`isFirstTurn = true`) | Subsequent turns |
|--------|-----------------------------------|-----------------|
| Session history | Not included (empty) | Last 50 `agent_message` rows included |
| Plan in prompt | Full plan JSON included | Compact header only (~50 tokens saved) |
| Trigger for full plan | `isFirstTurn` OR `justCreatedPlan` | Never (until next createPlan) |
| Expected LLM action | Call `createPlan` immediately | Continue from current step (or answer after clarification) |
| `maxSteps` | 20 (SESSION_MAX_STEPS) | 20 |

**Message array on first turn**:
```
[{ role: 'system', content: fullSystemPrompt }, { role: 'user', content: goal }]
```

**Message array on subsequent turns**:
```
[
  { role: 'system', content: fullSystemPrompt },
  // ... last 50 agent_messages converted to AI SDK format ...
  { role: 'user', content: 'Continue with step 2: "Suggest matches". ...' }
]
```

---

## Context Derivation

When `context.modelName === 'default'` and a `sessionId` is present,
`AgentService` derives the real model name from `session.goal_model`:

```typescript
if (sessionId && (!context?.modelName || context.modelName === 'default')) {
  effectiveContext.modelName = session.goal_model;
}
```

This ensures the correct model-specific tools and prompts are used for all
auto-continuation and clarification-continuation calls.

---

## Message History Reconstruction

On each subsequent LLM call, `AgentService` loads the last 50
`agent_message` rows for the session and converts them back into AI SDK
message format:

```
[
  { role: 'system',    content: '<full system prompt>' },
  { role: 'user',      content: '<step 1 user turn>' },
  { role: 'assistant', content: [...tool calls from step 1...] },
  { role: 'tool',      content: [...tool results from step 1...] },
  { role: 'assistant', content: 'Step 1 complete.' },
  { role: 'user',      content: '<step 2 continuation prompt>' },  ← current turn
]
```

`agent_message.tool_calls` and `agent_message.tool_results` store the raw AI
SDK JSON so they can be replayed verbatim on subsequent calls. A clarification
answer is persisted the same way — as a `role: 'user'` message — so it
appears in this history exactly like a continuation prompt.

---

## Session Timeout Watchdog

**File**: `services/SessionTimeoutService.ts`

**Configuration**:
- Default: 5 minutes (`DEFAULT_TIMEOUT_MS = 5 * 60 * 1000`)
- Override via env var: `AGENT_SESSION_TIMEOUT_MS=<ms>` (set to `0` to disable entirely)

**Timer lifecycle**:

| Event | Timer action |
|-------|-------------|
| `handleRequest` or `handleStreamingRequest` starts | `arm(sessionId)` — resets timer on every new LLM turn |
| Session transitions to `completed`, `failed`, `awaiting_approval`, or `awaiting_input` | `cancel(sessionId)` (in `SessionService.updateAgentSession` / `requestClarificationTool`) |
| Session transitions back to `executing` (approval resolved, or `/clarify` answered) | Re-armed on next LLM call |

**`arm()` implementation**:
```typescript
arm(sessionId: string): void {
  if (this.timeoutMs <= 0) return;  // disabled
  this.cancel(sessionId);            // reset existing timer
  const timer = setTimeout(() => {
    this.timers.delete(sessionId);
    void this.killSession(sessionId);
  }, this.timeoutMs);
  if (timer.unref) timer.unref();    // allow Node.js to exit while timer pending
  this.timers.set(sessionId, timer);
}
```

**Kill condition**: `killSession()` only marks the session `failed` if it is
still in `planning` or `executing`. If the session moved to
`awaiting_approval`, `awaiting_input`, or `completed` before the timer fired
(race condition), the kill is a no-op.

**Implication**: A session stuck in `executing` (e.g. LLM failed to call
`completeStep` or `requestClarification`) will be marked `failed` after the
timeout. Sessions in `awaiting_approval` or `awaiting_input` are NOT killed by
the watchdog — they wait indefinitely.

**Why not `AbortController` on the LLM call?** `AbortController` would cancel
the in-flight HTTP call to the LLM provider but would not clean up session
state in the database — the session would remain stuck in `executing`. The
timeout service marks the session `failed` in the DB first, so the state is
always consistent regardless of whether the LLM request has actually finished.

**`awaiting_approval`/`awaiting_input` cancel + re-arm**: Cancelling on these
transitions and re-arming on resume means a session that waits hours for a
human to approve or answer is not incorrectly killed — wall-clock time spent
awaiting human input does not count against the timeout.

---

## SSE Event System

All session events are emitted via `SessionEventBus` (singleton
`EventEmitter`) and streamed to the browser via
`GET /api/agent/sessions/:id/events`.

| Event | When | Key data |
|-------|------|---------|
| `snapshot` | Immediately on SSE connect | `{ session, trace }` |
| `step_started` | Agent begins a step | `step_index`, `title`, `type` |
| `step_completed` | Agent finishes a step | `step_index`, `result_preview` |
| `tool_called` | Agent calls a tool | `tool_name`, `step_index`, `args_preview` |
| `action_queued` | Pending action created | `action_id`, `action_type`, `title`, `confidence` |
| `session_status_changed` | Session state changes (including → `awaiting_input` with `clarification_request`) | `status` |
| `inbox_count_changed` | Any pending action created/resolved | (org-level) |
| `heartbeat` | Every 30 seconds | — |

Wire format:
`data: ${JSON.stringify({ id, type, sessionId, orgId, timestamp, data })}\n\n`.
The `event:` SSE field is NOT used — event type is in the JSON body.

---

## Frontend Session State Synchronization

The workbench session view is in `frontend-0`. It consumes the SSE stream from `GET /api/agent/sessions/:id/events`.

The frontend maintains a local session snapshot in React state by consuming
SSE events. When `session_status_changed` is emitted, the **frontend
immediately fetches fresh session data** via `sessionAPI.get()` rather than
attempting to patch the local snapshot with optimistic state.

**Why not patch locally?** Patching the snapshot on status-change events would
create a partial session object (e.g., the original plan + the new status)
that races with the fresh API fetch. This causes a transient UI state where
the UI renders stale step data momentarily before the fresh data arrives,
resulting in visual flicker.

**Correct pattern**:
```typescript
// ❌ BAD: Optimistic patching
if (eventType === 'session_status_changed') {
  setSnapshot(prev => ({ ...prev, session: { ...prev.session, status: newStatus } }));
}
// This creates a stale partial-session that races with the API fetch.

// ✅ GOOD: Let the consumer fetch fresh data
// SessionView watches for 'session_status_changed' in events and calls:
sessionAPI.get(sessionId)  // Fresh, complete session object
```

This applies to any event that signals a state transition, including
`awaiting_input`. SSE events are **notification signals**, not the source of
truth for mutable state. The backend is authoritative.

---

## Known Limitations

| Issue | Current behaviour |
|-------|------------------|
| In-process execution | `setImmediate` runs agent continuation in same Node.js process — no BullMQ/Redis worker queue |
| No crash recovery | Server restart mid-session leaves session in `executing` (will eventually be killed by the watchdog once a request comes in) |

The watchdog and the in-process continuation are the limits that matter for a stuck session.

---

## What's Next

- **04-PROMPT_SYSTEM.md** — how the system prompt is assembled
- **05-TOOLS.md** — which tools exist, and what supervised mode removes
