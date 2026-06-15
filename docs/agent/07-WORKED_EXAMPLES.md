# Fabriq Agent — Worked Examples

**Audience**: Anyone who wants to see categorization and reconciliation
played out turn-by-turn before (or instead of) reading 02-06 in full.
**Verified against**: commit `0934aa8` (2026-06-12)

---

## Staleness Policy

This is the most brittle doc in the set — every tool rename or prompt change
can break a trace below. To keep it maintainable:

- Traces **reference** sections in 02-06 by anchor rather than re-explaining
  mechanics.
- Traces avoid pasting long code; tool signatures live in
  [05-TOOLS.md](./05-TOOLS.md).
- Each trace is stamped with the commit it was last verified against (see
  header). If you change `sessionTools.ts`, `ActionBuilderRegistry`, or the
  `atpl_categorise`/`atpl_reconcile` templates, re-verify and update the
  stamp.

Both traces below continue the two postings introduced in
[01-OVERVIEW.md — Worked Example](./01-OVERVIEW.md#worked-example-a-single-bank-statement-line-end-to-end):

- **Posting A** (Swiggy UPI, ₹420, `credit_account_id = null`) → categorization
- **Posting B** (NEFT "INV-006 payment", ₹60,000, `credit_account_id = null`) → reconciliation

---

## Trace 1: Categorization (`atpl_categorise`)

### Setup

```
Template: atpl_categorise
goal_model: posting
allowed_tools: ["getAnalyticsContext", "analyticsQuery", "categorizePostings", "queueActions"]
focus_models: ["posting", "account", "category", "category_group"]
```

Template `system_prompt` instructs the LLM to: use `analyticsQuery` to find
uncategorized postings, use `categorizePostings` to get AI predictions, use
`queueActions` to queue approved predictions, and **never write
categorizations directly**.

### Turn 1 — Planning

User goal: *"Categorise all uncategorised HDFC expenses for March 2025."*

Per [03-SESSION_LIFECYCLE.md — Phase 1](./03-SESSION_LIFECYCLE.md#phase-1-planning),
`SESSION_DIRECTIVE` tells the LLM to call `createPlan` immediately:

```json
{
  "steps": [
    { "index": 0, "type": "query",  "title": "Find uncategorized postings", "description": "Query postings in the HDFC account with null counter-account in March 2025" },
    { "index": 1, "type": "action", "title": "Get predictions and queue",   "description": "Call categorizePostings and queue results as pending actions" },
    { "index": 2, "type": "report", "title": "Summarize results",           "description": "Report how many postings were categorized" }
  ]
}
```

`session.status → 'executing'`, `current_step_index = 0`. Auto-continuation
fires (see [03-SESSION_LIFECYCLE.md — Auto-Continuation](./03-SESSION_LIFECYCLE.md#auto-continuation-logic-agentservice)).

### Turn 2 — Query Step (step 0)

LLM calls `getAnalyticsContext` then `analyticsQuery` twice: once to find the
HDFC account ID, once to fetch uncategorized postings for March — including
**Posting A** (the Swiggy line, `credit_account_id = null`), among 24 total.

LLM calls `completeStep`:
```json
{
  "step_index": 0,
  "result_summary": "Found 24 uncategorized postings in HDFC Current Account for March 2025",
  "accumulated_context_update": { "hdfc_account_id": "acco_hdfc_current", "uncategorized_count": 24 }
}
```

The hybrid dispatcher (see
[06-BUILDERS_AND_EXECUTORS.md — Hybrid Dispatcher](./06-BUILDERS_AND_EXECUTORS.md#the-hybrid-dispatcher))
checks step 1 (type `action`): `ReconciliationActionBuilder.matches('posting',
step1, context)` → **false**, because `accumulated_context.match_results` is
absent. Dispatcher breaks — step 1 needs the LLM (Strategy 2, LLM-Driven
Queuing — [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md#strategy-2--llm-driven-queuing)).

### Turn 3 — Action Step (step 1)

LLM calls `categorizePostings({ account_id: "acco_hdfc_current" })`
([05-TOOLS.md — categorizePostings](./05-TOOLS.md#categorizepostings)). This
runs the dry-run prediction pipeline
([CATEGORIZATION_V2 details](./archive/CATEGORIZATION_V2.md) — historical
corpus match first, then LLM fallback split by money direction) and returns
24 predictions, including for Posting A:

```json
{
  "posting_id": "post_swiggy_001",
  "description": "UPI/DR/987654321098/SWIGGY TECHNOLOGIES/swiggy@axisbank",
  "amount": 420.00,
  "predicted_account_id": "acco_food_dining",
  "predicted_account_name": "Food & Dining",
  "confidence": "high",
  "confidence_score": 0.93,
  "reasoning": "Historical match: 'swiggy technologies' normalized description matched 12 prior postings categorized to Food & Dining"
}
```

LLM calls `queueActions`:
```json
{
  "action_type": "categorize_transaction",
  "batch_id": "ses_abc-step-1",
  "on_approve": "execute_immediately",
  "actions": [
    { "title": "Categorize: Swiggy Technologies → Food & Dining",
      "payload": { "posting_id": "post_swiggy_001", "predicted_account_id": "acco_food_dining",
                    "predicted_account_name": "Food & Dining", "confidence_score": 0.93,
                    "description": "UPI/DR/.../SWIGGY TECHNOLOGIES/...", "amount": 420.00 },
      "confidence": "high", "confidence_score": 0.93 },
    ...23 more
  ]
}
```

LLM calls `completeStep({ step_index: 1, result_summary: "Queued 24 categorization actions" })`.

`session.status → 'awaiting_approval'`, `pending_actions_count = 24`. SSE:
24× `action_queued`, 1× `session_status_changed`
([03-SESSION_LIFECYCLE.md — SSE Event System](./03-SESSION_LIFECYCLE.md#sse-event-system)).

### Human Review and Execution

User approves the Posting A action (individually, or via bulk "approve
high-confidence"). Per
[06-BUILDERS_AND_EXECUTORS.md — Approval Flow](./06-BUILDERS_AND_EXECUTORS.md#approval-flow-end-to-end):

```
CategorizeTransactionExecutor.execute(action, auth)
  → reads payload.posting_id = "post_swiggy_001", payload.predicted_account_id = "acco_food_dining"
  → money direction = money out (bank debited) → counter-account is credit_account_id
  → UPDATE posting SET credit_account_id = 'acco_food_dining' WHERE id = 'post_swiggy_001'
```

(Direction rule from
[01-OVERVIEW.md — Money Direction Cheat Sheet](./01-OVERVIEW.md#money-direction-cheat-sheet):
money OUT of a bank account → contra/"category" side is `credit_account_id`.)

### Session Completion

After all 24 actions resolve, `checkAllPendingActionsResolved()` finds 0
pending. No `ReportFormatter` matches a categorization session (no
`match_results`-driven action step), so Path B fires
([06-BUILDERS_AND_EXECUTORS.md — Approval Flow, Path B](./06-BUILDERS_AND_EXECUTORS.md#approval-flow-end-to-end)):
`session.status → 'executing'`, agent resumes for step 2.

Turn 4: LLM writes *"Categorized 24 postings. High confidence: 18, medium: 4,
low: 2."* and calls `completeStep({ step_index: 2 })` →
`session.status = 'completed'`.

---

## Trace 2: Reconciliation (`atpl_reconcile`)

### Setup

```
Template: atpl_reconcile
goal_model: posting
allowed_tools: ["getAnalyticsContext", "analyticsQuery", "suggestReconciliationMatches", "queueActions"]
focus_models: ["posting", "account", "payment_receipt", "invoice"]
```

This template is the one case where `prompt_template` rows include the
`'reconciliation'` prompt type — see
[04-PROMPT_SYSTEM.md — Reconciliation Prompt Type Conditional](./04-PROMPT_SYSTEM.md#reconciliation-prompt-type-conditional).

### Turn 1 — Planning

User goal: *"Reconcile all unmatched HDFC transactions for March."*

```json
{
  "steps": [
    { "index": 0, "type": "query",    "title": "Find unmatched postings",      "description": "Query postings for HDFC account with reconciliation_status NULL or UNMATCHED" },
    { "index": 1, "type": "analysis", "title": "Suggest matches",              "description": "Run suggestReconciliationMatches for the unmatched postings" },
    { "index": 2, "type": "action",   "title": "Queue reconciliation actions", "description": "Create pending actions for confident matches" },
    { "index": 3, "type": "report",   "title": "Summarize results",            "description": "Report match outcomes" }
  ]
}
```

`session.status → 'executing'`, `current_step_index = 0`.

### Turn 2 — Query Step (step 0)

LLM finds the HDFC account ID and fetches unmatched postings — including
**Posting B** (the NEFT "INV-006 payment" line, ₹60,000, money IN). Total: 23
unmatched postings.

```json
{
  "step_index": 0,
  "result_summary": "Found 23 unmatched postings",
  "accumulated_context_update": { "hdfc_account_id": "acco_hdfc_current", "unmatched_count": 23 }
}
```

Dispatcher checks step 1 (`analysis`) — no builder registered for analysis
steps, so it always breaks to the LLM.

### Turn 3 — Analysis Step (step 1)

LLM calls `suggestReconciliationMatches({ account_id: "acco_hdfc_current" })`
([05-TOOLS.md — suggestReconciliationMatches](./05-TOOLS.md#suggestreconciliationmatches)).
Matching logic ([01-OVERVIEW.md — reconciliation is matched against
invoices/receipts](./01-OVERVIEW.md#contra-account--category)): the tool
parses Posting B's description for `INV-006`, finds an open `invoice` with
that number and amount ₹60,000 → `confidence: "high"` (amount + reference
match).

**Critical**: per `SESSION_DIRECTIVE`
([04-PROMPT_SYSTEM.md — Layer 4](./04-PROMPT_SYSTEM.md#layer-4-session_directive)),
the LLM must save the **full** result in `accumulated_context_update`:

```json
{
  "step_index": 1,
  "result_summary": "Found matches for 20 of 23 postings",
  "accumulated_context_update": {
    "match_results": [
      {
        "posting_id": "post_inv006_payment",
        "best_match": { "type": "invoice", "id": "inv_006", "reference": "INV-006", "confidence": "high", "amount": 60000.00 },
        "alternatives": []
      },
      ... 19 more matched, 3 with no match
    ]
  }
}
```

### Hybrid Dispatcher Fires on Step 2 (action)

Per [06-BUILDERS_AND_EXECUTORS.md — Strategy 1](./06-BUILDERS_AND_EXECUTORS.md#strategy-1--deterministic-builder):

- `ReconciliationActionBuilder.matches('posting', step2, { match_results: [...] })`
  → **true** (`match_results` is non-empty)
- `ReconciliationActionBuilder.build()` iterates `match_results` and creates
  20 `reconcile_posting` pending actions — including one for Posting B:
  ```json
  { "title": "Reconcile: NEFT INV-006 payment → Invoice INV-006",
    "payload": { "posting_id": "post_inv006_payment",
                  "matched_reference": "invoice:inv_006:INV-006",
                  "match_type": "invoice", "matched_id": "inv_006",
                  "confidence": "high", "amount": 60000.00 } }
  ```
- `session.status → 'awaiting_approval'` — **no LLM call for step 2**

### Dispatcher Continues to Step 3 (report)

- `ReconciliationReportFormatter.matches(...)` → true (plan has an action step)
- Formatter generates report text from `accumulated_context`
- `session.status → 'completed'` — **no LLM call for step 3 either**

Both step 2 and step 3 complete without any additional LLM turns — the
defining characteristic of the deterministic-builder strategy.

### Approval Execution

For Posting B's approved `reconcile_posting` action
([06-BUILDERS_AND_EXECUTORS.md — ReconcilePostingExecutor](./06-BUILDERS_AND_EXECUTORS.md#reconcilepostingexecutor)):

```
ReconcilePostingExecutor.execute(action, auth)
  → payload.posting_id = "post_inv006_payment"
  → payload.matched_reference = "invoice:inv_006:INV-006"
  → confirmReconciliation(posting_id, auth)
     → matched_reference parses to an invoice → creates payment_receipt linked to inv_006
     → posting.payment_receipt_id = <new receipt id>
     → posting.reconciliation_status = 'MATCHED'
```

---

## What's Next

- **08-DATA_MODELS.md** — the `agent_session`, `pending_action`, and
  `posting`/`invoice`/`payment_receipt` schemas referenced throughout both
  traces, plus multi-tenancy enforcement
- **11-OBSERVABILITY.md** — how to inspect the `llm_trace` rows for a session
  like the ones above
