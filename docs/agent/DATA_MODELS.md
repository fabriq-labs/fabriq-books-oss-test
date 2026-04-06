# Fabriq Agent — Data Models

**Last Updated**: 2026-04-04  
**Schema file**: `backend/prisma/schema/data.prisma`

All agent-related tables are prefixed with `agent_` except `llm_trace`, `llm_trace_step`, `pending_action`, and `prompt_template`.

---

## `prompt_template`

Stores the LLM system prompt fragments assembled by `DynamicPromptManager`. Each row is a fragment for a specific app/model/view/type combination. Multiple rows merge into a single prompt at request time.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | String | Primary key |
| `app_name` | String? | Deployment identifier (e.g. `fabriq`, `perfin`). Must match `APP_NAME` env var — templates with mismatched `app_name` are excluded |
| `model_name` | String | Prisma model this prompt applies to (e.g. `posting`, `invoice`) |
| `view_name` | String? | View name to scope this prompt further (e.g. `posting_view`) |
| `prompt_type` | String | Category: `default`, `analytics`, `reconciliation`, etc. Determines which requests load this row |
| `prompt_text` | String | The actual prompt content. Supports placeholders and conditional blocks |
| `is_default` | Boolean | `true` = base template; `false` = override/extension. Sorted first in merge (non-defaults override defaults) |
| `priority` | Int | Within the same `is_default` group, higher value wins |
| `version` | Int | Within the same priority, higher version wins |
| `context` | Json? | Optional context constraints (e.g. restrict to a specific view) |
| `created_at` | DateTime | Creation time |
| `modified_at` | DateTime | Last update time |

### Merge Order

When multiple rows match a request, `DynamicPromptManager.mergeTemplates()` sorts by:
1. `is_default DESC` — override templates first
2. `priority DESC` — higher priority wins
3. `version DESC` — latest version wins

Then joins all `prompt_text` values with `\n\n`.

### Query Filter Applied by `DynamicPromptManager`

```sql
SELECT * FROM prompt_template
WHERE view_id = (SELECT id FROM view WHERE model_name = ? AND name = ?)
  AND prompt_type IN (?, ?, ...)   -- from promptTypes array (e.g. 'analytics', 'default')
  AND (app_name = ? OR app_name IS NULL)  -- APP_NAME env var filter
ORDER BY is_default DESC, priority DESC, version DESC;
```

### Seeding

Prompt templates are seeded via the admin UI (**Settings → AI Templates → Prompt Templates tab**) or directly via SQL. They are not created by Prisma migrations.

Use `USE_LOCAL_PROMPT=true` in `.env` to load from local JSON+TXT files during development (avoids DB round-trips).

---

## `agent_template`

Pre-defined task configurations. Seeded via `backend/prisma/seed-agent-templates.sql`, not created by users.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | String | `atpl_...` prefix |
| `org_id` | String? | Null = system template (available to all orgs) |
| `name` | String | Display name e.g. "Reconcile Transactions" |
| `system_prompt` | String? | Extra instructions **prepended** to base prompt on every LLM call |
| `user_hint` | String? | Placeholder text shown in GoalSetter input box |
| `goal_model` | String? | Prisma model the agent focuses on e.g. `posting` |
| `default_mode` | String | `supervised` / `semi_auto` / `autonomous` |
| `icon` | String? | Lucide icon name for UI card |
| `focus_models` | String[] | Model schemas to include in system prompt. Empty = use `RELATED_MODELS` constant |
| `allowed_tools` | String[] | Tools the LLM may call (besides core session tools). Empty = use `getToolsForModel()` fallback |

`focus_models` and `allowed_tools` are the security ceiling: a template can only reference models the user has permission to see, and request context cannot extend the tool list beyond what the template declares.

---

## `agent_session`

One row per user goal. Central record tracking all session state.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | String | `ses_...` prefix |
| `org_id` | String | Multi-tenancy |
| `user_id` | String | Who started the session |
| `goal` | String | Raw goal text typed by the user |
| `name` | String? | Auto-generated 4–6 word title (set after `createPlan` fires) |
| `goal_model` | String? | Inherited from template e.g. `posting`, `invoice` |
| `template_id` | String? | FK to `agent_template` |
| `plan` | Json? | Array of `PlanStep` objects (set by `createPlan` tool) |
| `status` | String | See [Session States](#session-states) |
| `current_step_index` | Int? | Zero-based index into `plan` |
| `accumulated_context` | Json? | Data bag passed between steps |
| `pending_actions_count` | Int | Total actions queued this session |
| `completed_actions_count` | Int | Actions resolved (approved or rejected) |
| `mode` | String | `supervised` / `semi_auto` / `autonomous` |
| `started_at` | DateTime | Session creation time |
| `last_active_at` | DateTime | Auto-updated on each interaction; used by timeout watchdog |
| `completed_at` | DateTime? | When status became `completed` or `failed` |

### Session States

```
planning → executing → awaiting_approval ⇄ executing → completed
                                                     ↘ failed
```

| State | When set |
|-------|---------|
| `planning` | Session created |
| `executing` | First LLM call starts; also restored after all pending actions resolved |
| `awaiting_approval` | Agent queued actions via `queueActions` tool or deterministic builder |
| `completed` | All plan steps done and all pending actions resolved |
| `failed` | Unhandled error in AgentService or watchdog timeout |

### `PlanStep` JSON Structure

Each element in `agent_session.plan`:

```typescript
interface PlanStep {
  index: number;                    // Zero-based position in the plan
  type: 'query' | 'analysis' | 'action' | 'report';
  title: string;                    // LLM-written, human-readable
  description: string;              // Longer description of what this step does
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  requires_approval: boolean;
  result_summary?: string;          // Written by LLM at completeStep time
  completed_at?: string;            // ISO timestamp
}
```

Step types:
- `query` — LLM fetches data using SQL or search tools
- `analysis` — LLM processes fetched data (e.g. calls `suggestReconciliationMatches`)
- `action` — creates pending actions (via `queueActions` tool or deterministic builder)
- `report` — LLM writes a final summary (or deterministic formatter does it)

### `accumulated_context` Patterns

This JSON object is the session's "memory" — query steps write results here, action steps read them.

```json
// After a query step:
{
  "unmatched_count": 23,
  "hdfc_account_id": "acco_xxx",
  "postings": [...]
}

// After an analysis step (reconciliation):
{
  "match_results": [
    { "posting_id": "post_xxx", "best_match": { "type": "payment_receipt", "id": "payr_yyy", "confidence": "high" }, "alternatives": [...] },
    ...
  ]
}

// After categorization step:
{
  "predictions": [
    { "posting_id": "post_xxx", "predicted_account_id": "acco_zzz", "confidence": 0.87, "reasoning": "..." },
    ...
  ]
}

// Clarification record (when requestClarification is implemented):
{
  "clarifications": [
    { "step_index": 0, "question": "Which account?", "answer": "HDFC Current", "context": { "searched_for": "checking" } }
  ]
}
```

---

## `agent_message`

Every message in a session — user turns, assistant responses, tool call/result pairs.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | String | PK |
| `session_id` | String | FK to `agent_session` |
| `role` | String | `user` / `assistant` / `tool` |
| `content` | String | Message text |
| `tool_calls` | Json? | `[{toolName, toolCallId, args}]` for assistant turns |
| `tool_results` | Json? | `[{toolCallId, toolName, result}]` for tool response turns |
| `step_index` | Int? | Which plan step this message was generated in |
| `created_at` | DateTime | |

These rows are the **session memory**. On each subsequent LLM call, they are loaded (last 50) and prepended to `allMessages` in AI SDK format, replaying the tool call / result cycle so the LLM has full context.

---

## `pending_action`

One row per proposed financial action awaiting human review.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | String | PK |
| `org_id` | String | Multi-tenancy |
| `session_id` | String? | FK to `agent_session` (nullable — actions can exist outside sessions) |
| `batch_id` | String? | Groups related actions from one `queueActions` call e.g. `ses_abc-step-2` |
| `batch_total` | Int? | Total actions in this batch |
| `created_by` | String | User who queued it |
| `action_type` | String | e.g. `reconcile_posting`, `categorize_transaction`, `create_posting` |
| `title` | String | Human-readable action title |
| `description` | String? | Additional detail |
| `payload` | Json | Action-specific parameters (posting IDs, predicted accounts, amounts, etc.) |
| `confidence` | String | `high` / `medium` / `low` |
| `confidence_score` | Float? | 0.0–1.0 |
| `on_approve` | String | `execute_immediately` — run executor right away on approval |
| `status` | String | `pending` → `approved` / `rejected` → `executed` |
| `execution_result` | Json? | Written by executor after successful approval |
| `execution_error` | String? | Error message if executor failed |
| `resolved_by` | String? | User who approved/rejected |
| `resolved_at` | DateTime? | When action was resolved |

### Payload Shapes by `action_type`

**`categorize_transaction`**:
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

**`reconcile_posting`**:
```json
{
  "posting_id": "post_abc",
  "matched_reference": "payment_receipt:payr_xxx:REC-001",
  "match_type": "payment_receipt",
  "matched_id": "payr_xxx",
  "confidence": "high",
  "amount": 60000
}
```

**`create_posting`**:
```json
{
  "account_id": "acco_bank",
  "credit_account_id": "acco_vendor",
  "amount": 15000,
  "description": "Vendor payment",
  "value_date": "2024-03-15"
}
```

---

## `llm_trace` and `llm_trace_step`

Observability tables. Written asynchronously (fire-and-forget) after every LLM call.

### `llm_trace` — one row per `generateText`/`streamText` call

| Column | Purpose |
|--------|---------|
| `id` | `llmt_...` prefix |
| `session_id` | FK to `agent_session` |
| `org_id` | Multi-tenancy |
| `user_id` | Who triggered the call |
| `model_name` | Business model context e.g. `posting` |
| `query_type` | `analytical` or `transactional` |
| `question` | The user's question |
| `llm_model` | LLM model name e.g. `gemini-2.0-flash` |
| `prompt_tokens` | Tokens in prompt |
| `completion_tokens` | Tokens in completion |
| `total_tokens` | Total |
| `duration_ms` | Total execution time |
| `steps_count` | Number of tool-call rounds |
| `tools_called` | String[] of tool names used |
| `response_text` | Full agent response |
| `status` | `success` or `error` |
| `error_message` | Error details if failed |
| `feedback` | Human feedback for prompt improvement (editable in trace UI) |

### `llm_trace_step` — one row per tool-call round within a call

| Column | Purpose |
|--------|---------|
| `trace_id` | FK to `llm_trace` |
| `step_number` | 1-based |
| `tool_calls` | `[{toolName, args}]` |
| `tool_results` | `[{toolName, result_preview}]` |
| `sql_queries` | `[{sql, description, reasoning}]` extracted from tool calls |
| `status` | `success` or `error` |

See [OBSERVABILITY.md](./OBSERVABILITY.md) for diagnostic queries and the trace review UI.
