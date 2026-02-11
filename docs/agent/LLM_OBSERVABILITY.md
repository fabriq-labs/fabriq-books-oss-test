# LLM Observability — Trace Review UI

## Overview

The LLM Trace Review UI is a super-admin-only settings module for reviewing AI agent execution traces. Every agent request is logged to PostgreSQL with step-level detail, and this UI allows reviewing traces, inspecting SQL queries and tool calls, and providing feedback for prompt improvement.

**What's logged per trace:**
- User question, query type, LLM model used
- Token counts (prompt, completion, total), duration
- Full response text, error messages
- Individual steps with tool calls, tool results, and SQL queries

## Architecture

```
User Question
    |
    v
AgentService (backend/src/services/agent/)
    |
    v
llm-trace-logger (fire-and-forget)
    |
    v
PostgreSQL: llm_trace + llm_trace_step tables
    |
    v
Settings > LLM Traces (review UI)
```

Logging is non-blocking. The trace logger writes asynchronously after the agent response is returned to the user.

## Schema Reference

### `llm_trace`

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(50) | PK, prefix `llmt_` |
| created_at | TIMESTAMPTZ | When the trace was created |
| org_id | TEXT | Organization ID (multi-tenant) |
| user_id | TEXT | User who triggered the agent |
| session_id | TEXT | Chat session ID |
| model_name | TEXT | Business model context (e.g., `posting`) |
| view_name | TEXT | View used for the query |
| record_id | TEXT | Related record ID |
| query_type | TEXT | `analytical` or `transactional` |
| question | TEXT | The user's question |
| llm_model | TEXT | LLM model name (e.g., `gemini-2.0-flash`) |
| prompt_tokens | INT | Tokens in the prompt |
| completion_tokens | INT | Tokens in the completion |
| total_tokens | INT | Total tokens used |
| duration_ms | INT | Total execution time |
| steps_count | INT | Number of agentic steps |
| tools_called | TEXT[] | Array of tool names used |
| response_text | TEXT | Full agent response |
| status | TEXT | `success` or `error` |
| error_message | TEXT | Error details if failed |
| feedback | TEXT | Human feedback for prompt improvement |

### `llm_trace_step`

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(50) | PK, prefix `llms_` |
| trace_id | VARCHAR(50) | FK to llm_trace |
| step_number | INT | Step sequence (1-based) |
| prompt_tokens | INT | Tokens for this step |
| completion_tokens | INT | Completion tokens for this step |
| duration_ms | INT | Step execution time |
| tool_calls | JSONB | `[{toolName, args}]` |
| tool_results | JSONB | `[{toolName, result_preview}]` |
| sql_queries | JSONB | `[{sql, description, reasoning}]` |
| response_text | TEXT | Step response |
| status | TEXT | `success` or `error` |
| error_message | TEXT | Step error details |

## UI Review Workflow

1. Navigate to **Settings > LLM Traces** (Super Admin only)
2. List view shows all traces sorted by newest first
3. Filter/search by query type, status, model, etc.
4. Click a trace row to open the detail page
5. Review summary, response, error (if any)
6. Expand individual steps to inspect SQL queries and tool calls
7. Add feedback in the feedback section and click Save

## Useful psql Queries

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

-- Traces with feedback (for prompt improvement)
SELECT id, question, feedback, query_type, status
FROM llm_trace
WHERE feedback IS NOT NULL AND feedback != ''
ORDER BY created_at DESC;

-- Slow traces (> 10s)
SELECT id, question, duration_ms, steps_count, llm_model
FROM llm_trace
WHERE duration_ms > 10000
ORDER BY duration_ms DESC;

-- Step-level SQL query analysis
SELECT t.question, s.step_number, s.sql_queries
FROM llm_trace_step s
JOIN llm_trace t ON s.trace_id = t.id
WHERE s.sql_queries IS NOT NULL
ORDER BY t.created_at DESC
LIMIT 50;
```

## Feedback Workflow

The `feedback` column on `llm_trace` is the only editable field in the UI. It's intended for:

1. **Noting prompt issues** — "Model hallucinated a column name", "Wrong join direction"
2. **Suggesting improvements** — "Should use SUM instead of COUNT for amount fields"
3. **Marking good examples** — "Perfect response, use as few-shot example"

To iterate on prompts:
1. Query traces with feedback: `SELECT * FROM llm_trace WHERE feedback IS NOT NULL`
2. Group by failure pattern
3. Update prompt templates in Settings > Prompt Templates
4. Re-run test harness (`npm run test:posting-prompt`) to verify improvements
5. Check new traces to confirm fix

## Views and Permissions

- **View ID**: `view_llm_trace_001` (llm_trace), `view_llm_trace_step_001` (llm_trace_step)
- **View names**: `llm_trace_view`, `llm_trace_step_view`
- Only `feedback` field has `"permission": "update"` — all other fields are read-only
- Assigned to Super Admin role only via `role_view` table
