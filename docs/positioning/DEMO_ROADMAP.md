# Demo Roadmap: Reconciliation + AR (Clean Demo, Proper Data)

**Goal**: Build just enough to show a **clean, repeatable demo** with **proper data** — not full production feature set. Focus: **Bank/ledger reconciliation** and **AR (aging, DSO, cash application)** as the two lead stories.

**Principle**: Every demo step should use **realistic, consistent data** (one demo org, one set of accounts, invoices, payments, bank lines) so the narrative holds and screenshots stay valid.

---

## 1. Demo Data Foundation (Do First)

**Purpose**: One “demo company” with data that supports both reconciliation and AR stories. No demo should depend on empty lists or random seed data.

| Task | Description | Output |
|------|-------------|--------|
| **1.1 Demo org + chart of accounts** | Create or designate one `org_id` as demo org. Ensure chart of accounts has clear bank/cash accounts and a few expense/revenue accounts. | `org_demo` (or existing org); `account` records with names like "Operating Bank", "Payroll Account", "AR Clearing". |
| **1.2 Demo customers + payment terms** | 3–5 customers with names, payment terms (Net 30, Net 15). | `customers`, `payment_terms` linked. |
| **1.3 Sales invoices (AR story)** | 8–12 sales invoices: mix of paid, partially paid, overdue, current. Use consistent invoice numbers (e.g. INV-001 … INV-012). Some with `balance_amount` > 0, some with balance = 0. | `invoice` (invoice_type = SALES), with `invoice_date`, `invoice_total`, `balance_amount`, `customer_id`. |
| **1.4 Payment receipts (AR + rec)** | 5–8 payment_receipts: some linked to invoices (FULL/PARTIAL), 1–2 unapplied (invoice_id null or ADVANCE). Include `payment_reference` that matches invoice numbers where intended. | `payment_receipt` with `invoice_id`, `amount`, `payment_type`, `payment_reference`. |
| **1.5 Bank/ledger postings (reconciliation story)** | 15–25 `posting` records that look like a bank statement: mix of debits/credits, with `value_date`, `description`, `account_id` = bank account. Ensure a subset can be **matched** to payment_receipts or invoices (same amount, same date or close). Leave 3–5 “unmatched” for “agent suggests match” moment. | `posting` with bank account, dates, amounts, descriptions (e.g. "ACH CREDIT", "CHECK 1001", "PAYMENT FROM ACME"). |
| **1.6 Optional: ERP sync** | If demo shows “data from QuickBooks/Xero,” run sync for demo org or use seed that populates from a fixture so `source_system_id` / `source_record_id` are set. | Same entities with lineage filled. |

**Deliverable**: Script or seed (e.g. `scripts/seed-demo-data.ts` or SQL) that creates or resets this dataset so anyone can run “demo mode” in one go.

---

## 2. Reconciliation Demo Path (Clean Demo)

**Story**: “I have bank transactions in Fabriq. I ask the agent to reconcile and explain; it suggests matches and I confirm.”

| # | Step | What to build / have | Demo action |
|---|------|----------------------|-------------|
| **R1** | **Bank data in Fabriq** | Postings (from 1.5) visible in UI: list of transactions for the bank account, with date, description, debit/credit. | Show Transactions (or Posting) list filtered by bank account. *[Screenshot: list of bank lines]* |
| **R2** | **Agent: “What’s unreconciled?”** | Analytics or agent answer: count/sum of postings for bank account that are “unmatched” (or not yet marked reconciled). If no reconciliation model yet, “unreconciled” = all postings for that account in a given period. | Ask agent: “Which bank transactions are unreconciled for [account]?” or “Show unreconciled bank lines.” *[Screenshot: agent response with list or count]* |
| **R3** | **Agent: “Suggest match for this transaction”** | Logic: given a posting (bank line), find payment_receipt or invoice with same amount (±tolerance) and same/close date; return top 1–3 suggestions. Can be agent tool (e.g. `suggestReconciliationMatch(postingId)`) or simple API the agent calls. | Pick one bank line. Ask: “What does this transaction match?” or “Suggest a match for this line.” Show suggested payment or invoice. *[Screenshot: suggestion]* |
| **R4** | **Mark as matched (optional)** | If you have a `reconciliation_match` or link table: create record linking posting ↔ payment_receipt (or invoice). If not, “confirm” can be a workflow state or a note. Minimum: show in UI that this line is “matched” to [payment X]. | User (or agent) confirms match. UI shows “Matched to Payment REC-001” (or similar). *[Screenshot: matched state]* |
| **R5** | **Agent: “Explain this transaction”** | For a posting, agent returns 1–2 sentences using description, amount, date, and if matched, the linked payment/invoice. Uses existing agent + search or a small prompt. | Ask: “Explain this transaction” (with context on selected posting). *[Screenshot: explanation]* |

**Build priority for reconciliation demo**: 1.5 (data) → R2 (unreconciled list/count) → R3 (suggest match) → R4 (mark matched, can be minimal) → R5 (explain). R1 is existing posting list with filter.

---

## 3. AR Demo Path (Clean Demo)

**Story**: “I have receivables and payments. I ask the agent what’s overdue and who to chase; it suggests payment allocation and I apply.”

| # | Step | What to build / have | Demo action |
|---|------|----------------------|-------------|
| **A1** | **Invoices and payments in Fabriq** | Invoices (1.3) and payment_receipts (1.4) visible: Invoice list (SALES) with balance, due date; Payment list with applied/unapplied. | Show Invoice list (filter SALES, show balance, due date). Show Payment list (show unapplied). *[Screenshot: invoice list] [Screenshot: payment list]* |
| **A2** | **Agent: “What’s overdue?”** | Agent returns overdue invoices (balance > 0, due date < today), e.g. by customer or as a list. Uses analytics/agent + invoice + payment_terms. | Ask: “Which invoices are overdue?” or “Overdue by customer.” *[Screenshot: agent response]* |
| **A3** | **Agent: “What’s our DSO?”** | Agent computes DSO (e.g. (total receivables / revenue) * days in period) from invoice/payment_receipt. Can be analytics query + prompt. | Ask: “What is our DSO?” *[Screenshot: agent response]* |
| **A4** | **Agent: “Who should I follow up with?”** | Agent returns top N customers by overdue balance or count of overdue invoices. Uses same data as A2, sorted. | Ask: “Who should I follow up with for collections?” *[Screenshot: agent response]* |
| **A5** | **Agent: “Suggest match for this payment”** | Given an unapplied payment_receipt, suggest 1–3 invoices (same customer, amount exact or split across invoices). Agent tool `suggestCashApplication(payment_id)` or equivalent. | Pick unapplied payment. Ask: “Which invoices should this payment apply to?” *[Screenshot: suggested invoices]* |
| **A6** | **Apply payment** | Create/update payment_receipt with `invoice_id` (and amount if partial); update invoice `balance_amount`. Can be agent-driven (“Apply this payment to INV-003”) or button in UI. | Confirm application. Show payment now linked to invoice and invoice balance updated. *[Screenshot: before/after]* |

**Build priority for AR demo**: 1.1–1.4 (data) → A2 (overdue) → A3 (DSO) → A4 (who to follow up) → A5 (suggest match) → A6 (apply payment). A1 is existing invoice/payment lists.

---

## 4. Unified Demo Script (5–7 Minutes)

**Segment 1 — Reconciliation (2–3 min)**  
1. Open Fabriq, go to Transactions (posting) for demo org.  
2. Filter by bank account; show 10–15 lines. *[Screenshot]*  
3. Ask agent: “Which of these bank transactions are unreconciled?” Show answer. *[Screenshot]*  
4. Pick one line. Ask: “What does this transaction match?” Show suggested payment/invoice. *[Screenshot]*  
5. Confirm match (or mark reconciled). Ask: “Explain this transaction.” Show explanation. *[Screenshot]*

**Segment 2 — AR (2–3 min)**  
1. Go to Invoices (or ask agent). “Which invoices are overdue?” Show list. *[Screenshot]*  
2. “What’s our DSO?” Show number. *[Screenshot]*  
3. “Who should I follow up with?” Show top customers. *[Screenshot]*  
4. Go to Payments, pick unapplied payment. “Suggest which invoices this applies to.” Show suggestion. *[Screenshot]*  
5. Apply payment; show updated invoice balance. *[Screenshot]*

**Segment 3 — Hook (1 min)**  
“This runs on top of your existing books — we sync from QuickBooks, Xero, or Zoho, or you can import bank statements. One agent for reconciliation and AR.”

---

## 5. Build Order (Checklist)

**Phase 1 — Data**  
- [ ] Demo org + chart of accounts (1.1)  
- [ ] Demo customers + payment terms (1.2)  
- [ ] Sales invoices with mix of statuses (1.3)  
- [ ] Payment receipts: applied + unapplied (1.4)  
- [ ] Bank postings with matchable subset (1.5)  
- [ ] Seed script/command to reset demo data (repeatable)

**Phase 2 — Reconciliation demo**  
- [ ] Posting list filterable by account (R1)  
- [ ] Agent/analytics: “unreconciled” for bank account (R2)  
- [ ] Suggest match: posting → payment_receipt/invoice (R3)  
- [ ] Mark as matched (minimal: state or link) (R4)  
- [ ] Agent: “Explain this transaction” (R5)

**Phase 3 — AR demo**  
- [ ] Invoice list (SALES) with balance, due date (A1)  
- [ ] Payment list with applied/unapplied (A1)  
- [ ] Agent: overdue invoices (A2)  
- [ ] Agent: DSO (A3)  
- [ ] Agent: who to follow up (A4)  
- [ ] Suggest cash application (A5)  
- [ ] Apply payment + update balance (A6)

**Phase 4 — Polish**  
- [ ] Run full script once; fix any data/UI gaps  
- [ ] Capture screenshots for slides  
- [ ] Document “How to run the demo” (env, seed command, which org to log in as)

---

## 6. Out of Scope for “Clean Demo” (Later)

- Full reconciliation UI (e.g. side-by-side bank vs ledger).  
- Remittance PDF capture.  
- Posting payments back to ERP.  
- Email reminders.  
- Dispute model.  
- Multi-entity view (can be one slide “coming next” if needed).

This roadmap keeps the **first milestone** to a **single demo** (reconciliation + AR) with **one coherent dataset** and **clear next steps** for build and content (internal doc + slides).
