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

## 6. Working examples

Accounts used below (entity defaults):

| Alias | Account | Role |
|---|---|---|
| **AR** | Accounts Receivable | Control |
| **Income** | Sales income | Revenue |
| **Tax** | Tax payable | Liability |
| **UF** | Undeposited Funds | Deposit-to (QBO default) |

Each `posting` row is one balanced pair: `debit_account_id` / `credit_account_id` / `amount`.  
**Applications never create postings** in these examples (no FX).

### 6.1 Full pay — one invoice, one receipt

Customer owes **$110** (\$100 net + \$10 tax). Pays in full.

**Documents**

| Model | Key fields |
|---|---|
| `invoice` INV-1 | `net_amount=100`, `tax_amount=10`, `total_amount=110`, `balance_amount=0` |
| `payment_receipt` R-1 | `amount=110`, `unapplied_amount=0`, `account_id=UF`, `invoice_id=INV-1` (convenience) |
| `payment_receipt_application` | `target_type=invoice`, `invoice_id=INV-1`, `amount_applied=+110` |

**T1:** `110 = 110 + 0`. **T2:** `balance 0 = 110 − 110`.

**Postings (Phase 4)**

| When | `posting_key` | Debit | Credit | Amount | FK |
|---|---|---|---|---|---|
| Invoice date | `inv:INV-1:income:…` | AR | Income | 100 | `invoice_id` |
| Invoice date | `inv:INV-1:tax:…` | AR | Tax | 10 | `invoice_id` |
| Receipt date | `payr:R-1:cash` | UF | AR | 110 | `payment_receipt_id` |
| Application | — | — | — | — | none |

**AR movement:** +110 (invoice) −110 (receipt) = **0**.

```
Day 1  INV-1 posted     AR 110 | Income 100
                        AR     | Tax 10
Day 2  R-1 posted       UF 110 | AR 110
       app +110 → INV-1 (subledger only)
```

---

### 6.2 Partial pay — balance left on invoice

Invoice **$110**. Customer pays **$40**.

| Model | Key fields |
|---|---|
| `invoice` INV-1 | `total_amount=110`, `balance_amount=70` |
| `payment_receipt` R-1 | `amount=40`, `unapplied_amount=0` |
| `payment_receipt_application` | `invoice_id=INV-1`, `amount_applied=+40` |

**T1:** `40 = 40 + 0`. **T2:** `70 = 110 − 40`.

| Posting | Dr | Cr | Amt |
|---|---|---|---|
| Invoice (same as 6.1) | AR | Income / Tax | 100 + 10 |
| Receipt | UF | AR | **40** |
| Application | — | — | — |

**AR:** +110 − 40 = **70** open (matches `balance_amount`).

---

### 6.3 One receipt → two invoices

Receipt **$300** applied **$100** to INV-A and **$200** to INV-B.

| Model | Key fields |
|---|---|
| `invoice` INV-A | `total=100`, `balance=0` |
| `invoice` INV-B | `total=200`, `balance=0` |
| `payment_receipt` R-1 | `amount=300`, `unapplied_amount=0`, `invoice_id=null` |
| `payment_receipt_application` #1 | `invoice_id=INV-A`, `amount_applied=+100` |
| `payment_receipt_application` #2 | `invoice_id=INV-B`, `amount_applied=+200` |

**T1:** `300 = 100 + 200 + 0`.

| Posting | Dr | Cr | Amt | Note |
|---|---|---|---|---|
| INV-A | AR | Income… | 100 | own legs |
| INV-B | AR | Income… | 200 | own legs |
| R-1 | UF | AR | **300** | **one** cash posting for the whole receipt |
| Apps | — | — | — | split is subledger-only |

Do **not** create two cash postings of 100 and 200 — cash hit the bank/UF once.

---

### 6.4 Overpayment — unapplied cash

Invoice **$100**. Customer pays **$120**.

| Model | Key fields |
|---|---|
| `invoice` INV-1 | `total=100`, `balance=0` |
| `payment_receipt` R-1 | `amount=120`, `unapplied_amount=20` |
| `payment_receipt_application` | `invoice_id=INV-1`, `amount_applied=+100` |

**T1:** `120 = 100 + 20`.

| Posting | Dr | Cr | Amt |
|---|---|---|---|
| Invoice | AR | Income… | 100 |
| Receipt | UF | AR | **120** |

**AR:** +100 − 120 = **−20** credit on the customer (the unapplied \$20).  
Close check: `Σ invoice.balance(0) − Σ unapplied(20) − Σ credit.balance(0) = −20` = GL A/R.

Later, when the \$20 is applied to INV-2:

| Change | Values |
|---|---|
| New app | `invoice_id=INV-2`, `amount_applied=+20` |
| R-1 | `unapplied_amount=0` (amount still 120) |
| INV-2 | `balance` drops by 20 |
| **New posting?** | **No** — cash already posted; only subledger moves |

---

### 6.5 Unapplied advance — no invoice yet

Customer prepays **$500**.

| Model | Key fields |
|---|---|
| `payment_receipt` R-1 | `amount=500`, `unapplied_amount=500`, `payment_type=advance` |
| applications | *(none)* |

**T1:** `500 = 0 + 500`.

| Posting | Dr | Cr | Amt |
|---|---|---|---|
| Receipt | UF | AR | 500 |

Customer shows **\$500** credit (unapplied). When an invoice later appears and is applied, **no new cash posting** — only a new `payment_receipt_application` row and `unapplied_amount` drops.

---

### 6.6 Credit memo + \$0 payment (QBO-style apply credit)

Invoice **$100**. Credit note **$30**. Applied together via a **\$0** QBO Payment (QBO never links CN→INV directly).

**After credit is issued (before apply)**

| Model | Key fields |
|---|---|
| `invoice` INV-1 | `total=100`, `balance=100` |
| `credit_note` CN-1 | `total=30`, `balance_amount=30`, `invoice_id=null` (or origin INV if known) |

| Posting | Dr | Cr | Amt |
|---|---|---|---|
| INV-1 | AR | Income… | 100 |
| CN-1 | Income… | AR | 30 |

**AR:** +100 − 30 = **70** (open invoice 100, open credit 30).

**Apply via \$0 payment R-0**

| Model | Key fields |
|---|---|
| `payment_receipt` R-0 | `amount=0`, `unapplied_amount=0` |
| app #1 | `target_type=invoice`, `invoice_id=INV-1`, `amount_applied=+30` |
| app #2 | `target_type=credit_note`, `credit_note_id=CN-1`, `amount_applied=−30` |

**T1:** `0 = (+30) + (−30) + 0`.

| After apply | balance |
|---|---|
| INV-1 | `balance_amount=70` (= 100 − 30) |
| CN-1 | `balance_amount=0` |

| Posting for R-0 / apps | |
|---|---|
| Receipt cash | **none** (`amount=0` → `ledger_status=not_required`) |
| Applications | **none** (pure A/R↔A/R settlement) |

**AR after apply:** invoice open 70 + credit open 0 = **70** (same net as before apply; credit is now attached to the invoice).

```
                    INV-1          CN-1           R-0
                    total 100      total 30       amount 0
Before apply        bal 100        bal 30
Apps                +30  ←———————  −30
After               bal 70         bal 0
GL change from apps: none
```

---

### 6.7 Payment + credit on same invoice (cash and credit together)

Invoice **$100**. Credit **$30**. Customer pays **$70** cash. QBO Payment `TotalAmt=70` with two LinkedTxn lines.

| Model | Key fields |
|---|---|
| `invoice` INV-1 | `total=100`, `balance=0` |
| `credit_note` CN-1 | `total=30`, `balance=0` |
| `payment_receipt` R-1 | `amount=70`, `unapplied_amount=0` |
| app #1 | `invoice`, INV-1, `amount_applied=+100` |
| app #2 | `credit_note`, CN-1, `amount_applied=−30` |

**T1:** `70 = 100 + (−30) + 0`.

| Posting | Dr | Cr | Amt |
|---|---|---|---|
| INV-1 | AR | Income… | 100 |
| CN-1 | Income… | AR | 30 |
| R-1 | UF | AR | **70** |
| Apps | — | — | — |

**AR:** +100 − 30 − 70 = **0**.

---

### 6.8 Native apply credit (no QBO \$0 payment) — `credit_note_application`

Same economics as 6.6, but Books UI (or Xero/Zoho sync) writes a direct allocation — **no** `payment_receipt`.

| Model | Key fields |
|---|---|
| `invoice` INV-1 | `total=100`, `balance=70` |
| `credit_note` CN-1 | `total=30`, `balance=0` |
| `credit_note_application` | `credit_note_id=CN-1`, `invoice_id=INV-1`, `amount_applied=30` |

No receipt. **No new posting.** Only balances move.  
T2: `70 = 100 − 0 − 30` (receipt apps + credit apps).

---

### 6.9 Cheat sheet — who holds which number

| Number | Lives on | Updated when |
|---|---|---|
| Invoice total (immutable after post) | `invoice.total_amount` | Invoice create/edit |
| Invoice open balance | `invoice.balance_amount` | Apps change (or QBO snapshot on sync) |
| Cash collected | `payment_receipt.amount` | Receipt create (fixed) |
| Cash not yet allocated | `payment_receipt.unapplied_amount` | Apps change |
| How much of this receipt hit this doc | `payment_receipt_application.amount_applied` (±) | Apply / unapply |
| Credit open | `credit_note.balance_amount` | Apps change |
| Direct credit→invoice (non-QBO) | `credit_note_application.amount_applied` | Apply credit UI / Xero-Zoho |
| GL A/R / cash / income | `posting` rows on **invoice / credit_note / receipt** | Phase 4 poster — **not** on application rows |

**Rule of thumb:** applications rearrange AR subledger; postings record economic events (sell, credit, cash in).

---

## 7. Rollout

| Phase | Scope |
|---|---|
| **3** | Schema delta §3.1–3.7; dbt payments + credit memos; signed apps; resolver + sweep; void detection; Master views; **no GL** |
| **4** | `entity_ledger_settings`; posting delta; shared poster; backfill `ledger_status=pending`; AR tie-out T4; single functional currency |
| **Later** | Deposits, RefundReceipt, multi-currency FX legs, per-agency tax split |

**Non-goals:** reverse sync, Bills/PO, Intuit webhooks, importing QBO GL as SoT.

---

## 8. Open decisions (need product call)

1. **Ledger cutover** — post all history vs `ledger_start_date` + opening balances (**recommend B** if openings already exist).
2. **Bank feed vs QBO cash** — avoid double-count: match-only bank lines on QBO-sourced accounts (**recommend A**) vs clearing account.
3. **Multi-currency in Phase 4** — block non-functional docs (**recommend A**) vs add `posting.currency_id` now.
4. **QBO Deposits in Phase 4 or later** — without them UF/bank vs QBO will diverge on presentation (TB still balances).
5. **Void in closed period** — retroactive reverse (**A**, QBO-like) vs detection-dated contra (`sales_void`).

---

## 9. Stub gaps this design closes

1. Application requires `invoice_id` — cannot store credit or $0 dual lines.  
2. No application / credit-line lineage — no idempotent merge or sweep.  
3. No `unapplied_amount` — advances invisible.  
4. `posting.payment_receipt_id @unique` — blocks reverse/repost.  
5. No `posting.credit_note_id`, no void metadata, no ledger state, no default AR accounts beyond tax payable.
