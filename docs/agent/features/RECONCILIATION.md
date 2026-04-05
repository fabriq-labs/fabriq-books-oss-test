# Fabriq Agent — Bank Reconciliation

**Last Updated**: 2026-04-04  
**Related files**: `tools/suggestReconciliationMatches.ts`, `services/reconciliation/reconcileImportedPostings.ts`, `services/reconciliation/confirmReconciliation.ts`, `executors/PendingActionExecutor.ts`

---

## Quick Reference

| Item | Details |
|------|---------|
| **Pipeline** | `reconcileImportedPostings(postingIds, auth)` — runs: batch categorize → filter incoming (amount > 0) → per-posting `findSuggestionsForPosting` → set `reconciliation_status` and `matched_reference` |
| **Reconcile API** | `POST /api/agent/erp/reconcile-transaction` body `{ posting_ids: string[] }` → returns `{ results: [{ posting, reconciliation }] }` |
| **Confirm API** | `POST /api/agent/erp/confirm-reconciliation` body `{ posting_id }` → creates payment receipt (if match is invoice) or links to existing receipt; returns full posting in data_graph shape |
| **Template** | `atpl_reconcile` — uses `suggestReconciliationMatches` tool + `ReconciliationActionBuilder` for deterministic action creation |
| **E2E test** | `backend/src/agent/__tests__/v2-create-posting-e2e.test.ts` |

---

## What It Does

The reconciliation tool matches **bank statement lines** (postings) to **payment receipts** and **sales invoices**. Three ways to use it:

1. **Detail view**: Click Reconcile on a posting → pipeline runs; suggestions shown; user clicks Confirm match
2. **Transactions list**: Select rows → bulk Reconcile; or per-row Sparkles icon → same API; results merged in-place
3. **Agent session** (`atpl_reconcile`): LLM calls `suggestReconciliationMatches`, deterministic builder creates pending actions, user approves in inbox

---

## Posting Schema Fields

```
posting:
  reconciliation_status String?   — 'UNMATCHED' | 'SUGGESTED' | 'MATCHED'
  matched_reference     String?   — e.g. "payment_receipt:payr_xxx:REC-001" or "invoice:inv_xxx:INV-001"
  payment_receipt_id    String?   — FK to payment_receipt.id (set on MATCHED)
```

Status lifecycle: `NULL/UNMATCHED → SUGGESTED (pipeline ran) → MATCHED (user confirmed)`

---

## Matching Logic

1. **Amount** — exact match or within tolerance; partials supported for invoices (vs `balance_amount`)
2. **Reference** — posting description parsed for patterns like `INV-001`, `REC-DEMO-001`; match boosts confidence to `high`
3. **Date** — soft signal; within ±30 days → `medium` confidence

Confidence levels: `high` (amount + reference match), `medium` (amount + date), `low` (amount only).

---

## Services

| Service | File | Role |
|---------|------|------|
| Pipeline | `services/reconciliation/reconcileImportedPostings.ts` | Batch: categorize → filter incoming → suggestions → set status |
| Confirm | `services/reconciliation/confirmReconciliation.ts` | Parse `matched_reference`; if invoice → create `payment_receipt`; set `posting.payment_receipt_id` + `MATCHED`; idempotent |

---

## Agent Session Walkthrough (`atpl_reconcile`)

### Template

```
allowed_tools: ["getAnalyticsContext", "analyticsQuery", "suggestReconciliationMatches", "queueActions"]
focus_models: ["posting", "account", "payment_receipt", "invoice"]
```

### Typical 4-step plan

```
Step 0 (query):    Find unmatched postings for HDFC account
Step 1 (analysis): Suggest reconciliation matches
Step 2 (action):   Queue reconciliation actions   ← ReconciliationActionBuilder handles this
Step 3 (report):   Summarize results              ← ReconciliationReportFormatter handles this
```

### Turn-by-turn

**Turn 1 (planning)**:  
LLM calls `createPlan` with the 4 steps above. Auto-continuation starts.

**Turn 2 (step 0 — query)**:  
LLM calls `analyticsQuery` to find HDFC account ID and fetch 23 unmatched postings.  
LLM calls `completeStep(0, "Found 23 unmatched postings", { hdfc_account_id, unmatched_count: 23 })`.  
Auto-continuation → step 1.

**Turn 3 (step 1 — analysis)**:  
LLM calls `suggestReconciliationMatches({ account_id: "acco_hdfc" })`.  
Gets back 23 postings with match suggestions.  
**Critical**: LLM must save full results in `accumulated_context_update`:
```json
{ "match_results": [{ "posting_id": "...", "best_match": {...}, "alternatives": [...] }, ...] }
```
LLM calls `completeStep(1, "Found matches for 20 of 23 postings", { match_results: [...] })`.

**Hybrid dispatcher fires on step 2** (type: `action`):
- `ReconciliationActionBuilder.matches('posting', step2, { match_results: [...] })` → **true** (match_results is non-empty)
- Builder creates 23 `reconcile_posting` pending actions
- Session → `awaiting_approval`

Dispatcher continues to step 3 (type: `report`):
- `ReconciliationReportFormatter.matches(...)` → true
- Formatter generates report text from `accumulated_context`
- Session → `completed` (no LLM turn needed for steps 2 and 3)

### Approval Execution

For each approved `reconcile_posting` action:
```
ReconcilePostingExecutor.execute(action, auth)
  → reads payload.posting_id, payload.matched_reference
  → calls confirmReconciliation(posting_id, auth)
     → if invoice match: creates payment_receipt, links posting
     → if receipt match: links posting to existing receipt
     → sets reconciliation_status = 'MATCHED'
```

---

## Frontend Integration

| Location | Behaviour |
|----------|-----------|
| `PostingForm.tsx` | Reconcile button → `reconcileTransaction({ posting_ids: [id] })` → refresh. Suggestions panel when SUGGESTED. Confirm match → `confirmReconciliation` → refresh. Linked receipt section when MATCHED. |
| `Transactions.tsx` | Bulk Reconcile button; row-level Reconcile icon (Sparkles); results merged in-place (no full reload); predicted account cell highlighted; SUGGESTED rows show "Match found" button → modal |
| `ReconciliationSuggestionsModal.tsx` | Modal from list view: best_match + alternatives + Confirm match |
| `frontend-1/src/api/api.ts` | `reconcileTransaction({ posting_ids })`, `confirmReconciliation({ posting_id })` |

---

## Seed Data & Demo (Indian Demo)

### Pre-linked postings (5)

These are seeded `MATCHED` with `payment_receipt_id`:

| Posting | Receipt | Receipt Number |
|---------|---------|----------------|
| post_demo_01 | payr_demo_001 | REC-DEMO-001 |
| post_demo_02 | payr_demo_002 | REC-DEMO-002 |
| post_demo_03 | payr_demo_003 | REC-DEMO-003 |
| post_demo_04 | payr_demo_004 | REC-DEMO-004 |
| post_demo_05 | payr_demo_005 | REC-DEMO-005 |

### Unlinked postings for demo (4)

| Posting | Amount | Description | Intended match |
|---------|--------|-------------|----------------|
| post_demo_21 | ₹60,000 | NEFT credit - INV-006 payment | Invoice INV-006 |
| post_demo_22 | ₹50,000 | RTGS from customer - INV-003 | Invoice INV-003 |
| post_demo_23 | ₹25,000 | IMPS REC-DEMO-006 advance | Receipt REC-DEMO-006 |
| post_demo_24 | ₹45,000 | ACH CREDIT - INV-007 payment | Invoice INV-007 |

### Reset demo postings

```bash
cd backend
npx ts-node prisma/setup-IN/setup-indian-demo.ts --reset-postings
```

This resets the 24 demo postings to their initial state (5 pre-linked, 4 for AI demo) without touching the rest of the DB.

---

## Key Code Pointers

| What | File |
|------|------|
| Suggestions tool | `backend/src/agent/tools/suggestReconciliationMatches.ts` |
| Reconciliation pipeline | `backend/src/services/reconciliation/reconcileImportedPostings.ts` |
| Confirm service | `backend/src/services/reconciliation/confirmReconciliation.ts` |
| Action builder | `backend/src/agent/builders/ReconciliationActionBuilder.ts` |
| Report formatter | `backend/src/agent/builders/ReconciliationReportFormatter.ts` |
| Executor | `backend/src/agent/executors/PendingActionExecutor.ts` (`ReconcilePostingExecutor`) |
| Routes | `backend/src/agent/routes.ts` — `/erp/reconcile-transaction`, `/erp/confirm-reconciliation` |
| Posting view datagraph | `backend/prisma/metadata/views/posting_posting_view.json` |
| E2E test | `backend/src/agent/__tests__/v2-create-posting-e2e.test.ts` |
