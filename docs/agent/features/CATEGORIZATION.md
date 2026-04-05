# Fabriq Agent — Transaction Categorization

**Last Updated**: 2026-04-04  
**Related files**: `tools/categorizePostings.ts`, `handlers/erp/categorizeTransactionBatch.ts`, `handlers/erp/utils/categorizationUtils.ts`, `executors/PendingActionExecutor.ts`

---

## What It Does

Categorization predicts the **counter-account** (expense/income account) for postings that have a primary bank account but a null counter-account. In Fabriq's double-entry model, the counter-account is what we call the "category" — not the `category` table.

Example:
- Posting: debit=HDFC Current, credit=null, description="Staples - office supplies"
- Prediction: credit=Office Expenses account, confidence=0.87

---

## Entry Points

| Context | How it's triggered | Where it runs |
|---------|-------------------|----------------|
| Agent session (`atpl_categorise`) | LLM calls `categorizePostings` tool, then `queueActions` | `tools/categorizePostings.ts` → `categorizeTransactionBatch` |
| Direct API | `POST /api/agent/erp/categorize-transaction-batch` | `handlers/erp/categorizeTransactionBatch.ts` |
| Import flow | During CSV/PDF import with AI categorization enabled | Same batch handler |
| Reconciliation pipeline | As step 1 of reconciliation | `services/reconciliation/reconcileImportedPostings.ts` |

---

## `categorizePostings` Agent Tool

**File**: `tools/categorizePostings.ts`

This tool does **not write to the database**. It runs predictions in dry-run mode and returns results. The LLM then calls `queueActions` with those results to create pending actions for human review.

```typescript
// Input
{ account_id: string }  // Bank/credit card account to categorize postings for

// What it does:
// 1. Fetches postings where account_id matches and counter-account is null
// 2. Calls categorizeTransactionBatchHandler.execute(null, { posting_ids, options: { dry_run: true } })
// 3. Returns predictions

// Output
{
  predictions: Array<{
    posting_id: string,
    description: string,
    amount: number,
    value_date: string,
    predicted_account_id: string,
    predicted_account_name: string,
    confidence: 'high' | 'medium' | 'low',
    confidence_score: number,     // 0.0–1.0
    reasoning: string
  }>
}
```

---

## ML Prediction Logic

**File**: `handlers/erp/utils/categorizationUtils.ts`

The prediction model:
1. **Historical pattern matching**: Looks for previous postings with similar description from the same org → uses the most common account assignment
2. **LLM-based prediction**: If no history, calls the LLM with description + amount + available accounts
3. **Account mapping**: Determines which side (debit/credit) to assign based on payment direction (money in vs money out)

### Counter-Account Logic

```
Money OUT (bank is credited, asset decreases):
  → The bank account is on the credit side
  → The expense/category account goes on the debit side (account_id)

Money IN (bank is debited, asset increases):
  → The bank account is on the debit side
  → The income/category account goes on the credit side (credit_account_id)
```

For credit cards:
```
Credit card spend (credit card is credited, liability increases):
  → Credit card on credit side
  → Expense account on debit side

Credit card payment (credit card is debited, liability decreases):
  → Credit card on debit side
  → Payment account (bank) on credit side
```

---

## Full Agent Session Walkthrough

This traces a complete "Categorise Expenses" session from the first API call to the last DB write.

### Setup: Template

```
Template: atpl_categorise
goal_model: posting
system_prompt: "You are helping categorize uncategorized bank postings... 
  - Use analyticsQuery to find uncategorized postings
  - Use categorizePostings to get AI predictions
  - Use queueActions to queue approved predictions as categorize_transaction actions
  - NEVER write categorizations directly"
allowed_tools: ["getAnalyticsContext", "analyticsQuery", "categorizePostings", "queueActions"]
focus_models: ["posting", "account", "category", "category_group"]
```

### Turn 1: Planning

User goal: *"Categorise all uncategorised HDFC expenses for March 2025"*

System prompt contains:
- Template's system_prompt (above)
- Base prompt with 4-model schema (posting, account, category, category_group)
- Session context block (status: planning, no plan)
- SESSION_DIRECTIVE (call createPlan immediately)

LLM calls `createPlan`:
```json
{
  "steps": [
    { "index": 0, "type": "query", "title": "Find uncategorized postings", "description": "Query for postings in the HDFC account with null counter-account in March 2025" },
    { "index": 1, "type": "action", "title": "Get predictions and queue", "description": "Call categorizePostings and queue results as pending actions" },
    { "index": 2, "type": "report", "title": "Summarize results", "description": "Report how many postings were categorized" }
  ]
}
```

Session: `status = 'executing'`, `current_step_index = 0`  
Auto-continuation fires: `setImmediate(handleRequest("Continue with step 0..."))`

### Turn 2: Query Step

Context block shows: Step 0 in progress, accumulated_context = {}

LLM calls:
1. `getAnalyticsContext` → gets schema for `posting`, `account` tables
2. `analyticsQuery` → finds HDFC account ID
3. `analyticsQuery` → fetches 24 uncategorized postings for HDFC in March 2025

LLM calls `completeStep`:
```json
{
  "step_index": 0,
  "result_summary": "Found 24 uncategorized postings in HDFC Current Account for March 2025",
  "accumulated_context_update": {
    "hdfc_account_id": "acco_xxx",
    "uncategorized_count": 24
  }
}
```

Session: `current_step_index = 1`  
Hybrid dispatcher checks step 1 (type: `action`):
- `ReconciliationActionBuilder.matches('posting', step1, context)` → false (no `match_results`)
- Dispatcher breaks → LLM handles step 1

Auto-continuation fires: `setImmediate(handleRequest("Continue with step 1..."))`

### Turn 3: Action Step

Context block shows: Step 1 in progress, accumulated_context = `{hdfc_account_id, uncategorized_count}`

LLM calls:
1. `categorizePostings({ account_id: "acco_xxx" })` → returns 24 predictions with confidence scores and reasoning

LLM calls `queueActions`:
```json
{
  "action_type": "categorize_transaction",
  "batch_id": "ses_abc-step-1",
  "on_approve": "execute_immediately",
  "actions": [
    { "title": "Categorize: Staples office supplies", "payload": { "posting_id": "post_1", "predicted_account_id": "acco_office", "predicted_account_name": "Office Expenses", "confidence_score": 0.87, "description": "Staples - office supplies", "amount": 4200 }, "confidence": "high", "confidence_score": 0.87 },
    { "title": "Categorize: Unknown payment", "payload": { ... }, "confidence": "low", "confidence_score": 0.41 },
    ...24 total
  ]
}
```

LLM calls `completeStep({ step_index: 1, result_summary: "Queued 24 categorization actions" })`

Session: `status = 'awaiting_approval'`, `pending_actions_count = 24`  
SSE events: 24× `action_queued`, 1× `session_status_changed`

### Human Review

User sees 24 actions in inbox. Can:
- Approve all: bulk approve button
- Approve high-confidence only: "Approve N high-confidence" button
- Review each individually via detail drawer

### Executor

For each approved `categorize_transaction` action:
```
CategorizeTransactionExecutor.execute(action, auth)
  → reads payload.posting_id, payload.predicted_account_id
  → determines which side to update based on counter-account direction
  → UPDATE posting SET credit_account_id = predicted_account_id WHERE id = posting_id
```

### Session Completion

After all 24 actions resolved:
- `checkAllPendingActionsResolved()` → pending = 0
- No `ReconciliationReportFormatter` match (no action step with match_results)
- `shouldAutoContinue` → true → agent fires for step 2 (report)

Turn 4: LLM writes: "Categorized 24 postings. High confidence: 18, medium: 4, low: 2."  
`completeStep({ step_index: 2 })` → `session.status = 'completed'`

---

## Batch API (Outside Sessions)

`POST /api/agent/erp/categorize-transaction-batch`

```json
// Request
{
  "posting_ids": ["post_abc", "post_def"],
  "options": { "dry_run": false }
}

// Response
{
  "results": [
    {
      "posting_id": "post_abc",
      "predicted_account_id": "acco_xyz",
      "predicted_account_name": "Office Expenses",
      "confidence": "high",
      "confidence_score": 0.91,
      "reasoning": "Description matches historical pattern..."
    }
  ]
}
```

When `dry_run: false`, the executor writes the prediction directly to the posting (skips pending action workflow).

---

## Frontend Action Type: `categorize_transaction`

**Registry**: `frontend-1/src/components/workbench/actions/registry.ts`

| Element | Source |
|---------|--------|
| Badge label | "Categorise" |
| Row summary | `{description} → {predicted_account_name}` + amount |
| Detail drawer | Transaction card + AI Prediction card with confidence bar, score %, reasoning |

---

## Key Code Pointers

| What | File |
|------|------|
| Agent tool | `backend/src/agent/tools/categorizePostings.ts` |
| Batch handler | `backend/src/agent/handlers/erp/categorizeTransactionBatch.ts` |
| Single handler | `backend/src/agent/handlers/erp/categorizeTransaction.ts` |
| Prediction logic | `backend/src/agent/handlers/erp/utils/categorizationUtils.ts` |
| Executor | `backend/src/agent/executors/PendingActionExecutor.ts` (`CategorizeTransactionExecutor`) |
| E2E test | `backend/src/agent/__tests__/v2-categorise-expenses-e2e.test.ts` |
| Frontend registry | `frontend-1/src/components/workbench/actions/registry.ts` |
