# Fabriq Agent — Tools Reference

**Audience**: Anyone adding, debugging, or calling agent tools.
**Primary files**: `AgentTools.ts`, `tools/sessionTools.ts`,
`tools/analyticsQuery.ts`, `tools/categorizePostings.ts`,
`tools/suggestReconciliationMatches.ts`, `ToolManager.ts`,
`handlers/erp/registry.ts`

---

## How Tools Work

Each tool is a Vercel AI SDK `tool()` object:
- `description` — what the LLM reads to decide when to use it
- `parameters` — Zod schema validated before execution (defined in
  `GenericFunctions.ts`, `schema/SchemaGenerator.ts`, or inline)
- `execute` — async function that runs the actual logic and returns a
  structured result

The LLM receives all permitted tools simultaneously and decides which to
call. The SDK runs `execute()` and returns the result back to the LLM as a
tool result message for the next reasoning step.

---

## Tool Selection: `ToolManager.getUnifiedTools()`

**File**: `ToolManager.ts`

`getToolsForModel`, `getToolsForClassification`, and `getUnifiedTools` are
all **async** — they read from `agent_model_tool_config` via
`agentModelToolConfigCache` (in-memory, warmed at startup). Callers must
`await` them; `AgentService.ts` does so at all three call sites.

```
getUnifiedTools(modelName, auth, context, sessionId, allowedTools?)
  → model-specific tools for modelName (from getToolsForModel(), DB-driven)
  + analyticsQuery + getAnalyticsContext, if include_analytics_tools for modelName
  + [createPlan, completeStep, queueActions, requestClarification] if sessionId present
  → filter to [CORE_SESSION_TOOLS + allowedTools] if template.allowed_tools is non-empty
```

**`CORE_SESSION_TOOLS`** = `['createPlan', 'completeStep']`. These two cannot
be removed by `allowed_tools` and are always present in any session.
`queueActions` and `requestClarification` are Tier 2 — they are filterable
via `allowed_tools`.

**Deprecated tools** (still exported but not added to any new tool map):
`queueAction` (single-action variant) and `queueActionBatch` (multi-action
variant). New code uses `queueActions` only — see
[14-SHORTFALLS_AND_ROADMAP.md](./14-SHORTFALLS_AND_ROADMAP.md).

### Tool Resolution: `agent_model_tool_config`

Per-model tool assignment is no longer a hardcoded switch in `ToolManager`.
`getToolsForModel(modelName, auth, context)`:

1. Calls `resolveModelToolNames(modelName)` (from
   `agentModelToolConfigCache.ts`), which looks up the `agent_model_tool_config`
   row for `modelName` — falling back to the `_fallback` row
   (`FALLBACK_MODEL_NAME`) if no row matches or the row is `is_active = false`.
2. Builds the requested tools via `buildToolsFromNames()`, which maps each
   name in `model_tools` to a factory in `buildToolFactories()`. Unknown
   names are logged and skipped.

`getUnifiedTools` additionally calls `resolveIncludeAnalyticsTools(modelName)`
to decide whether to add `getAnalyticsContext`/`analyticsQuery` — this is the
`include_analytics_tools` column, not a hardcoded "always on".

`getToolsForClassification(classification, auth, context)` is now a thin
wrapper: `modelName = context?.modelName || 'default'`, then delegates to
`getToolsForModel`. The query-classification result no longer changes which
tools are returned at this layer.

#### `AGENT_TOOL_CATALOG`

`backend/src/agent/toolRegistry.ts` exports `AGENT_TOOL_CATALOG` — the
canonical list of tool names assignable via `agent_model_tool_config.model_tools`,
each with a `label`, `description`, and `category`
(`crud | search | analytics | session | finance | erp | other`). This is the
checkbox list shown in **Settings → AI Templates → Model Tools**
(`AgentModelToolsForm.tsx`). `getCatalogToolNames()` returns just the names —
used to validate `model_tools` entries.

> **Note**: `getAnalyticsTools()` (a separate method that used to bundle
> `getAnalyticsContext` + `analyticsQuery`) has been **removed**. Analytics
> tools are now added directly inside `getUnifiedTools` based on
> `include_analytics_tools`.

### Default Tool Configs (seeded)

Seeded by `backend/prisma/seed-agent-model-tools.sql` (re-runnable upsert by
`model_name`). Editable per-org via the admin UI without redeploying.

| `model_name` | `model_tools` | `include_analytics_tools` |
|---|---|---|
| `default` | `searchRecords`, `advancedSqlQuery`, `extractInvoiceFromFile`, `createRecord` | true |
| `posting` | `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`, `suggestReconciliationMatches`, `categorizePostings`, `runFinancialReport` | true |
| `account` | `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`, `runFinancialReport` | true |
| `invoice` | `searchRecords`, `createRecord`, `updateRecord`, `processInvoiceFromPdf`, `extractInvoiceFromFile`, `advancedSqlQuery`, `erpConnector` | true |
| `_fallback` | used when `model_name` has no matching row or the row is inactive | — |

See `backend/prisma/seed-agent-model-tools.sql` for the full list (purchase
orders/requisitions and other models), and the live `agent_model_tool_config`
table for current values — the admin UI can change these without a deploy.

Session tools (`createPlan`, `completeStep`, `queueActions`,
`requestClarification`) are added **only when `sessionId` is present**, and
are not part of `agent_model_tool_config`.

### `allowed_tools` Template Filter

When a template declares `allowed_tools` (non-empty array), the full tool set
is built first and then filtered to
`[createPlan, completeStep, ...allowedTools]`. This is the security ceiling —
request context cannot extend it.

**Example `atpl_categorise`**:
```json
allowed_tools: ["getAnalyticsContext", "analyticsQuery", "categorizePostings", "queueActions"]
```

**Example `atpl_reconcile`**:
```json
allowed_tools: ["searchRecords", "getAnalyticsContext", "analyticsQuery", "suggestReconciliationMatches", "queueActions", "requestClarification"]
```

`searchRecords` is allowlisted for performant account id lookup; unreconciled
posting QUERY steps still use `analyticsQuery` per the template prompt.

---

## Core Session Tools

These are always injected when a `sessionId` is present and cannot be removed
by `allowed_tools` (except `queueActions`/`requestClarification`, see Tier 2
note above).

### `createPlan`

**File**: `tools/sessionTools.ts`

**Purpose**: Decompose the session goal into steps. Called by LLM on the
first turn.

**Parameters**:
```typescript
{
  goal: string,        // The session goal (for context)
  steps: Array<{
    type: 'query' | 'analysis' | 'action' | 'report',
    title: string,
    description: string,
    requires_approval: boolean
  }>
}
```

**Side effects**: Writes `plan` to `agent_session`, sets `status =
'executing'`, `current_step_index = 0`, emits `session_status_changed`.

**Returns**: `{ success: true, plan, message: "Plan created. Starting step 0." }`

---

### `completeStep`

**File**: `tools/sessionTools.ts`

**Purpose**: Mark the current step complete, advance to next step, optionally
save data.

**Parameters**:
```typescript
{
  step_index: number,
  result_summary: string,                    // Human-readable summary of what was done
  accumulated_context_update?: Record<string, any>  // Data to merge into session.accumulated_context
}
```

**Side effects**: Updates `plan[step_index].status = 'completed'`, updates
`plan[step_index].result_summary`, advances `current_step_index`, merges
`accumulated_context_update` into `session.accumulated_context`. Then runs
the **hybrid dispatcher** to handle subsequent steps deterministically — see
[06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md).

**Returns**: `{ success: true, nextStep: { index, title, type } }` or
`{ success: true, message: "All steps complete" }`

---

### `queueActions`

**File**: `tools/sessionTools.ts`

**Purpose**: Create one or more `pending_action` records in a single call.
Replaces the deprecated `queueAction` (single) and `queueActionBatch`
(multiple) tools.

**Parameters**:
```typescript
{
  action_type: string,                    // e.g. "categorize_transaction"
  batch_id: string,                       // e.g. "{sessionId}-step-{stepIndex}"
  on_approve: 'execute_immediately' | 'queue_for_batch' | 'notify_only',
  actions: Array<{
    title: string,
    description?: string,
    payload: Record<string, any>,
    confidence: 'high' | 'medium' | 'low',
    confidence_score?: number             // 0.0–1.0
  }>                                      // min 1 item; use single-item array for one action
}
```

**Side effects**: Creates `pending_action` records, increments
`pending_actions_count`, emits `action_queued` (×N) and `inbox_count_changed`
SSE events.

**Returns**: `{ success: true, actions: [{ id, title, confidence }...] }`

---

### `requestClarification`

**File**: `tools/sessionTools.ts`
**Tier**: 2 (filterable) — templates opt in by adding it to `allowed_tools`

**Purpose**: Pause the session to ask the user a clarifying question when a
query returns 0 rows due to ambiguous input (e.g. user said "checking
account" but DB has "HDFC Current"). The LLM cannot proceed without user
input.

**Parameters**:
```typescript
{
  question: string,             // Clear question for the user
  context?: Record<string, any> // Optional: searched_for, available, account_ids, etc.
  input_schema?: {              // Optional UI schema — prefer for multi-choice
    type?: 'single_select' | 'multi_select' | 'text' | 'date' | 'date_range',
    options?: { id: string, label: string }[]  // workbench shows a dropdown when ≥2
  }
}
```

**Side effects**:
- Sets `session.status = 'awaiting_input'`
- Writes `session.clarification_request = { question, context, input_schema, step_index: current_step_index }`
  (legacy `context.available` / `context.account_ids` are promoted into `input_schema.options` when omitted)
- Cancels the session timeout watchdog (user may take time to respond)

**Does NOT call `completeStep`** — the session stays on the current step.
When the user submits a response via `POST /sessions/:id/clarify`, the
clarification is injected as a `user` message and the session resumes
(continuation re-fires with the new context). Full flow:
[03-SESSION_LIFECYCLE.md — Phase 2b](./03-SESSION_LIFECYCLE.md#phase-2b-awaiting-input-requestclarification).

**When to use vs when NOT to use**:

| Situation | Action |
|---|---|
| User said "checking account", DB has "HDFC Current" and "HDFC Savings" | `requestClarification` — ambiguous name, candidates available |
| User said "March transactions", DB has no postings in March | `completeStep` with `status: 'failed'` — data genuinely missing |
| User said "the main bank account", 3 accounts exist | `requestClarification` — underspecified, user can choose |
| User said "reconcile vendor XYZ", no supplier XYZ exists | `completeStep` with `status: 'failed'` — entity doesn't exist |

---

## Analytics Tools

Always available regardless of model or template.

### `getAnalyticsContext`

**File**: `tools/analyticsContext.ts`

**Purpose**: Returns schema context, multi-tenancy rules, and relationship
descriptions to help the LLM write correct SQL. Call this before writing
complex SQL.

**Parameters**: None (uses `auth.org_id` from closure)

**Returns**: Schema description including table names, columns,
relationships, and org_id filtering rules. Multi-tenancy enforcement details:
[08-DATA_MODELS.md — Multi-Tenancy](./08-DATA_MODELS.md#multi-tenancy).

---

### `analyticsQuery`

**File**: `tools/analyticsQuery.ts`

**Purpose**: Execute a read-only SQL query with org_id enforcement.

**Parameters**:
```typescript
{
  query: string   // SELECT-only SQL. Must include org_id filter.
}
```

**Validation**: Rejects non-SELECT queries. Validates that `org_id` filter is
present. Detects and rejects unsubstituted `{{...}}` placeholders.

**Returns**: `{ data: rows[], columns: [{ field, label }...], rowCount }` plus
currency detection.

---

## Model-Specific Tools

### `searchRecords`

**Purpose**: Search for records in any accessible model.

**Parameters**: `{ modelName, filters?: Record<string, any>, limit?: number, offset?: number }`

**Returns**: `{ tool, model, resultType: 'list', data: records[], columns, actions, uiHint: 'table' }`

---

### `createRecord`

**Purpose**: Create a new record in any accessible model.

**Parameters**: `{ modelName, data: Record<string, any> }` — `data` schema is
generated per-model by `schema/SchemaGenerator.ts` from Prisma model
metadata.

**Side effects**: Creates DB record, logs audit entry.

**Returns**: `{ tool, model, resultType: 'record', data, columns, actions, uiHint: 'card' }`

---

### `updateRecord`

**Purpose**: Update an existing record.

**Parameters**: `{ modelName, id: string, data: Record<string, any> }` — same
`SchemaGenerator`-derived schema as `createRecord`, fields optional.

**Side effects**: Updates DB record.

**Returns**: `{ tool, model, resultType: 'record', data, columns, actions, uiHint: 'card' }`

---

### `advancedSqlQuery`

**Purpose**: Execute a raw read-only SQL query (lower-level than
`analyticsQuery`; no schema context injection).

**Parameters**: `{ query: string }`

**Validation**: SELECT-only, org_id filter required.

---

### `categorizePostings`

**File**: `tools/categorizePostings.ts`
**Available**: `posting` model only

**Purpose**: Run ML predictions for uncategorized postings. Does **not**
write to the database — returns predictions only. The LLM then calls
`queueActions` with the results.

**Parameters**: `{ account_id: string }`

**How it works**:
1. Fetches postings where `account_id` matches and the counter-account is null
2. Passes posting IDs to `categorizeTransactionBatchHandler` (`dry_run: true`)
   — the same handler registered in the
   [ERP Handler Registry](#erp-handler-registry) below
3. Returns predictions with confidence scores and reasoning

**Returns**:
```typescript
{
  predictions: Array<{
    posting_id: string,
    description: string,
    amount: number,
    value_date: string,
    predicted_account_id: string,
    predicted_account_name: string,
    confidence: 'high' | 'medium' | 'low',
    confidence_score: number,
    reasoning: string
  }>
}
```

The prediction pipeline (historical corpus, description normalization, fuzzy
matching, LLM batching by money direction) is documented in
[07-WORKED_EXAMPLES.md](./07-WORKED_EXAMPLES.md) using the Swiggy posting from
[01-OVERVIEW.md](./01-OVERVIEW.md).

---

### `suggestReconciliationMatches`

**File**: `tools/suggestReconciliationMatches.ts`
**Available**: `posting` model only

**Purpose**: Match bank postings to payment receipts and sales invoices.

**Parameters**: `{ account_id: string, filters?: Record<string, any> }`

**Returns**: `PostingWithSuggestions[]` — each posting with `best_match`,
`alternatives`, and `reconciliation_status`.

**Important**: The LLM must save the full result into
`accumulated_context_update` when calling `completeStep`. The
`ReconciliationActionBuilder` reads `accumulated_context.match_results` to
create pending actions — see
[06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md).

---

### `processInvoiceFromPdf` / `extractInvoiceFromFile`

**Purpose**: Parse PDF/image attachments and extract structured invoice data.
Used in invoice sessions with file attachments. File parts are decoded from
base64 by `utils/messageProcessor.ts` before reaching these tools.

---

## ERP Handler Registry

**Files**: `handlers/erp/registry.ts`, `handlers/erp/*.ts`,
`AgentTools.ts` (`erpConnectorTool`)

ERP handlers are **not** a separate tool catalog — they are an implementation
detail reached two ways:

1. **Direct call** — `categorizePostings` calls
   `categorizeTransactionBatchHandler` directly (dry-run mode), bypassing the
   ERP connector entirely.
2. **Dynamic dispatch via `erpConnector` tool** — the LLM calls
   `erpConnector({ method, params })`; `erpConnectorTool` looks up an active
   `source_system` connection for the org, creates an `ERPConnector` instance
   via `createERPConnector(connection.id)`, looks up the handler in the
   registry, validates params, and calls `connector[method](validatedParams)`.

### Registered methods

| Method | Handler file | Purpose |
|---|---|---|
| `getPurchaseOrder` | `handlers/erp/getPurchaseOrder.ts` | Fetch a PO from the connected ERP |
| `getExpenseAccounts` | `handlers/erp/getExpenseAccounts.ts` | List expense accounts from the connected ERP |
| `getSystemType` | `handlers/erp/getSystemType.ts` | Identify the ERP system type for the org |
| `categorizeTransaction` | `handlers/erp/categorizeTransaction.ts` | Single-transaction categorization |
| `categorizeTransactionBatch` | `handlers/erp/categorizeTransactionBatch.ts` | Batch categorization — same handler used directly by `categorizePostings` |

`registry.ts` exposes `getHandler(method)`, `getAllMethodNames()`, and
`hasHandler(method)`. Each handler implements `ERPMethodHandler`:
`validateParams(params, context, auth)` then `execute(connector, validatedParams, context, auth)`.

### `erpConnector` tool

**Purpose**: Call ERP system methods (`getExpenseAccounts`,
`categorizeTransaction`, `getPurchaseOrder`, `getSystemType`,
`categorizeTransactionBatch`). Used in procurement and invoice flows.

**Parameters**: `{ method: string, params: Record<string, any> }`

**Resolution order**:
1. Resolve `org_id` from `auth.user.org_id` (fallback: `"Indian demo"`)
2. Look up `org.erp_system_type` (fallback: `process.env.ERP_TYPE`, then `'zoho_books'`)
3. Find an active `source_system` row for `(org_id, system_type)`
4. `createERPConnector(connection.id)` → connector instance
5. `getHandler(method)` → validate params → `connector[method](...)`

**Failure modes**: throws if the org has no ERP system type configured, no
active `source_system` connection exists, the method is not in the registry,
or the method doesn't exist on the connector instance. All surfaced as
`{ tool: 'erpConnector', success: false, error }`.

---

## Tool Response Enrichment

CRUD tools (`createRecord`, `updateRecord`, `searchRecords`) enrich their
responses with UI hints:

```typescript
{
  tool: 'createRecord',
  model: 'posting',
  resultType: 'record' | 'list',
  data: { id, amount, ... },
  columns: [{ field, label }, ...],       // For table rendering
  actions: [{ type: 'view', urlTemplate }, ...],
  uiHint: 'card' | 'table'
}
```

`uiHint` drives custom rendering in conversational chat — see
[15-CONVERSATIONAL_CHAT.md](./15-CONVERSATIONAL_CHAT.md).

### `searchRecords` posting enrichment — `enrichPostingSearchResult`

**File**: `tools/enrichPostingSearchResult.ts`

When `searchRecords` is called with `modelName: 'posting'` and returns data,
`searchRecordsTool` calls `enrichPostingSearchResult(enrichedResult, auth,
searchFilters, toolContext)` to pick a richer `uiHint` for the chat UI:

- **`account_ledger`** — filters resolve to a single focus account
  (`account_id` or `credit_account_id` equal to one `acco_...`). Rows are
  sorted chronologically and annotated with whether the amount was
  **received** (focus account debited, `account_id`) or **debited** (focus
  account credited, `credit_account_id`) from that account's perspective —
  see `isAmountReceived()`.
- **`posting_journal`** — a journal-style view of the same rows when no single
  focus account can be resolved.
- **`posting_dual`** — fallback dual-column (debit/credit) view.

These map to the `AccountLedgerDisplay`, `PostingJournalDisplay`, and
`PostingDualDisplay` components in
[15-CONVERSATIONAL_CHAT.md — Tool Invocation Rendering](./15-CONVERSATIONAL_CHAT.md#tool-invocation-rendering).

### `runFinancialReport` display enrichment

**File**: `tools/runFinancialReport.ts`

The tool result now includes a `uiHint: 'financial_report'` payload built by
`enrichFinancialReportResult()`:

- For `report_id: 'trial_balance'`, zero-balance non-leaf rows are dropped via
  `filterTrialBalanceRowsForDisplay()` (rows with `level === 0`, or any
  nonzero `total_debits`/`total_credits`/`opening_balance`/`balance`/`total_balance`,
  are kept).
- `currencyCode` is resolved from the first row's `report_currency` or
  `account_currency`, defaulting to `INR`.
- `columns` are report-type-specific (`trial_balance`,
  `monthly_trial_balance`, `income_statement` each have their own column set);
  unrecognised `report_id` values fall back to the `trial_balance` columns.
- Returns both `rowCount` (after filtering) and `totalRowCount` (before
  filtering).

Rendered by `FinancialReportDisplay` — see
[15-CONVERSATIONAL_CHAT.md — Tool Invocation Rendering](./15-CONVERSATIONAL_CHAT.md#tool-invocation-rendering).

---

## What's Next

- **06-BUILDERS_AND_EXECUTORS.md** — what happens after `queueActions` and
  `completeStep` (hybrid dispatcher, builders, executors)
- **13-EXTENDING.md** — step-by-step recipes for adding a new tool or ERP
  handler method
