# Agent Session Failure Patterns

**Purpose**: Living registry of known agent session failure patterns. Each entry maps observable symptoms (from the database) to a root cause and a recommended fix. Used by debugging agents and human engineers to diagnose failed sessions quickly.

**How to use**:
1. Query the database for the failed session (see diagnostic queries below)
2. Match the symptoms to a pattern in this doc
3. Follow the root cause and fix guidance
4. If the failure is new, add it as a new entry

---

## Diagnostic Queries

Run these first on any failed session to gather evidence.

```sql
-- Step 1: Get session overview
SELECT id, status, goal, template_id, goal_model, plan IS NOT NULL as has_plan,
       current_step_index, pending_actions_count, completed_actions_count,
       mode, started_at, last_active_at, completed_at
FROM agent_session
WHERE id = '<SESSION_ID>';

-- Step 2: Check messages (were any LLM turns completed?)
SELECT id, role, step_index,
       tool_calls IS NOT NULL as has_tool_calls,
       tool_results IS NOT NULL as has_tool_results,
       left(content, 120) as content_preview,
       created_at
FROM agent_message
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;

-- Step 3: Check LLM traces (did any LLM call complete?)
SELECT id, status, error_message, llm_model, prompt_tokens, completion_tokens,
       duration_ms, tools_called, created_at
FROM llm_trace
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;

-- Step 4: Check pending actions
SELECT id, action_type, status, confidence_score, execution_error, created_at
FROM pending_action
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;

-- Step 5: Time gap analysis (key diagnostic)
SELECT id, status, started_at, last_active_at,
       EXTRACT(EPOCH FROM (last_active_at - started_at)) AS gap_seconds
FROM agent_session
WHERE id = '<SESSION_ID>';
```

---

## Failure Pattern Index

| # | Pattern Name | Status | Messages? | Plan? | Approx Gap | Likely Cause |
|---|-------------|--------|-----------|-------|------------|--------------|
| 1 | [LLM Timeout](#1-llm-timeout) | `failed` | None | None | ~5 min | LLM hung, no request timeout |
| 2 | [Plan Never Created](#2-plan-never-created) | `failed` | Some | None | < 5 min | LLM skipped `createPlan` tool call |
| 3 | [Step Loop](#3-step-loop) | `failed` | Many | Yes | ~5 min | Auto-continuation cycling on same step |
| 4 | [Awaiting Approval Abandoned](#4-awaiting-approval-abandoned) | `awaiting_approval` | Yes | Yes | Hours/days | User never reviewed; session not expired |
| 5 | [Prompt Template Not Found](#5-prompt-template-not-found) | `failed` | None | None | ~0s | `APP_NAME` env mismatch or templates not seeded |
| 6 | [Step Stalled — Data Not Found](#6-step-stalled--data-not-found) | `executing` | Some | Yes | ~5 min | LLM couldn't find required data, didn't call `completeStep` |
| 7 | [Action Step Creates No Actions](#7-action-step-creates-no-actions) | `completed` | Yes | Yes | ~0s | Builder ran but `accumulated_context` was empty |
| 8 | [Bulk Approve Skips Execution](#8-bulk-approve-skips-execution) | `awaiting_approval` | Yes | Yes | Immediate | `updateMany` bypassed executor registry |

---

## Pattern Details

### 1. LLM Timeout

**Observed**: 2026-04-02, sessions `ses_ffb800de` and `ses_88912272`

**Symptoms**
- `status = 'failed'`
- `plan IS NULL`
- Zero rows in `agent_message` for this session
- Zero rows in `llm_trace` linked to this session
- `last_active_at - started_at` ≈ 5 minutes (the watchdog default)
- `completed_at` is set (by the watchdog)

**Root Cause**

The `handleStreamingRequest` function calls `streamText(model, ...)` with no `abortSignal` or request-level timeout. If the upstream LLM provider (OpenRouter, Vertex, etc.) hangs or is slow, the call waits indefinitely. After 5 minutes the `SessionTimeoutService` watchdog fires and marks the session `failed`. Messages are only persisted in the `onFinish` / `onStepFinish` callbacks — so if the LLM never responds, nothing is written.

The route handler's `catch` block (routes.ts) sends a 500 HTTP response but **does not update the session status** — the session stays in `planning` until the watchdog fires.

**Diagnostic confirmation**

```sql
-- Confirms watchdog killed it: gap is exactly SESSION_TIMEOUT_MS (default 300s)
SELECT EXTRACT(EPOCH FROM (last_active_at - started_at)) AS gap_seconds
FROM agent_session WHERE id = '<SESSION_ID>';
-- Expected: ~300 (5 minutes)
```

**Fix**

Two independent improvements:

1. **Short-circuit on stream error** — in `handleStreamingRequest`, wrap the `streamText` call in a try/catch that also updates `session.status = 'failed'` with an error reason immediately, rather than relying on the watchdog.

2. **Add request timeout to `streamText`** — pass `abortSignal: AbortSignal.timeout(AGENT_REQUEST_TIMEOUT_MS)` (e.g. 90s) so the call fails fast instead of hanging until the watchdog fires.

**Files to change**
- `backend/src/agent/AgentService.ts` — `handleStreamingRequest` and `handleRequest`
- `backend/src/agent/routes.ts` — catch block for `/chat/stream` (update session on error)

---

### 2. Plan Never Created

**Symptoms**
- `status = 'failed'`
- `plan IS NULL`
- Messages exist in `agent_message` (at least one user + one assistant turn)
- `last_active_at - started_at` ≈ 5 minutes
- Assistant message content shows the LLM described a plan in text instead of calling `createPlan`

**Root Cause**

The LLM responded in plain text instead of calling the `createPlan` tool. This can happen when:
- The `SESSION_DIRECTIVE` in the system prompt was not injected correctly
- The template's `system_prompt` overrode or conflicted with the directive
- The LLM hit its `maxSteps` limit before calling `createPlan`

**Diagnostic confirmation**

```sql
-- Check if LLM responded but didn't call createPlan
SELECT role, tool_calls, left(content, 200) as preview
FROM agent_message
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;
-- If assistant row has NULL tool_calls but content describes steps → this pattern
```

**Fix**
- Audit `buildSessionContextBlock` output for sessions where `isFirstTurn = true`
- Check that `SESSION_DIRECTIVE` text (`IF status is 'planning' AND no plan exists → call createPlan IMMEDIATELY`) survives template prompt merging
- Consider enforcing `createPlan` as a required first tool call via `toolChoice`

**Files to change**
- `backend/src/agent/AgentService.ts` — `buildSessionContextBlock`, session directive injection

---

### 3. Step Loop

**Symptoms**
- `status = 'failed'`
- `plan IS NOT NULL`, multiple steps defined
- Many messages in `agent_message` (10+)
- `current_step_index` unchanged across multiple messages
- `last_active_at - started_at` ≈ 5 minutes

**Root Cause**

`shouldAutoContinue()` returned true repeatedly without `current_step_index` advancing. The LLM called tools but did not call `completeStep`, so the step never advanced. Auto-continuation fired again on the same step, creating a loop until the watchdog fired.

**Diagnostic confirmation**

```sql
-- Check step_index distribution across messages
SELECT step_index, COUNT(*) as message_count
FROM agent_message
WHERE session_id = '<SESSION_ID>'
GROUP BY step_index
ORDER BY step_index;
-- If one step_index has >> 3 messages → loop
```

**Fix**
- The `shouldAutoContinue` guard in `AgentService.ts` already checks `!stepAdvanced` — verify this check is working
- Add a per-step message count cap (e.g. abort if > 5 messages on same step without advancing)

---

### 4. Awaiting Approval Abandoned

**Symptoms**
- `status = 'awaiting_approval'`
- `pending_actions_count > 0`, `completed_actions_count = 0`
- `last_active_at` is hours or days old
- Pending actions exist in `pending_action` table with `status = 'pending'`

**Root Cause**

The session reached the human-review step and created pending actions, but the user never approved or rejected them. No timeout currently applies to `awaiting_approval` status — sessions can sit here indefinitely.

**Diagnostic confirmation**

```sql
SELECT pa.id, pa.action_type, pa.status, pa.created_at, pa.expires_at
FROM pending_action pa
WHERE pa.session_id = '<SESSION_ID>' AND pa.status = 'pending';
```

**Fix**
- Add a configurable expiry to `awaiting_approval` sessions (e.g. 24h) in `SessionTimeoutService`
- Or surface these as "stale" in the workbench UI with a nudge to the user

---

### 5. Prompt Template Not Found

**Observed**: 2026-04-02, session `ses_63125234-be79-46c0-ade8-5d5fca9a73e5`

**Symptoms**
- `status = 'failed'`
- `plan IS NULL`
- Zero rows in `agent_message`
- Zero rows in `llm_trace`, OR one trace with `error_message` containing "No prompt templates found for model: X, view: Y"
- `last_active_at - started_at` ≈ 0s (failed immediately, before any LLM call)

**Root Cause**

`DynamicPromptManager` filters `prompt_template` by `app_name = process.env.APP_NAME`. If the `APP_NAME` environment variable differs from the value stored in `prompt_template.app_name` (or templates have not been seeded), the query returns zero rows and an error is thrown synchronously before the first LLM call.

**Diagnostic confirmation**

```sql
-- Check if any templates exist for the expected app_name
SELECT app_name, model_name, prompt_type, COUNT(*)
FROM prompt_template
GROUP BY app_name, model_name, prompt_type
ORDER BY app_name, model_name;
-- If no rows for the app_name that matches APP_NAME env var → this pattern

-- Check the error in the trace (if one exists)
SELECT error_message FROM llm_trace
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at DESC LIMIT 1;
-- Expected: "No prompt templates found for model: posting, view: posting_view"
```

**Fix**

1. Ensure `APP_NAME` in your `.env` matches the `app_name` column in `prompt_template` rows.
2. If templates are missing, run `seed-agent-templates.sql` against the target database.
3. If using `USE_LOCAL_PROMPT=true`, verify the local `.txt` prompt files exist in `backend/prisma/metadata/prompt-templates/`.

**Files to change**
- `backend/.env` — verify `APP_NAME` value
- `backend/prisma/seed-agent-templates.sql` — run to seed missing templates

---

### 6. Step Stalled — Data Not Found

**Observed**: 2026-04-03, session `ses_64362f57-a29f-439e-bef5-631385783f25`

**Symptoms**
- `status = 'executing'`
- `plan IS NOT NULL`, multiple steps defined
- `current_step_index = 0` (or whichever step required the missing data)
- Messages exist — 2–4 rows, all at the same `step_index`
- LLM traces linked: 1–2, both `status = 'success'`, tools called include `advancedSqlQuery`
- Zero pending actions
- `last_active_at - started_at` ≈ 5 minutes (watchdog kills it eventually)
- Assistant message content contains phrases like *"I couldn't find any accounts"* or *"Please ensure that..."*

**Root Cause**

The LLM ran SQL queries to find required data (e.g., a bank account, a supplier record) but the queries returned 0 rows. Instead of calling `completeStep` with a failure status, the LLM responded in plain text reporting the problem. Since `completeStep` was never called, `current_step_index` never advanced. Auto-continuation fired once more (the `stepAdvanced` guard allows one retry), got the same result, then correctly stopped. The session is now stuck in `executing` with no path forward until the watchdog fires.

**Diagnostic confirmation**

```sql
-- Check step_index is stuck and assistant gave up
SELECT role, step_index, left(content, 200) AS content_preview, tool_calls IS NOT NULL AS called_tool
FROM agent_message
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at;
-- If all messages share the same step_index AND latest assistant row has no tool_calls → this pattern

-- Confirm the SQL returned 0 rows (check trace steps for the query used)
SELECT s.tool_calls, s.tool_results
FROM llm_trace_step s
JOIN llm_trace t ON s.trace_id = t.id
WHERE t.session_id = '<SESSION_ID>'
ORDER BY t.created_at, s.step_number;
-- Look for advancedSqlQuery tool_results showing rowCount: 0
```

**Sub-variant: `{{org_id}}` placeholder not substituted**

In this specific observed case, the LLM wrote SQL with a literal `{{org_id}}` placeholder:
```sql
SELECT id, name FROM account WHERE org_id = '{{org_id}}' AND name ILIKE '%checking%'
```
The `advancedSqlQuery` tool appends its own `org_id` filter but the LLM's WHERE clause compared against the string `'{{org_id}}'` literally, matching nothing. The data existed — the query was simply malformed.

**Fix (immediate)**

Update `SESSION_DIRECTIVE` in `backend/src/agent/prompt/constants.ts` to explicitly instruct:
> *"If a query step cannot find required data, call `completeStep` with `status: 'failed'` and a result_summary explaining what was searched and what was missing. Never leave a step without calling `completeStep`."*

For the `{{org_id}}` sub-variant, add a guard in `advancedSqlQuery` to detect and strip unsubstituted `{{...}}` placeholders before execution, or reject the query with a clear error.

**Fix (future — user clarification flow)**

The `requestClarification` tool is already implemented — see [../TOOLS_REFERENCE.md](../TOOLS_REFERENCE.md#requestclarification) for details.

**Files to change**
- `backend/src/agent/prompt/constants.ts` — add `completeStep`-on-failure rule to `SESSION_DIRECTIVE`
- `backend/src/agent/tools/analyticsQuery.ts` — detect unsubstituted `{{...}}` in query string

---

### 7. Action Step Creates No Actions

**Symptoms**
- `status = 'completed'` (session completed suspiciously fast)
- `pending_actions_count = 0`
- Plan has an action step; it shows `status = 'completed'`
- No rows in `pending_action` for the session

**Root Cause**

`ActionBuilderRegistry` intercepted the action step (because `matches()` returned `true`), but found no data to act on — `accumulated_context` was missing the key the builder expected (e.g. `match_results` for reconciliation). The builder created 0 pending actions and the hybrid dispatcher slid the session forward to completed.

This happens when the LLM's analysis step called `completeStep` but omitted `accumulated_context_update`, or wrote the results under a different key name.

**Diagnostic confirmation**

```sql
-- Check what's in accumulated_context
SELECT accumulated_context
FROM agent_session
WHERE id = '<SESSION_ID>';
-- If missing 'match_results' (reconciliation) or 'predictions' key → this pattern

-- Check the analysis step's result_summary
SELECT plan
FROM agent_session
WHERE id = '<SESSION_ID>';
-- Look at step index N-1 (analysis step) result_summary — did it describe finding data?
```

**Fix**

The analysis step's `SESSION_DIRECTIVE` instructs: *"pass the FULL structured tool output in `accumulated_context_update` under a descriptive key"*. If this isn't happening, strengthen the template's `system_prompt` to explicitly name the key (e.g., `"Store the full match_results array under the key 'match_results' in accumulated_context_update"`).

**Files to check**
- `backend/src/agent/builders/ActionBuilderRegistry.ts` — verify `matches()` only returns `true` when required data exists
- Template `system_prompt` — add explicit `accumulated_context_update` key instruction

---

### 8. Bulk Approve Skips Execution

**Symptoms**
- Pending actions are marked `approved` but the database records are not updated
- `execution_result` is null; `execution_error` is null on the `pending_action` rows
- Posting `reconciliation_status` or `credit_account_id` unchanged after bulk approve

**Root Cause**

`bulkApproveByConfidence` previously used `prisma.pending_action.updateMany` which sets `status = 'approved'` in bulk but bypasses the executor registry. Executors only run when `PendingActionService.resolvePendingAction()` is called per-action (which looks up the executor and calls `execute()`).

**Fix**

`PendingActionService.bulkApproveByConfidence` must iterate and call `resolvePendingAction` for each matching action, not use `updateMany`.

**Diagnostic confirmation**

```sql
-- Check if pending actions are approved but not executed
SELECT id, action_type, status, execution_result, execution_error
FROM pending_action
WHERE session_id = '<SESSION_ID>'
  AND status = 'approved'
  AND execution_result IS NULL
  AND execution_error IS NULL;
-- If rows exist → bulk approve bypassed executors
```

---

## Investigative Tips

### "How do I see what prompt the LLM received?"

The system prompt is never stored to the database — it is assembled fresh on every request. To inspect it:

1. Check `llm_trace.prompt_tokens` — if very low (< 1000), the system prompt was stripped
2. Check `agent_message` where `role = 'user'` ordered by `created_at` — these are the user turns
3. Call `GET /api/agent/sessions/:id/trace` for the full assembled timeline
4. To see the exact system prompt: add a temporary `console.log(allMessages[0].content)` in `AgentService` around the `allMessages` construction (look for the system message insertion before the `streamText` / `generateText` call)

### "Tool results are not in the LLM's next response"

The LLM sees tool results as `tool` role messages in `allMessages`. If the LLM appears to ignore results:

1. Check `agent_message.tool_results` — are they being written after the call?
2. Check `llm_trace_step.tool_results` — is the result preview populated?
3. Large tool results (e.g. full SQL result sets) may cause truncation. `analyticsQuery` returns a row limit and column metadata to mitigate this.

### "LLM not calling createPlan (system prompt missing)"

Check that `allMessages[0].role === 'system'` includes both the session context block and the `SESSION_DIRECTIVE` text. In `handleStreamingRequest`, the `messages` parameter passed to `streamText` should be `allMessages` — **not** a separate `system:` parameter alongside a different `messages` array. If `tools_called` is empty in `llm_trace`, verify `sessionId` was passed through to `ToolManager.getUnifiedTools`.

---

## Adding a New Pattern

When you encounter a session failure not covered above:

1. Run the diagnostic queries and note which symptoms are present
2. Trace through the code path to find the root cause
3. Copy the template below and fill it in
4. Add a row to the Pattern Index table at the top

```markdown
### N. Pattern Name

**Observed**: YYYY-MM-DD, session `ses_xxxxx`

**Symptoms**
- status = '...'
- ...

**Root Cause**
...

**Diagnostic confirmation**
\`\`\`sql
-- query that confirms this pattern
\`\`\`

**Fix**
...

**Files to change**
- ...
```

---

## Related Docs

- [../SESSION_LIFECYCLE.md](../SESSION_LIFECYCLE.md) — full session lifecycle and state machine
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — system architecture and file map
- [../DATA_MODELS.md](../DATA_MODELS.md) — session table schemas
- [../OBSERVABILITY.md](../OBSERVABILITY.md) — trace review UI and diagnostic SQL
- Session tables: `agent_session`, `agent_message`, `llm_trace`, `pending_action`
