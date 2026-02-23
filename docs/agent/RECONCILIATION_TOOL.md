# Reconciliation Tool — Overview & Implementation

**Audience:** Product, support, and engineers.  
**See also:** [AI_Categorizer.md](./AI_Categorizer.md) (transaction categorization), [END_USER_CONVERSATION_FLOW.md](./END_USER_CONVERSATION_FLOW.md), [AI_AGENT.md](../AI_AGENT.md).

---

## Quick Reference

| Item | Details |
|------|---------|
| **Pipeline** | `reconcileImportedPostings(postingIds, auth)` in `backend/src/services/reconciliation/reconcileImportedPostings.ts`. Runs: batch categorize → filter incoming (amount > 0) → per-posting `findSuggestionsForPosting` → pick best match → set `reconciliation_status` = `SUGGESTED` or `UNMATCHED`, `matched_reference`, and AI notes block in `posting.notes`. |
| **Reconcile API** | `POST /api/agent/erp/reconcile-transaction` body `{ posting_ids: string[] }` (single or batch). Returns `{ results: Array<{ posting, reconciliation: { status, best_match, alternatives } }> }`. Postings are re-fetched with **posting_view** data_graph (nested account names, etc.) so the list can merge them without a full reload. |
| **Confirm API** | `POST /api/agent/erp/confirm-reconciliation` body `{ posting_id }`. Creates payment receipt (if match is invoice) or links to existing receipt; sets `posting.payment_receipt_id` and `reconciliation_status` = `MATCHED`. Returns the **full posting in data_graph shape** (same as list view) for in-place row update. |
| **Frontend** | **PostingForm (detail):** Reconcile button → `reconcileTransaction({ posting_ids: [id] })` → refresh. Suggestions panel when SUGGESTED; Confirm match → `confirmReconciliation`; Linked receipt section when matched. **Transactions list:** Bulk **Reconcile** button (replaces Categorize) and **row-level Reconcile icon** (Sparkles); both call the same reconcile API. Results are merged in-place (no full list reload). Predicted counter-account cell is highlighted; rows with SUGGESTED show a "Match found" button that opens a **suggestions modal**; Confirm in modal updates only that row. |
| **Status lifecycle** | `NULL`/`UNMATCHED` → pipeline sets `SUGGESTED` (match found) or `UNMATCHED` (none). User confirms → **Confirm match** → `MATCHED` and `payment_receipt_id` set. |
| **Test script** | `backend/scripts/test-reconciliation-pipeline.ts`: default = CSV import + pipeline; `--single` = create one posting + pipeline; `--posting-id=post_xxx` = pipeline on existing; `--cleanup` = delete `[TEST-RECON]` postings. npm: `test:reconciliation`, `test:reconciliation:single`, `test:reconciliation:cleanup`. |

---

## What It Does

The **reconciliation tool** suggests how to match **bank statement lines** (postings) to **payment receipts** and **sales invoices**. The user can:

1. **Detail view:** Click **Reconcile** on a posting → pipeline categorizes (debit/credit account) and finds receipt/invoice suggestions; best match is shown with **Confirm match**.
2. **Transactions list:** Select one or more rows and click **Reconcile**, or click the **Reconcile icon** (Sparkles) on a single row. The same API runs; returned postings are merged into the list (no full reload). The predicted counter-account cell is highlighted; rows with a suggestion show a "Match found" button that opens a modal with best match + **Confirm match**. Confirming updates only that row.
3. **Confirm match** (detail or list modal) → system creates a payment receipt (if the suggestion was an invoice) or links the posting to an existing receipt, and sets `posting.payment_receipt_id` and `reconciliation_status` = `MATCHED`.

Categorization (which account to debit/credit) is handled by the same pipeline and uses the same LLM flow as the standalone categorizer; see [AI_Categorizer.md](./AI_Categorizer.md) for prompt and batch behaviour.

---

## Where It Fits

| Layer | What |
|-------|------|
| **Model** | `posting` (bank/journal lines). Optional context: selected bank account, current posting record. |
| **Prompt** | Reconciliation prompt (e.g. `reconciliation_zeiv`) is loaded when `modelName === 'posting'` or when the frontend sends `promptTypes` including `'reconciliation'`. |
| **Tool** | `suggestReconciliationMatches` — registered for the posting model in `ToolManager`; used by the pipeline via `findSuggestionsForPosting`. |
| **Frontend** | Posting detail (PostingForm): Reconcile button, suggestions panel, Confirm match, Linked receipt section. **Transactions list** (`/accounting/transactions`): bulk Reconcile button, row-level Reconcile icon (Sparkles), in-place merge of reconciled rows, cell highlight for predicted account, suggestions modal per row, confirm updates single row. Chat can also drive the tool via `modelContext.selectedAccountId` and `recordId`. |

---

## Implementation Details

### Schema (Prisma)

- **posting** (`backend/prisma/schema/data.prisma`):
  - `reconciliation_status String?` — `'UNMATCHED' | 'SUGGESTED' | 'MATCHED'`
  - `matched_reference String?` — e.g. `"payment_receipt:payr_xxx:REC-001"` or `"invoice:inv_xxx:INV-001"`
  - `payment_receipt_id String? @unique` — FK to `payment_receipt.id` when matched
  - `payment_receipt payment_receipt? @relation("PostingToPaymentReceipt", ...)`
- **payment_receipt** (`backend/prisma/schema/zeiv.prisma`): back-relation `posting posting? @relation("PostingToPaymentReceipt")` (no FK on receipt side; posting holds the link).

### Services

| Service | Path | Role |
|---------|------|------|
| Pipeline | `backend/src/services/reconciliation/reconcileImportedPostings.ts` | Batch categorize → filter incoming → per-posting suggestions → update status, `matched_reference`, notes. |
| Confirm | `backend/src/services/reconciliation/confirmReconciliation.ts` | Parse `matched_reference`; if invoice → create `payment_receipt` and set `posting.payment_receipt_id`; if receipt → set `posting.payment_receipt_id` only; set `reconciliation_status` = `MATCHED`. Idempotent when already MATCHED. |

### APIs

| Method | Path | Body | Behaviour |
|--------|------|------|-----------|
| POST | `/api/agent/erp/reconcile-transaction` | `{ posting_ids: string[] }` | Run pipeline for each posting (single or batch). Returns `{ results: Array<{ posting, reconciliation }> }`. Postings are re-fetched with **posting_view** data_graph (nested relationships) so the list can display account names and merge rows without a full reload. |
| POST | `/api/agent/erp/confirm-reconciliation` | `{ posting_id }` | Call `confirmReconciliation`; return **full posting in data_graph shape** (same as list view) for in-place row update. |

### Frontend

| Location | Behaviour |
|----------|-----------|
| `frontend-1/src/api/api.ts` | `agentAPI.reconcileTransaction({ posting_ids: string[] })` (single or batch), `agentAPI.confirmReconciliation({ posting_id })`. Reconcile response: `data.results` array; confirm response: full posting in data_graph shape. |
| `frontend-1/src/components/forms/Masters/PostingForm.tsx` | **Reconcile** button → `reconcileTransaction({ posting_ids: [id] })` → use `results[0]` → `fetchingDetails`. Suggestions panel when status is SUGGESTED; **Confirm match** → `confirmReconciliation` → refresh. **Linked receipt** section when `initialValues.payment_receipt` exists. Reconcile disabled when both accounts set and receipt linked. |
| `frontend-1/src/pages/Transactions.tsx` | **Bulk Reconcile** (replaces Categorize): calls `reconcileTransaction({ posting_ids })`, returns `mergeRows` so Master merges in-place. **Row-level Reconcile** icon (Sparkles) via `injectRowActions`: same API for one posting; loading state per row; merge single row + update `reconcileResults` / `predictedFields`. Cell highlight for predicted account; **Suggestions** row extra + **ReconciliationSuggestionsModal**; confirm from modal calls `updateRowsInList([posting])`. |
| `frontend-1/src/pages/Master.tsx` | Optional **merge-rows** behaviour: when a bulk action has `returnsMergeRows: true` and returns `{ mergeRows }`, Master merges those rows by `id` instead of refetching. Exposes **`ref.updateRowsInList(rows)`** for single-row updates (e.g. after confirm in modal). Optional props: `cellHighlights`, `renderRowExtra`, `injectRowActions`. |
| `frontend-1/src/components/forms/Masters/ReconciliationSuggestionsModal.tsx` | Modal used from the list: receives reconciliation (best_match, alternatives) as props; **Confirm match** → `confirmReconciliation` → `onConfirmed(updatedPosting)` so the parent can merge the row. |
| `frontend-1/src/components/masters/DynamicTable.tsx` | Optional `cellHighlights` (rowId → columnKey) for predicted-cell highlight; optional `renderRowExtra(row)` for per-row content (e.g. "Match found" button). |

### Posting view data_graph

- **File:** `backend/prisma/metadata/views/posting_posting_view.json`
- **Reconciliation fields:** `reconciliation_status`, `matched_reference`, `payment_receipt_id`, and relation `payment_receipt` with `select`: `id`, `receipt_number`, `amount`, `receipt_date`, `invoice_id`, and nested `invoice` with `invoice_number`, `invoice_total`, `invoice_date`, and `customers` with `id`, `customer_name`. Category is not in the datagraph (dropped from list and form).

### Books behaviour (on Confirm match)

- **Match to invoice:** Create a `payment_receipt` for that invoice (amount, receipt_date, account from posting, customer from invoice); set `posting.payment_receipt_id` and `reconciliation_status` = `MATCHED`.
- **Match to existing receipt:** Set `posting.payment_receipt_id` to that receipt and `reconciliation_status` = `MATCHED`; do not create a new receipt.

This aligns with Zoho Books / QuickBooks: the bank transaction (our posting) holds the link to the payment; matching to an invoice creates the payment in the books.

---

## Matching Logic (High Level)

1. **Amount** — Receipts: bank amount vs receipt amount (with optional tolerance). Invoices: bank amount vs invoice total or `balance_amount` (partials supported).
2. **Reference** — Posting description is parsed for patterns like `INV-001`, `REC-DEMO-001`; matching reference boosts confidence (e.g. high).
3. **Date** — Not a hard filter; used as a soft signal (e.g. within ±30 days → medium confidence).
4. **Confidence** — High: amount + reference; Medium: amount + date; Low: amount only.

The tool treats postings with `reconciliation_status === 'SUGGESTED'` as already processed (suggestions were applied); the UI hides the suggestion panel when the suggested match is the same as the already-linked receipt.

---

## Seed Data & Demo (Indian Demo)

**Script:** `backend/prisma/setup-IN/setup-indian-demo.ts` (run via `node setup-db.js --demo-data=indian-demo` or equivalent).

### Pre-linked postings (5)

These are updated with `reconciliation_status: 'MATCHED'`, `matched_reference`, and `payment_receipt_id` so they appear as already reconciled:

| Posting ID   | Receipt ID     | Receipt Number  |
|--------------|----------------|-----------------|
| post_demo_01 | payr_demo_001  | REC-DEMO-001    |
| post_demo_02 | payr_demo_002  | REC-DEMO-002    |
| post_demo_03 | payr_demo_003  | REC-DEMO-003    |
| post_demo_04 | payr_demo_004  | REC-DEMO-004    |
| post_demo_05 | payr_demo_005  | REC-DEMO-005    |

### Unlinked postings for AI reconciliation demo (4)

These have **no** `payment_receipt_id`; use **Reconcile** in the UI to get suggestions, then **Confirm match** to link:

| Posting ID   | Amount   | Description                          | Intended match        |
|--------------|----------|--------------------------------------|------------------------|
| post_demo_21 | ₹60,000  | NEFT credit - INV-006 payment         | Invoice INV-006        |
| post_demo_22 | ₹50,000  | RTGS from customer - INV-003          | Invoice INV-003        |
| post_demo_23 | ₹25,000  | IMPS REC-DEMO-006 advance             | Receipt REC-DEMO-006   |
| post_demo_24 | ₹45,000  | ACH CREDIT - INV-007 payment         | Invoice INV-007        |

Other postings (e.g. post_demo_06, post_demo_08, post_demo_10, post_demo_12) are also unlinked and can be used for ad-hoc demos; the four above are explicitly seeded with descriptions that match existing invoices/receipts.

### Resetting demo postings only (Indian demo)

To **drop only the reconciliation demo postings** (and any payment receipts created by confirming matches) and **recreate** the 24 demo postings **without** resetting the rest of the database:

```bash
cd backend
npx ts-node prisma/setup-IN/setup-indian-demo.ts --reset-postings
```

**What it does:**

1. Deletes any **payment receipts** that were created when a user clicked **Confirm match** (i.e. not the 6 seeded receipts `payr_demo_001`–`payr_demo_006`).
2. Unlinks and deletes all **demo postings** (`post_demo_01`–`post_demo_24`).
3. Recreates the 24 bank postings with the same amounts, descriptions, and dates.
4. Re-links the first 5 postings to the 5 seeded receipts (MATCHED status).

Use this when you have run reconciliations and confirmations during a demo and want to restore the list to the initial state (5 pre-linked, 4 explicitly unlinked for AI demo, plus the rest) without re-running the full Indian demo setup.

---

## Test Cases & Script

### Reconciliation pipeline script

**Path:** `backend/scripts/test-reconciliation-pipeline.ts`

| Mode    | Command / flag              | Behaviour |
|---------|-----------------------------|-----------|
| Batch   | (default)                   | Import test CSV via UploadService (same path as frontend), run pipeline on created postings, print scorecard. Uses auth `sanjay.gupta@demo-india.com`, org `org_indian_demo`. |
| Single  | `--single`                  | Create one posting with description containing `[TEST-RECON]`, run pipeline, print result. |
| Existing| `--posting-id=post_xxx`     | Run pipeline on the given posting only. |
| Cleanup | `--cleanup`                 | Delete postings whose description contains `[TEST-RECON]`. |

**npm scripts** (in `backend/package.json`): `test:reconciliation`, `test:reconciliation:single`, `test:reconciliation:cleanup`.

**Test CSV:** `backend/test-data/test-bank-statement.csv` (used in batch mode).

### Sample scorecard output

**Batch mode** (`npm run test:reconciliation` or default run) prints a summary and a per-posting table:

```
====================================================================================================
  RECONCILIATION PIPELINE SCORECARD
====================================================================================================
  Postings imported:       8
  Categorized:             8  (100%)
  Incoming payments:       5
  Reconciled (SUGGESTED):  3  (60% of incoming)
  Unmatched:               2
  Skipped (expense/out):   3

----------------------------------------------------------------------------------------------------
DESCRIPTION                                          AMOUNT     CATEGORY               STATUS       BEST MATCH                          CONF
----------------------------------------------------------------------------------------------------
[TEST-RECON] NEFT - INV-001 payment                  100,000    Checking Account       SUGGESTED    receipt:REC-DEMO-001                high
[TEST-RECON] RTGS - INV-004                          120,000    Checking Account       SUGGESTED    invoice:INV-004                     high
[TEST-RECON] IMPS REC-DEMO-006 advance                25,000    Checking Account       SUGGESTED    receipt:REC-DEMO-006                high
[TEST-RECON] Unidentified credit                      15,000    Checking Account       UNMATCHED    —                                    —
[TEST-RECON] Bank charges                              2,500    Checking Account       SKIPPED      —                                    —
...
====================================================================================================
```

**Single posting mode** (`npm run test:reconciliation:single` or `--posting-id=post_xxx`) prints a detailed result for one posting:

```
================================================================================
  SINGLE POSTING PIPELINE RESULT
================================================================================
  Posting ID:       post_abc123
  Description:      [TEST-RECON] NEFT - Infosys balance payment INV-002
  Amount:           35,000
  Date:             2025-10-30
  Is Incoming:      true

  --- Categorization ---
  Predicted:        Checking Account
  Confidence:       high
  Reasoning:        Incoming NEFT payment; description references INV-002. Credit to bank.

  --- Reconciliation ---
  Status:           SUGGESTED
  Best Match:       payment_receipt:REC-DEMO-002 (high)
    Amount:         35,000
    Date:           2025-09-30
    Customer:       Infosys Ltd
  Alternatives:     (1)
    - invoice:INV-002  amt=35,000  conf=medium  customer=Infosys Ltd
================================================================================
```

### Manual test cases

1. **Reconcile → suggestion → Confirm (invoice):** Open an unlinked posting that matches an invoice (e.g. post_demo_21). Click Reconcile; expect SUGGESTED with invoice INV-006. Click Confirm match; expect MATCHED, new payment_receipt created, and Linked receipt section with invoice and customer.
2. **Reconcile → suggestion → Confirm (receipt):** Open post_demo_23. Reconcile → expect suggestion REC-DEMO-006. Confirm match → expect MATCHED and posting linked to existing receipt (no new receipt).
3. **Already linked:** Open post_demo_01. Reconcile button should be disabled (both accounts set + receipt linked). Linked receipt section should show REC-DEMO-001 and invoice details.
4. **Suggestion same as linked:** If a posting already has payment_receipt_id set and the pipeline returns the same receipt as best_match, the suggestions panel is hidden (no duplicate UI).
5. **Transactions list — bulk Reconcile:** Select several unlinked postings; click **Reconcile**. List should not reload; only selected rows update. Predicted account cell is highlighted; SUGGESTED rows show "Match found" button; click it → modal with Confirm match; confirm updates only that row.
6. **Transactions list — row Reconcile icon:** On a row that is not fully categorized, click the Sparkles icon in the actions column. Button shows loading; then that row updates in place with highlight and optional "Match found" as above.

---

## Code and Config (Pointers)

| What | Where |
|------|--------|
| Tool (suggestions) | `backend/src/agent/tools/suggestReconciliationMatches.ts` — `findSuggestionsForPosting`, `MatchSuggestion`, `PostingWithSuggestions` |
| Pipeline | `backend/src/services/reconciliation/reconcileImportedPostings.ts` |
| Confirm service | `backend/src/services/reconciliation/confirmReconciliation.ts` |
| Routes | `backend/src/agent/routes.ts` — `POST /erp/reconcile-transaction` (body `posting_ids[]`; returns postings with data_graph), `POST /erp/confirm-reconciliation` (returns full posting data_graph) |
| Tool registration | `backend/src/agent/ToolManager.ts` (posting model) |
| Reconciliation prompt | `backend/prisma/metadata/prompt-templates/` (view_*_reconciliation_zeiv.txt) |
| PostingForm | `frontend-1/src/components/forms/Masters/PostingForm.tsx` — Reconcile, suggestions panel, Confirm match, Linked receipt |
| Transactions list | `frontend-1/src/pages/Transactions.tsx` — bulk Reconcile, row Reconcile icon, merge-rows, cell highlights, suggestions modal |
| Master (list) | `frontend-1/src/pages/Master.tsx` — `returnsMergeRows`, `ref.updateRowsInList`, `cellHighlights`, `renderRowExtra`, `injectRowActions` |
| Suggestions modal | `frontend-1/src/components/forms/Masters/ReconciliationSuggestionsModal.tsx` — list-view suggestions + Confirm match |
| DynamicTable | `frontend-1/src/components/masters/DynamicTable.tsx` — `cellHighlights`, `renderRowExtra`; `DynamicTableBody.tsx` renders highlight and row extra |
| Bulk actions type | `frontend-1/src/types/bulkActions.ts` — `MergeRow`, `returnsMergeRows`, `onClick` may return `{ mergeRows }` |
| Frontend API | `frontend-1/src/api/api.ts` — `reconcileTransaction({ posting_ids })`, `confirmReconciliation` |
| Posting view | `backend/prisma/metadata/views/posting_posting_view.json` — data_graph (no category; includes payment_receipt with invoice + customers) |

---

## Related Docs

- **[AI_Categorizer.md](./AI_Categorizer.md)** — Transaction categorization (accounts, prompts, batch API). Reconciliation pipeline uses the same categorization step.
- [END_USER_CONVERSATION_FLOW.md](./END_USER_CONVERSATION_FLOW.md) — Chat flows for reconciliation.
- [AI_AGENT.md](../AI_AGENT.md) — Agent and tools overview.
