# Fabriq Agent — Observability

**Last Updated**: 2026-04-04  
**File**: `services/SessionTraceService.ts`

---

## What Gets Logged

Every agent LLM call is logged asynchronously (fire-and-forget) to PostgreSQL after the response is returned. Logging is non-blocking and does not affect agent performance.

Per call (`llm_trace`):
- User question, query type, LLM model
- Token counts (prompt / completion / total), duration
- All tool names called
- Full response text, error messages

Per tool-call round within a call (`llm_trace_step`):
- Tool calls with args
- Tool results (preview)
- SQL queries extracted from tool calls

See [DATA_MODELS.md](./DATA_MODELS.md#llm_trace-and-llm_trace_step) for full schema.

---

## Architecture

```
AgentService
    │
    ▼  (fire-and-forget after response returned)
SessionTraceService.logTrace()
    │
    ▼
PostgreSQL: llm_trace + llm_trace_step tables
    │
    ▼
Settings > LLM Traces  (Super Admin UI)
```

---

## Trace Review UI

Navigate to **Settings > LLM Traces** (Super Admin only).

1. List view — traces sorted by newest first, filterable by query type, status, model
2. Click a trace row → detail page with summary, response, error (if any)
3. Expand individual steps → SQL queries and tool calls
4. Add feedback in the feedback section → click Save

Only the `feedback` field is editable — all other fields are read-only.

---

## Diagnostic SQL Queries

```sql
-- Recent traces with errors
SELECT id, question, error_message, created_at
FROM llm_trace
WHERE status = 'error'
ORDER BY created_at DESC
LIMIT 20;

-- Token usage by model
SELECT llm_model, COUNT(*) as traces,
       AVG(total_tokens) as avg_tokens,
       AVG(duration_ms) as avg_duration_ms
FROM llm_trace
GROUP BY llm_model;

-- Traces for a specific session
SELECT id, question, status, tools_called, total_tokens, duration_ms, created_at
FROM llm_trace
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;

-- Step-level SQL query analysis
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

-- Traces with feedback (for prompt improvement)
SELECT id, question, feedback, query_type, status
FROM llm_trace
WHERE feedback IS NOT NULL AND feedback != ''
ORDER BY created_at DESC;
```

---

## Prompt Improvement Workflow

1. Review traces in the UI or via SQL; add `feedback` notes to notable traces
2. Query traces with feedback:
   ```sql
   SELECT id, question, feedback, query_type FROM llm_trace WHERE feedback IS NOT NULL;
   ```
3. Group by failure pattern (wrong SQL, wrong tool, hallucinated column, etc.)
4. Update prompt templates in Settings > Prompt Templates (or local `.txt` files if `USE_LOCAL_PROMPT=true`)
5. Re-run the prompt test harness to verify improvements:
   ```bash
   cd backend && npm run test:posting-prompt
   ```
6. Check new traces to confirm fix

---

## Question Classifier

**File**: `utils/questionClassifier.ts`

Classifies non-session requests as `analytical` or `transactional` before tool selection. The classification is stored in `llm_trace.query_type`.

| Classification | When | Effect |
|---|---|---|
| `analytical` | "how much", "total", "breakdown", aggregation patterns | `maxSteps = 8`, analytics tools added, analytics prompt type used |
| `transactional` | "create", "update", lookups, everything else | `maxSteps = 2`, model CRUD tools only |

The classifier is pattern-based (regex), not an LLM call. Classification errors show up as `query_type` mismatches in traces.

---

## AI Activity Logger

**File**: `utils/aiActivityLogger.ts`

Separate from trace logging — records AI tool usage decisions at a higher level (which tool was selected and why). Used for audit and billing purposes. Writes to a separate log table.
