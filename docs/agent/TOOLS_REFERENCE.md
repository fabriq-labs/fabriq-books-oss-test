# Fabriq Agent — Tools Reference

**Last Updated**: 2026-04-04  
**Primary files**: `AgentTools.ts`, `tools/sessionTools.ts`, `tools/analyticsQuery.ts`, `tools/categorizePostings.ts`, `tools/suggestReconciliationMatches.ts`, `ToolManager.ts`

---

## How Tools Work

Each tool is a Vercel AI SDK `tool()` object:
- `description` — what the LLM reads to decide when to use it
- `parameters` — Zod schema validated before execution (defined in `GenericFunctions.ts` or inline)
- `execute` — async function that runs the actual logic and returns a structured result

The LLM receives all permitted tools simultaneously and decides which to call. The SDK runs `execute()` and returns the result back to the LLM as a tool result message for the next reasoning step.

---

## Tool Selection: `ToolManager.getUnifiedTools()`

**File**: `ToolManager.ts`

```
getUnifiedTools(modelName, auth, context, sessionId, allowedTools?)
  → model-specific tools for modelName (from getToolsForModel())
  + analyticsQuery + getAnalyticsContext (always)
  + [createPlan, completeStep, queueActions, requestClarification] if sessionId present
  → filter to [CORE_SESSION_TOOLS + allowedTools] if template.allowed_tools is non-empty
```

**`CORE_SESSION_TOOLS`** = `['createPlan', 'completeStep']`. These two cannot be removed by `allowed_tools` and are always present in any session. `queueActions` and `requestClarification` are Tier 2 — they are filterable via `allowed_tools`.

**Deprecated tools** (still exported but not added to any new tool map): `queueAction` (single-action variant) and `queueActionBatch` (multi-action variant). New code uses `queueActions` only.

### Model → Default Tool Set

| Model | Tools |
|-------|-------|
| `default` | `searchRecords`, `advancedSqlQuery`, `extractInvoiceFromFile`, `createRecord` |
| `posting` | `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`, `suggestReconciliationMatches`, `categorizePostings` |
| `invoice` | `searchRecords`, `createRecord`, `updateRecord`, `processInvoiceFromPdf`, `extractInvoiceFromFile`, `advancedSqlQuery`, `erpConnector` |
| `purchase_requisition` | Full CRUD + search for 11 related models + ERP connector |
| `purchase_order` | `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`, `erpConnector` |

Analytics tools (`getAnalyticsContext`, `analyticsQuery`) are **always** added regardless of model.

Session tools (`createPlan`, `completeStep`, `queueActions`, `requestClarification`) are added **only when `sessionId` is present**.

### `allowed_tools` Template Filter

When a template declares `allowed_tools` (non-empty array), the full tool set is built first and then filtered to `[createPlan, completeStep, ...allowedTools]`. This is the security ceiling — request context cannot extend it.

**Example `atpl_categorise`**:
```json
allowed_tools: ["getAnalyticsContext", "analyticsQuery", "categorizePostings", "queueActions"]
```

**Example `atpl_reconcile`**:
```json
allowed_tools: ["getAnalyticsContext", "analyticsQuery", "suggestReconciliationMatches", "queueActions"]
```

---

## Core Session Tools

These are always injected when a `sessionId` is present and cannot be removed by `allowed_tools`.

### `createPlan`

**File**: `tools/sessionTools.ts`

**Purpose**: Decompose the session goal into steps. Called by LLM on the first turn.

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

**Side effects**: Writes `plan` to `agent_session`, sets `status = 'executing'`, `current_step_index = 0`, emits `session_status_changed`.

**Returns**: `{ success: true, plan, message: "Plan created. Starting step 0." }`

---

### `completeStep`

**File**: `tools/sessionTools.ts`

**Purpose**: Mark the current step complete, advance to next step, optionally save data.

**Parameters**:
```typescript
{
  step_index: number,
  result_summary: string,                    // Human-readable summary of what was done
  accumulated_context_update?: Record<string, any>  // Data to merge into session.accumulated_context
}
```

**Side effects**: Updates `plan[step_index].status = 'completed'`, updates `plan[step_index].result_summary`, advances `current_step_index`, merges `accumulated_context_update` into `session.accumulated_context`. Then runs the **hybrid dispatcher** to handle subsequent steps deterministically.

**Returns**: `{ success: true, nextStep: { index, title, type } }` or `{ success: true, message: "All steps complete" }`

---

### `queueActions`

**File**: `tools/sessionTools.ts`

**Purpose**: Create one or more `pending_action` records in a single call. Replaces the deprecated `queueAction` (single) and `queueActionBatch` (multiple) tools.

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

**Side effects**: Creates `pending_action` records, increments `pending_actions_count`, emits `action_queued` (×N) and `inbox_count_changed` SSE events.

**Returns**: `{ success: true, actions: [{ id, title, confidence }...] }`

---

### `requestClarification`

**File**: `tools/sessionTools.ts`  
**Tier**: 2 (filterable) — templates opt in by adding it to `allowed_tools`

**Purpose**: Pause the session to ask the user a clarifying question when a query returns 0 rows due to ambiguous input (e.g. user said "checking account" but DB has "HDFC Current"). The LLM cannot proceed without user input.

**Parameters**:
```typescript
{
  question: string,             // Clear question for the user. Include what was searched and available options.
  context?: Record<string, any> // Optional structured context: searched_for, available_options, etc.
}
```

**Side effects**:
- Sets `session.status = 'awaiting_input'`
- Writes `session.clarification_request = { question, context, step_index: current_step_index }`
- Cancels the session timeout watchdog (user may take time to respond)

**Does NOT call `completeStep`** — the session stays on the current step. When the user submits a response via `POST /sessions/:id/clarify`, the clarification is injected as a `user` message and the session resumes (auto-continuation re-fires with the new context).

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

**Purpose**: Returns schema context, multi-tenancy rules, and relationship descriptions to help the LLM write correct SQL. Call this before writing complex SQL.

**Parameters**: None (uses `auth.org_id` from closure)

**Returns**: Schema description including table names, columns, relationships, and org_id filtering rules.

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

**Validation**: Rejects non-SELECT queries. Validates that `org_id` filter is present. Detects and rejects unsubstituted `{{...}}` placeholders.

**Returns**: `{ data: rows[], columns: [{ field, label }...], rowCount }` plus currency detection.

---

## Model-Specific Tools

### `searchRecords`

**Purpose**: Search for records in any accessible model.

**Parameters**: `{ modelName, filters?: Record<string, any>, limit?: number, offset?: number }`

**Returns**: `{ tool, model, resultType: 'list', data: records[], columns, actions, uiHint: 'table' }`

---

### `createRecord`

**Purpose**: Create a new record in any accessible model.

**Parameters**: `{ modelName, data: Record<string, any> }`

**Side effects**: Creates DB record, logs audit entry.

**Returns**: `{ tool, model, resultType: 'record', data, columns, actions, uiHint: 'card' }`

---

### `updateRecord`

**Purpose**: Update an existing record.

**Parameters**: `{ modelName, id: string, data: Record<string, any> }`

**Side effects**: Updates DB record.

**Returns**: `{ tool, model, resultType: 'record', data, columns, actions, uiHint: 'card' }`

---

### `advancedSqlQuery`

**Purpose**: Execute a raw read-only SQL query (lower-level than `analyticsQuery`; no schema context injection).

**Parameters**: `{ query: string }`

**Validation**: SELECT-only, org_id filter required.

---

### `categorizePostings`

**File**: `tools/categorizePostings.ts`  
**Available**: `posting` model only

**Purpose**: Run ML predictions for uncategorized postings. Does **not** write to the database — returns predictions only. The LLM then calls `queueActions` with the results.

**Parameters**: `{ account_id: string }`

**How it works**:
1. Fetches postings where `account_id` matches and the counter-account is null
2. Passes posting IDs to `categorizeTransactionBatch` (dry_run: true)
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

---

### `suggestReconciliationMatches`

**File**: `tools/suggestReconciliationMatches.ts`  
**Available**: `posting` model only

**Purpose**: Match bank postings to payment receipts and sales invoices.

**Parameters**: `{ account_id: string, filters?: Record<string, any> }`

**Returns**: `PostingWithSuggestions[]` — each posting with `best_match`, `alternatives`, and `reconciliation_status`.

**Important**: The LLM must save the full result into `accumulated_context_update` when calling `completeStep`. The `ReconciliationActionBuilder` reads `accumulated_context.match_results` to create pending actions.

---

### `processInvoiceFromPdf` / `extractInvoiceFromFile`

**Purpose**: Parse PDF/image attachments and extract structured invoice data. Used in invoice sessions with file attachments.

---

### `erpConnector`

**Purpose**: Call ERP system methods (getExpenseAccounts, categorizeTransaction, getPurchaseOrder, getSystemType). Used in procurement flows.

---

## Tool Response Enrichment

CRUD tools (`createRecord`, `updateRecord`, `searchRecords`) enrich their responses with UI hints:

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

---

## How to Add a New Tool

1. Define the Zod schema in `GenericFunctions.ts` or inline
2. Create the tool factory in `AgentTools.ts` or a new file under `tools/`
3. Export from `tools/index.ts`
4. Register in `ToolManager.getToolsForModel()` for the appropriate model(s), or add to analytics/session groups
5. Update template `allowed_tools` seeds in `backend/prisma/seed-agent-templates.sql`
6. Write tests in `__tests__/`
