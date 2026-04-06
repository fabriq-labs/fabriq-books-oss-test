# Fabriq Agent — Session Lifecycle

**Last Updated**: 2026-04-04  
**Primary file**: `backend/src/agent/AgentService.ts`  
**Supporting files**: `prompt/constants.ts`, `services/SessionService.ts`, `services/SessionTimeoutService.ts`

---

## State Machine

```
planning → executing → awaiting_approval ⇄ executing → completed
         ↘ awaiting_input (planned)               ↘ failed
```

| State | Meaning |
|-------|---------|
| `planning` | Session created; first LLM call not yet started |
| `executing` | Agent is actively running a step |
| `awaiting_approval` | Agent queued pending actions; waiting for user review |
| `awaiting_input` | Agent paused to ask user a clarification question (planned — requires `requestClarification` tool) |
| `completed` | All steps done, all actions resolved |
| `failed` | Unhandled error or watchdog timeout |
| `paused` | Reserved — not currently used |
| `abandoned` | Reserved — not currently used |

State transitions are set by `SessionService.updateAgentSession()` and always emit a `session_status_changed` SSE event.

---

## Two Execution Strategies

`AgentService` has two entry points with different output formats but identical logic internals.

### `handleStreamingRequest()` — streaming path

**Used by**: Frontend (first user turn, `POST /api/agent/chat/stream`)  
**AI SDK function**: `streamText()`  
**Returns**: `ReadableStream` (SSE-compatible, tokens arrive in real time)  
**Error handling**: Catches errors, sets `session.status = 'failed'` immediately, emits `session_status_changed` before the stream closes

### `handleRequest()` — non-streaming path

**Used by**: Auto-continuation (every subsequent turn), tests, internal tooling  
**AI SDK function**: `generateText()`  
**Returns**: `{ content, toolResults, steps, classification }` (full result after LLM completes)  
**Error handling**: Throws exception; caught by route handler (but does NOT update session status — the watchdog handles cleanup)

### Key differences

| Aspect | `handleStreamingRequest` | `handleRequest` |
|--------|--------------------------|----------------|
| AI SDK function | `streamText()` | `generateText()` |
| Return type | `ReadableStream` | Plain object |
| Token delivery | Real-time incremental | All at once |
| Error → session status | Sets `'failed'` immediately | Relies on watchdog |
| Message persistence | `onFinish` callback | `onStepFinish` + after await |
| Auto-continuation | Identical — both call `handleRequest` via `setImmediate` |

Both paths share: identical tool selection, identical system prompt construction, identical session context injection, identical `maxSteps` budget (default 20 for sessions).

---

## Phase 1: Planning

**Trigger**: Frontend calls `POST /api/agent/chat/stream` with the goal and `sessionId`.

`AgentService.handleStreamingRequest()` runs:

1. Load session from DB (`status = 'planning'`, `plan = null`)
2. Assemble system prompt (see [PROMPT_SYSTEM.md](./PROMPT_SYSTEM.md))
3. Inject `SESSION_DIRECTIVE` — includes: *"IF status is 'planning' AND no plan exists → call createPlan IMMEDIATELY"*
4. Get tools via `ToolManager.getUnifiedTools()` including `createPlan`
5. Call `streamText()` → LLM sees directive and calls `createPlan({ goal, steps })`

`createPlan` tool (`tools/sessionTools.ts`):
- Writes `plan` (array of `PlanStep`) to `agent_session`
- Sets `status = 'executing'`, `current_step_index = 0`
- Emits `session_status_changed` SSE event
- Returns structured response to LLM

After `createPlan` is detected in `onStepFinish`, `generateSessionName()` is called asynchronously (fire-and-forget LLM call that sets `agent_session.name`).

---

## Phase 2: Executing (The Agent Loop)

After planning, auto-continuation drives the plan forward without browser interaction.

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

Returns `true` only if `status === 'executing'` AND the current step exists in the plan. Any other status (awaiting_approval, completed, failed) immediately stops the loop.

**Loop prevention guard**: `stepAdvanced` must be `true` for auto-continuation to fire. If the LLM made tool calls but did not call `completeStep`, the step index stays the same, `stepAdvanced === false`, and continuation is skipped with a warning log. This is the primary defence against infinite loops (Pattern 3 in [debugging/SESSION_FAILURE_PATTERNS.md](./debugging/SESSION_FAILURE_PATTERNS.md)).

### Per-Step Execution

Each step type expects the LLM to:

| Step Type | Expected LLM actions |
|-----------|---------------------|
| `query` | Call analytics/search tools; call `completeStep` with `result_summary` + `accumulated_context_update` |
| `analysis` | Call analysis tools (e.g. `suggestReconciliationMatches`); call `completeStep` with full structured output in `accumulated_context_update` |
| `action` | Call `queueActions` with predictions; OR hybrid dispatcher handles it automatically |
| `report` | Write plain-text summary; call `completeStep`; OR deterministic formatter handles it |

### `completeStep` Tool

Called by the LLM at the end of each step. Parameters:
- `step_index` — which step is being completed
- `result_summary` — human-readable summary (stored in `plan[index].result_summary`)
- `accumulated_context_update` — key facts to carry forward (merged into `session.accumulated_context`)

After marking the step complete, `completeStep` runs the **hybrid dispatcher** (see [BUILDERS_EXECUTORS.md](./BUILDERS_EXECUTORS.md)) which may handle subsequent steps deterministically.

### Session Context Block

On every LLM call, `buildSessionContextBlock()` (`prompt/constants.ts`) appends to the system prompt:

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

The `accumulated_context` JSON is how earlier steps pass data to later ones — a query step stores its results here; the action step reads them.

On the **first turn** or immediately after `createPlan`, the full plan JSON is included. On subsequent turns, only the header is shown (token savings).

---

## Phase 3: Awaiting Approval

When the action step runs, the session transitions to `awaiting_approval`:

1. Agent calls `queueActions` (or deterministic builder fires — see [BUILDERS_EXECUTORS.md](./BUILDERS_EXECUTORS.md))
2. `pending_action` records are created in the DB
3. `agent_session.status = 'awaiting_approval'`, `pending_actions_count` updated
4. `action_queued` and `session_status_changed` SSE events emitted

The user then reviews actions in the Inbox or session view.

### Approval Flow

`POST /api/agent/pending-actions/:id/resolve` → `PendingActionService.resolvePendingAction`:
1. Updates `pending_action.status`
2. If approved: runs the executor for the action type (see [BUILDERS_EXECUTORS.md](./BUILDERS_EXECUTORS.md))
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

`AgentService` detects whether it is the first turn in a session and adjusts prompt content accordingly.

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
| Expected LLM action | Call `createPlan` immediately | Continue from current step |
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

When `context.modelName === 'default'` and a `sessionId` is present, `AgentService` derives the real model name from `session.goal_model`:

```typescript
if (sessionId && (!context?.modelName || context.modelName === 'default')) {
  effectiveContext.modelName = session.goal_model; // e.g. 'posting'
}
```

This ensures the correct model-specific tools and prompts are used for all auto-continuation calls.

---

## Message History Reconstruction

On each subsequent LLM call, `AgentService` loads the last 50 `agent_message` rows for the session and converts them back into AI SDK message format:

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

`agent_message.tool_calls` and `agent_message.tool_results` store the raw AI SDK JSON so they can be replayed verbatim on subsequent calls.

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
| Session transitions to `completed`, `failed`, or `awaiting_approval` | `cancel(sessionId)` (in `SessionService.updateAgentSession`) |
| Session transitions from `awaiting_approval` back to `executing` | Re-armed on next LLM call |

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

**Kill condition**: `killSession()` only marks the session `failed` if it is still in `planning` or `executing`. If the session moved to `awaiting_approval` or `completed` before the timer fired (race condition), the kill is a no-op.

**Implication**: A session stuck in `executing` (e.g. LLM failed to call `completeStep`) will be marked `failed` after the timeout. Sessions in `awaiting_approval` are NOT killed by the watchdog — they wait indefinitely. See [debugging/SESSION_FAILURE_PATTERNS.md](./debugging/SESSION_FAILURE_PATTERNS.md) for patterns.

**Why not `AbortController` on the LLM call?** `AbortController` would cancel the in-flight HTTP call to the LLM provider but would not clean up session state in the database — the session would remain stuck in `executing`. The timeout service marks the session `failed` in the DB first, so the state is always consistent regardless of whether the LLM request has actually finished.

**`awaiting_approval` cancel + re-arm**: The `cancel` on `awaiting_approval` transition and re-arm on resume means a session that waits hours for a human to approve is not incorrectly killed — wall-clock time spent awaiting human input does not count against the timeout.

---

## SSE Event System

All session events are emitted via `SessionEventBus` (singleton `EventEmitter`) and streamed to the browser via `GET /api/agent/sessions/:id/events`.

| Event | When | Key data |
|-------|------|---------|
| `snapshot` | Immediately on SSE connect | `{ session, trace }` |
| `step_started` | Agent begins a step | `step_index`, `title`, `type` |
| `step_completed` | Agent finishes a step | `step_index`, `result_preview` |
| `tool_called` | Agent calls a tool | `tool_name`, `step_index`, `args_preview` |
| `action_queued` | Pending action created | `action_id`, `action_type`, `title`, `confidence` |
| `session_status_changed` | Session state changes | `status` |
| `inbox_count_changed` | Any pending action created/resolved | (org-level) |
| `heartbeat` | Every 30 seconds | — |

Wire format: `data: ${JSON.stringify({ id, type, sessionId, orgId, timestamp, data })}\n\n`. The `event:` SSE field is NOT used — event type is in the JSON body.

---

## Frontend Session State Synchronization

**File**: `frontend-1/src/hooks/useSessionEvents.ts`

The frontend maintains a local session snapshot in React state by consuming SSE events. When `session_status_changed` is emitted, the **frontend immediately fetches fresh session data** via `sessionAPI.get()` rather than attempting to patch the local snapshot with optimistic state.

**Why not patch locally?** Patching the snapshot on status-change events would create a partial session object (e.g., the original plan + the new status) that races with the fresh API fetch. This causes a transient UI state where the UI renders stale step data momentarily before the fresh data arrives, resulting in visual flicker.

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

This applies to any event that signals a state transition. SSE events are **notification signals**, not the source of truth for mutable state. The backend is authoritative.

---

## Known Limitations

| Issue | Current behaviour | Planned fix |
|-------|------------------|-------------|
| Agent stuck on 0-row query | Watchdog kills session after 30 min | `requestClarification` tool + `awaiting_input` state (planned) |
| In-process execution | `setImmediate` runs agent in same Node.js process | BullMQ + Redis worker queue |
| No crash recovery | Server restart mid-session leaves session in `executing` | Worker queue with job persistence |
| Message history between auto-continuations | Only text messages saved; tool call/result pairs reconstructed from `agent_message` | Fully implemented; see message format above |
