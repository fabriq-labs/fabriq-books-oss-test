# AR settlement & ledger — Phase 3 / 4 design

**Status:** design (data model first). Implements QBO plan Phase 3 (payments + credit memos) and Phase 4 (ledger postings).  
**Depends on:** universal sales schema ([`SALES_MODEL.md`](./SALES_MODEL.md)), forward sync ([`QBO_INTEGRATION_PLAN.md`](./QBO_INTEGRATION_PLAN.md)).  
**Researched against:** QBO Payment / CreditMemo / LinkedTxn, Xero Allocation / Overpayment, Stripe InvoicePayment + CreditNote, NetSuite customer payment apply, Zoho Books customer payments.

---

## 1. Problem

QBO (and peers) separate three concerns Books must also separate:

| Concern | QBO | Books today |
|---|---|---|
| AR document (invoice / credit) | Invoice, CreditMemo | `invoice`, `credit_note` (credit stub thin) |
| Cash event | Payment | `payment_receipt` (stub) |
| Settlement between docs | Payment.Line LinkedTxn (signed) | `payment_receipt_application` (invoice-only, required FK) |
| GL | Auto-posts on doc date; applications usually silent | `posting` (invoice/receipt FKs; receipt is `@unique`) |

**Close invariant (target):**

```
GL A/R  =  Σ invoice.balance_amount
         − Σ payment_receipt.unapplied_amount
         − Σ credit_note.balance_amount
```

---

## 2. What other products agree on

1. **Receipt amount is fixed; applications are separate, many-to-many, partial.**
2. **`applied + unapplied = receipt amount`.**
3. **Document balance = total − applications** (cash or credit).
4. **Applying cash/credit between two A/R docs is usually subledger-only** (no GL), except FX or A/R-account reclass.
5. **Void/delete reverses; do not silently edit history.**
6. **Applications need their own source id** (Xero AllocationID, Zoho invoice_payment_id, QBO `{PaymentId}:{TxnType}:{TxnId}`).

**QBO-specific:** credit is applied to an invoice **only through a Payment** (often `$0`). There is no direct CreditMemo→Invoice link. Xero/Zoho *do* have direct credit allocations — Books should support both.

**Stripe lesson:** demote 1:1 `payment → invoice` pointers; use an application join table (they replaced `invoice.payment_intent` with `InvoicePayment`).

---

## 3. Data model (core)

Conventions: `Decimal(19,4)` money, `Decimal(19,6)` rates, lowercase enums, `org_id`, lineage  
`(source_system_id, source_record_id, source_updated_at, ingest_batch_id)` +  
`@@unique([org_id, source_system_id, source_record_id])`. Additive schema only.

### 3.1 New enums

```prisma
enum settlement_target_type {
  invoice
  credit_note
  payment_receipt   // rare: LinkedTxn TxnType=Payment
  journal_entry     // QBO A/R JE; not a Books doc yet
  refund            // Check / Expense / CreditCardCredit
  other
}

enum ledger_status {
  pending
  posted
  blocked
  not_required
}
```

### 3.2 `payment_receipt` (additive)

| Add / change | Purpose |
|---|---|
| `unapplied_amount Decimal(19,4) @default(0)` | QBO `UnappliedAmt`; required for T1 |
| `receivable_account_id → account?` | QBO `ARAccountRef` |
| `voided_at`, `void_reason` | Source void / CDC delete |
| `ledger_status`, `ledger_error`, `ledger_posted_at` | Phase 4 poster state |
| `invoice_id` | **Demote** — convenience only when exactly one invoice application; never use in balance math |
| `posting posting?` → `postings posting[]` | Drop 1:1; allow reverse + repost |

**Invariant T1:** `amount = Σ applications.amount_applied + unapplied_amount` (±0.01).

### 3.3 `payment_receipt_application` (reshape)

| Field | Notes |
|---|---|
| `target_type settlement_target_type` | default `invoice` |
| `invoice_id` | **nullable**; required only when target is invoice |
| `credit_note_id → credit_note?` | for CreditMemo lines |
| `target_source_record_id` | remote TxnId before local FK resolves |
| `amount_applied` | **signed**: `+` settles invoice debit; `−` consumes credit |
| `applied_date?` | null ⇒ receipt date |
| lineage quartet | `source_record_id = {PaymentId}:{TxnType}:{TxnId}` |

SQL CHECKs: invoice target ⇒ `amount_applied ≥ 0` and no credit FK; credit target ⇒ `amount_applied ≤ 0` and no invoice FK.

Typed FKs (not polymorphic `target_id`) so Master `data_graph` can select `invoice{number}` / `credit_note{number}`.

### 3.4 `credit_note` / `credit_note_item` (additive)

- Keep `invoice_id` as **origin** invoice (what is credited), not settlement.
- Add void + ledger fields (same as receipt).
- Add lineage on **items**: `source_record_id = {CreditMemoId}:{Line.Id}`.
- Add `account_id` on lines from QBO `ItemAccountRef` (same fix as invoices).

### 3.5 NEW `credit_note_application`

Direct credit→invoice allocation (Xero / Zoho / native UI). **QBO sync never writes this** — QBO uses $0 payments instead.

Fields: `credit_note_id`, `invoice_id`, `amount_applied > 0`, `applied_date`, lineage.

### 3.6 NEW `credit_note_line_tax`

Parity with `invoice_line_tax` (header tax still on credit_note; line tax for native / other ERPs).

### 3.7 `invoice` (additive)

`voided_at`, `void_reason`, `ledger_*` fields. Relation to `credit_note_application`.

**T2 (warn for sync):**  
`balance = total − Σ receipt apps (invoice target) − Σ credit_note_application`.

### 3.8 NEW `entity_ledger_settings` (Phase 4)

Per entity: default AR, income, undeposited funds, FX gain/loss, discount; optional `ledger_start_date` cutover.

### 3.9 Do not store

Customer balance ledger, aging buckets, derived “paid/partial” status, applied-total column, per-application FX rates, QBO SyncToken / LinkedTxn back-pointers.

**Do persist** `balance_amount` / `unapplied_amount` (Master cannot aggregate in `data_graph`).

---

## 4. QBO → Books mapping (Phase 3)

| Stream | Header | Children |
|---|---|---|
| `qb_payments` | → `payment_receipt` | Line×LinkedTxn → `payment_receipt_application` (signed) |
| `qb_credit_memos` | → `credit_note` | SalesItem / Discount / Group lines → `credit_note_item` |

Ignore CreditMemo.LinkedTxn (back-pointers to payments). Applications come from the Payment side only.

**Resolver:** fill null `invoice_id` / `credit_note_id` from `target_source_record_id` after each run (payments may land before invoices).  
**Orphan sweep:** delete application/line rows whose lineage disappeared from staging (merge alone never deletes).  
**Voids:** `PrivateNote` starts with `Voided` → `status=void`. Hard deletes need CDC (Airbyte does not); fallback monthly id-diff.

**Deposits:** later (`bank_deposit`); Phase 3 leaves receipts on Undeposited Funds.

---

## 5. Phase 4 posting model

| Document | Typical legs | `value_date` |
|---|---|---|
| Invoice | Dr AR / Cr income (+ tax liability) | `invoice_date` |
| Credit note | Dr income(+tax) / Cr AR | `credit_note_date` |
| Receipt | Dr deposit(cash/UF) / Cr AR | `receipt_date` |
| Application | Usually **none**; optional FX / AR reclass | `applied_date` |

**Schema:** add `posting.credit_note_id`; add `posting_key` with partial unique on active rows; **drop** `@unique` on `payment_receipt_id`. New kinds: `sales_credit_note`, `sales_receipt`, `sales_settlement`.

**Poster:** idempotent reverse-and-repost by `posting_key`; set `ledger_status`. Shared with native Track B `postInvoice` / `postReceipt` / `postCreditNote` so sync backfill cannot double-post.

**Order:** dbt docs → resolve/sweep → tests T1–T3 → poster (invoice → credit → receipt → app FX).

---

## 6. Rollout

| Phase | Scope |
|---|---|
| **3** | Schema delta §3.1–3.7; dbt payments + credit memos; signed apps; resolver + sweep; void detection; Master views; **no GL** |
| **4** | `entity_ledger_settings`; posting delta; shared poster; backfill `ledger_status=pending`; AR tie-out T4; single functional currency |
| **Later** | Deposits, RefundReceipt, multi-currency FX legs, per-agency tax split |

**Non-goals:** reverse sync, Bills/PO, Intuit webhooks, importing QBO GL as SoT.

---

## 7. Open decisions (need product call)

1. **Ledger cutover** — post all history vs `ledger_start_date` + opening balances (**recommend B** if openings already exist).
2. **Bank feed vs QBO cash** — avoid double-count: match-only bank lines on QBO-sourced accounts (**recommend A**) vs clearing account.
3. **Multi-currency in Phase 4** — block non-functional docs (**recommend A**) vs add `posting.currency_id` now.
4. **QBO Deposits in Phase 4 or later** — without them UF/bank vs QBO will diverge on presentation (TB still balances).
5. **Void in closed period** — retroactive reverse (**A**, QBO-like) vs detection-dated contra (`sales_void`).

---

## 8. Stub gaps this design closes

1. Application requires `invoice_id` — cannot store credit or $0 dual lines.  
2. No application / credit-line lineage — no idempotent merge or sweep.  
3. No `unapplied_amount` — advances invisible.  
4. `posting.payment_receipt_id @unique` — blocks reverse/repost.  
5. No `posting.credit_note_id`, no void metadata, no ledger state, no default AR accounts beyond tax payable.
