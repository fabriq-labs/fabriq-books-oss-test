# Fabriq Agent — Observability

**Audience**: Anyone diagnosing "why did the agent do that?" — wrong SQL,
wrong tool choice, slow responses, or prompt regressions.
**Primary files**: `services/SessionTraceService.ts`, `utils/llmTraceLogger.ts`,
`utils/aiActivityLogger.ts`

---

## What Gets Logged

Every agent LLM call (`generateText`/`streamText`/`generateObject`) is logged
asynchronously (fire-and-forget, after the response is returned) by
`llmTraceLogger.logTrace()`. Logging never blocks or fails the user-facing
response.

Per call (`llm_trace`):
- `question`, `query_type` (from `classifyQuestion()`), `llm_model` (from
  `getModelId(task)` — see [10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md))
- Token counts (`prompt_tokens` / `completion_tokens` / `total_tokens`),
  `duration_ms`
- `tools_called` (all tool names used across all steps)
- `response_text`, `status` (`success`/`error`), `error_message`

Per tool-call round within a call (`llm_trace_step`):
- `tool_calls` (with args), `tool_results` (preview)
- `sql_queries` extracted from `analyticsQuery`/`advancedSqlQuery` calls
  (`{ sql, description, reasoning }`)

Full column reference:
[08-DATA_MODELS.md — llm_trace and llm_trace_step](./08-DATA_MODELS.md#llm_trace-and-llm_trace_step).

---

## Architecture

```
AgentService.handleRequest() / handleRequestStream()
    │
    ▼ (fire-and-forget after response returned)
llmTraceLogger.logTrace()
    │
    ▼
PostgreSQL: llm_trace + llm_trace_step
    │
    ▼
Settings → LLM Traces  (Super Admin UI)
```

`AgentService` calls `logTrace()` from six separate code paths — the
non-streaming, streaming, and session-continuation variants of
`handleRequest`/`handleRequestStream` each log independently, including error
paths (so a thrown `getModel()` config error still produces an `llm_trace`
row with `status: 'error'`).

---

## Session Trace (`SessionTraceService`)

**File**: `services/SessionTraceService.ts`
**Endpoint**: `GET /api/agent/sessions/:id/trace` ([09-API_REFERENCE.md](./09-API_REFERENCE.md#get-apiagentsessionsidtrace))

Assembles a single `SessionTrace` object for one `agent_session`:

```typescript
interface SessionTrace {
  session: { id, goal, goal_model, mode, status, started_at, completed_at, duration_ms };
  plan: Array<{ index, type, title, description, status, result_summary }>;
  timeline: Array<{ type: 'message' | 'llm_call' | 'action_queued' | 'action_resolved', timestamp, ... }>;
  usage: { total_llm_calls, total_prompt_tokens, total_completion_tokens, total_duration_ms, tools_used, sql_queries_count };
  actions: Array<{ id, action_type, title, confidence, status, execution_result, execution_error, ... }>;
}
```

The `timeline` interleaves `agent_message` rows, `llm_trace` rows (as
`llm_call` entries), and `pending_action` queue/resolve events into a single
chronological feed — this is the view used to answer "what did the agent do,
in order, for this session?" without joining tables manually.

---

## Trace Review UI

Navigate to **Settings → LLM Traces** (Super Admin only).

1. List view — traces sorted by newest first, filterable by `query_type`,
   `status`, `llm_model`
2. Click a trace row → detail page with `question`, `response_text`,
   `error_message` (if any)
3. Expand individual steps → `sql_queries` and `tool_calls`
4. Add notes in the `feedback` field → Save

`feedback` is the only editable field — everything else is a read-only
record of what actually happened.

---

## Diagnostic SQL Queries

Per [CLAUDE.md](../../CLAUDE.md) — SELECT only, via `psql`:

```sql
-- Recent traces with errors
SELECT id, question, error_message, created_at
FROM llm_trace
WHERE status = 'error'
ORDER BY created_at DESC
LIMIT 20;

-- Token usage by model
SELECT llm_model, COUNT(*) AS traces,
       AVG(total_tokens) AS avg_tokens,
       AVG(duration_ms) AS avg_duration_ms
FROM llm_trace
GROUP BY llm_model;

-- Full trace for one session, in order
SELECT id, question, status, tools_called, total_tokens, duration_ms, created_at
FROM llm_trace
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;

-- Step-level SQL the agent actually ran
SELECT t.question, s.step_number, s.sql_queries
FROM llm_trace_step s
JOIN llm_trace t ON s.trace_id = t.id
WHERE s.sql_queries IS NOT NULL
ORDER BY t.created_at DESC
LIMIT 50;

-- Slow traces (> 10s)
SELECT id, question, duration_ms, steps_count, llm_model
FROM llm_trace
WHERE duration_ms > 10000
ORDER BY duration_ms DESC;

-- Traces with reviewer feedback (for prompt improvement)
SELECT id, question, feedback, query_type, status
FROM llm_trace
WHERE feedback IS NOT NULL AND feedback != ''
ORDER BY created_at DESC;
```

`llm_trace` and `llm_trace_step` are exempt from `org_id` filtering for
debugging purposes during local development, but **production diagnostic
queries should still filter by `org_id`** if cross-tenant data must not
appear in the same result set — `llm_trace.org_id` is populated from the
calling user's session.

---

## Prompt Improvement Workflow

1. Review traces in the UI or via SQL; add `feedback` notes to notable traces
   (e.g. "queried `account` without `org_id` filter — caught by validator but
   wasted a step")
2. Query traces with feedback:
   ```sql
   SELECT id, question, feedback, query_type FROM llm_trace WHERE feedback IS NOT NULL;
   ```
3. Group by failure pattern — wrong SQL, wrong tool, hallucinated column,
   `match_results` not saved to `accumulated_context` (breaks the
   [hybrid dispatcher](./06-BUILDERS_AND_EXECUTORS.md#the-hybrid-dispatcher)),
   etc.
4. Update the relevant `prompt_template` row (Settings → AI Templates →
   Prompt Templates, or local `.txt`/`.json` files if `USE_LOCAL_PROMPT=true`
   — see [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md))
5. Re-run the prompt test harness to verify ([12-TESTING.md](./12-TESTING.md)):
   ```bash
   cd backend && npm run test:posting-prompt
   ```
6. Check new traces (filter `created_at > <deploy time>`) to confirm the fix
   actually changed behavior

---

## AI Activity Log (`ai_activity_log`)

**File**: `utils/aiActivityLogger.ts`

A separate, higher-level audit table — **not** one of the `agent_*`/
`llm_trace*` tables covered in [08-DATA_MODELS.md](./08-DATA_MODELS.md). Each
row records one AI *decision* (e.g. "categorized posting X as Food & Dining
with 0.93 confidence, applied=true") rather than one LLM API call: `org_id`,
`activity_type`, `model_name`, `record_id`, `llm_model`, token/step counts,
`confidence_score`, `prediction`, `applied`, `reasoning`. Used for audit and
billing reporting rather than prompt debugging — for prompt/tool-call
debugging, use `llm_trace`/`llm_trace_step` above.

---

## What's Next

- **12-TESTING.md** — the prompt test harness referenced in step 5 above, and
  how E2E session tests stub `getModel()`
