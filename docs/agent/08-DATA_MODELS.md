# Fabriq Agent — Data Models & Multi-Tenancy

**Audience**: Reference — consult while reading the narrative docs or when
writing SQL/queries against agent tables.
**Schema file**: `backend/prisma/schema/data.prisma`

All agent-related tables are prefixed with `agent_` except `llm_trace`,
`llm_trace_step`, `pending_action`, and `prompt_template`.

---

## `prompt_template`

Stores the LLM system prompt fragments assembled by `DynamicPromptManager`
(see [04-PROMPT_SYSTEM.md — Layer 2](./04-PROMPT_SYSTEM.md#layer-2-base-prompt-from-dynamicpromptmanager-prompt_template)).
Each row is a fragment for a specific app/model/view/type combination.
Multiple rows merge into a single prompt at request time.

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

When multiple rows match a request, `DynamicPromptManager.mergeTemplates()`
sorts by:
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

Prompt templates are seeded via the admin UI (**Settings → AI Templates →
Prompt Templates tab**) or directly via SQL. They are not created by Prisma
migrations.

Use `USE_LOCAL_PROMPT=true` in `.env` to load from local JSON+TXT files during
development (avoids DB round-trips).

---

## `agent_template`

Pre-defined task configurations. Seeded via
`backend/prisma/seed-agent-templates.sql`, not created by users. See
[02-ARCHITECTURE.md — Agent Template Management](./02-ARCHITECTURE.md#agent-template-management)
for the admin UI and inventory.

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

`focus_models` and `allowed_tools` are the security ceiling: a template can
only reference models the user has permission to see, and request context
cannot extend the tool list beyond what the template declares.

---

## `agent_model_tool_config`

DB-driven tool assignment per model, replacing the old hardcoded
`getToolsForModel()` switch. Read via
`backend/src/agent/agentModelToolConfigCache.ts` (in-memory cache, warmed at
startup by `warmAgentModelToolCache()` in `index.ts`). See
[05-TOOLS.md — Tool Resolution](./05-TOOLS.md#tool-resolution-agent_model_tool_config)
for how `ToolManager` consumes this table.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | String | `amtc_...` prefix |
| `model_name` | String | Unique. Prisma model this config applies to (e.g. `posting`, `invoice`), or the special value `_fallback` |
| `display_name` | String | Human-readable label for the admin UI |
| `description` | String? | Admin-facing notes on what this config is for |
| `model_tools` | String[] | Tool names (must exist in `AGENT_TOOL_CATALOG`, see [05-TOOLS.md](./05-TOOLS.md#agent_tool_catalog)) granted in addition to `CORE_SESSION_TOOLS` |
| `include_analytics_tools` | Boolean | Whether to also grant `analyticsQuery`/`getAnalyticsContext` |
| `is_active` | Boolean | Inactive rows are ignored by the resolver |
| `sort_order` | Int | Display order in admin UI |
| `created_at` / `modified_at` | DateTime | Audit timestamps |
| `created_by` / `modified_by` / `assigned_to` | String? | Audit fields |

### `_fallback` row

A row with `model_name = '_fallback'` (constant `FALLBACK_MODEL_NAME` in
`toolRegistry.ts`) is used by `resolveConfigRow()` when no row matches the
requested `model_name`. Seeded by `seedDefaultModelToolConfigs()` /
`backend/prisma/seed-agent-model-tools.sql`.

### Admin UI

**Settings → AI Templates → Model Tools** (`AgentModelToolsList.tsx` /
`AgentModelToolsForm.tsx`, backed by `frontend-1/src/api/agentModelToolsApi.ts`
and the `agent_model_tool_config_view`) lets admins edit `model_tools` and
`include_analytics_tools` per model without a deploy.

---

## `agent_session`

One row per user goal. Central record tracking all session state. Full state
machine: [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md).

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
| `status` | String | `planning` / `executing` / `awaiting_approval` / `awaiting_input` / `completed` / `failed` / `paused` (reserved) / `abandoned` (reserved) |
| `current_step_index` | Int? | Zero-based index into `plan` |
| `accumulated_context` | Json? | Data bag passed between steps |
| `clarification_request` | Json? | `{ question, context, step_index }` — set while `status = 'awaiting_input'` |
| `pending_actions_count` | Int | Total actions queued this session |
| `completed_actions_count` | Int | Actions resolved (approved or rejected) |
| `mode` | String | `supervised` / `semi_auto` / `autonomous` |
| `started_at` | DateTime | Session creation time |
| `last_active_at` | DateTime | Auto-updated on each interaction; used by timeout watchdog |
| `completed_at` | DateTime? | When status became `completed` or `failed` |

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

This JSON object is the session's "memory" — query steps write results here,
action steps read them.

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

// Clarification record (requestClarification — see 03-SESSION_LIFECYCLE.md):
{
  "clarifications": [
    { "step_index": 0, "question": "Which account?", "answer": "HDFC Current", "context": { "searched_for": "checking" }, "input_schema": null }
  ]
}
```

---

## `agent_message`

Every message in a session — user turns, assistant responses, tool
call/result pairs.

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

These rows are the **session memory**. On each subsequent LLM call, they are
loaded (last 50) and prepended to `allMessages` in AI SDK format, replaying
the tool call / result cycle so the LLM has full context — see
[03-SESSION_LIFECYCLE.md — Message History Reconstruction](./03-SESSION_LIFECYCLE.md#message-history-reconstruction).
A clarification answer is persisted as a `role: 'user'` row the same way.

---

## `pending_action`

One row per proposed financial action awaiting human review. Lifecycle:
[06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md).

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

Observability tables. Written asynchronously (fire-and-forget) after every
LLM call. Full diagnostic workflow: [11-OBSERVABILITY.md](./11-OBSERVABILITY.md).

### `llm_trace` — one row per `generateText`/`streamText` call

| Column | Purpose |
|--------|---------|
| `id` | `llmt_...` prefix |
| `session_id` | FK to `agent_session` |
| `org_id` | Multi-tenancy |
| `user_id` | Who triggered the call |
| `model_name` | Business model context e.g. `posting`, `holding` (from request `context.modelName`) |
| `view_name` | View that scoped the prompt e.g. `holding_view` (from `context.viewName`) |
| `record_id` | Specific business record when the call is record-scoped (from `context.recordId`). Example: Options Income position analysis sets `model_name=holding` and `record_id=<holding_id>` so all turns for that position are queryable; instrument is reachable via `holding.instrument_id`. Often null for list/chat/batch paths that only pass `model_name`. |
| `query_type` | `analytical` or `transactional` (see [04-PROMPT_SYSTEM.md — Question Routing](./04-PROMPT_SYSTEM.md#question-routing-conversational-chat)) |
| `question` | The user's question |
| `llm_model` | LLM model ID actually used (provider-dependent — see [10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md)) |
| `prompt_tokens` | Tokens in prompt |
| `completion_tokens` | Tokens in completion |
| `total_tokens` | Total |
| `cached_prompt_tokens` | Input tokens served from the provider prompt cache at a discount (OpenAI `cachedPromptTokens` / Anthropic `cacheReadInputTokens` / Google `cachedContentTokenCount`); `null` when the provider reports no caching. Summed across steps. See [11-OBSERVABILITY.md](./11-OBSERVABILITY.md#prompt-cache-accounting) |
| `cache_creation_tokens` | Input tokens written to the cache at a premium (Anthropic `cacheCreationInputTokens`); `null` for providers with no distinct write metric |
| `cost_usd` | Provider-reported call cost in USD (e.g. OpenRouter `usage.cost` from the raw response body); `null` when the provider does not return a cost |
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
| `cached_prompt_tokens` / `cache_creation_tokens` | Per-step prompt-cache counts (same semantics as `llm_trace`) |
| `tool_calls` | `[{toolName, args}]` |
| `tool_results` | `[{toolName, result_preview}]` |
| `sql_queries` | `[{sql, description, reasoning}]` extracted from tool calls |
| `status` | `success` or `error` |

---

## Multi-Tenancy

Every business table carries `org_id`. The agent must never let a query,
prediction, or pending action cross an org boundary — this is enforced at
multiple layers, not just by convention.

### Worked example: two orgs, same account name

Org A (`org_a`) and Org B (`org_b`) each have their own chart of accounts,
and both happen to name an expense account **"Office Expenses"**:

```
account.id='acco_a_office', account.org_id='org_a', account.name='Office Expenses'
account.id='acco_b_office', account.org_id='org_b', account.name='Office Expenses'
```

If a categorization session for Org A's posting predicted `acco_b_office`
(e.g. because a fuzzy/historical match incorrectly matched across orgs), the
executor would link an Org A posting to an Org B account — a tenancy
violation. The layers below exist specifically to prevent this class of bug.

### Enforcement layers

| Layer | Mechanism |
|---|---|
| **`getAnalyticsContext`** ([05-TOOLS.md](./05-TOOLS.md#getanalyticscontext)) | Returns the schema description with the caller's `org_id` baked in, so the LLM writes `org_id = '<the real org>'` from the start |
| **`analyticsQuery` validation** ([05-TOOLS.md](./05-TOOLS.md#analyticsquery)) | `normalizeAnalyticsOrgId()` rewrites any literal `org_id = '...'` in the SQL to the **authenticated** `org_id`, even if the LLM hardcoded a different (e.g. stale or hallucinated) value. Separately, `validateQuery()` requires every table in `BUSINESS_TABLES` to have an `org_id` filter, and rejects unsubstituted `{{org_id}}`/`{{...}}` placeholders |
| **`categorizePostings` / `categorizeTransactionBatch`** ([05-TOOLS.md — ERP Handler Registry](./05-TOOLS.md#erp-handler-registry)) | Historical corpus (`fetchHistoricalMappings`) and account lists are fetched scoped to `auth.user.org_id`; predictions can only reference accounts from that org |
| **`suggestReconciliationMatches`** | Candidate invoices/receipts are queried with an `org_id` filter, so a posting in Org A can never be matched to an Org B invoice |
| **Executors** ([06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md)) | `pending_action.org_id` is set at creation time from the session's `org_id`; executors operate on records already scoped to that org |

### Tables exempt from `org_id` filtering

`analyticsQuery`'s `METADATA_TABLES` set (and the project-wide
`METADATA_MODELS_WITHOUT_ORG_FILTER` constant — see root `CLAUDE.md`) lists
system/metadata tables that either have no `org_id` column or are
intentionally global:

```
workflow_flow, workflow_state, workflow_action,
view, permission, role, role_user, role_view,
org, user, prompt_template, source_system
```

`currency` is a special case: rows use `org_id = 'system'` and are visible to
all tenants — do not add an `org_id` filter for currency queries.

`BUSINESS_TABLES` (require `org_id`) includes: `item_master`, `supplier`,
`customers`, `invoice`, `invoice_line_item`, `purchase_requisition`, `item`,
`purchase_order`, `purchase_order_item`, `sales_order`, `sales_order_item`,
`delivery_challan`, `credit_note`, `quote`, `account`, `posting`,
`payment_receipt`, `workflow_instance`, `workflow_history`,
`employee_master`, `department`, `cost_center`, `location`,
`project_master`, `budget_period`, `budget_line`, `coa`, `entity`.

---

## `chat_thread`

Persists conversational chat history (the `useChat` UI in
[15-CONVERSATIONAL_CHAT.md](./15-CONVERSATIONAL_CHAT.md)) across page reloads
and devices. Read/written via `backend/src/lib/chat-store.ts` and
`backend/src/routes/chat.ts` (`/api/chat/*`).

| Column | Type | Purpose |
|--------|------|---------|
| `id` | String | Chat/thread id, also used as the `useChat` `chatId` |
| `user_id` | String | Owner of the thread |
| `title` | String | Defaults to `"New Financial Inquiry"`; can be renamed |
| `messages` | Json (JSONB) | Full message array (`UIMessage[]`), including tool invocations |
| `metadata` | Json | Free-form (e.g. page context at thread creation) |
| `model_used` | String? | Last model used for this thread |
| `total_tokens_used` | Int | Running token count across the thread |
| `created_at` / `updated_at` | DateTime | Audit timestamps |
| `created_by` / `modified_by` / `assigned_to` | String? | Audit fields |

**No `org_id` column** — `chat_thread` is **not** in `BUSINESS_TABLES` or the
exempt-metadata list above; it is scoped by `user_id` instead (a thread
belongs to one user, not shared within an org). `@@index([user_id])` backs
the `GET /api/chat` "list my threads" query. This is a deliberate exception to
the org-scoping convention — chat history is personal, not org-shared data.

---

## What's Next

- **09-API_REFERENCE.md** — HTTP endpoints that read/write these tables
- **11-OBSERVABILITY.md** — querying `llm_trace`/`llm_trace_step` for a
  specific session
