# Agent plan: next books modules

Feed this file to a coding agent **one module at a time**. Overview: [KERNEL_PORT.md](./KERNEL_PORT.md). Kernel rule: [../kernel/PORTING_A_DOMAIN.md](../kernel/PORTING_A_DOMAIN.md).

AR settlement design (already largely built for sync): [AR_SETTLEMENT_AND_LEDGER.md](./AR_SETTLEMENT_AND_LEDGER.md). Implementation checklist: [AR_PHASE_3_4_IMPLEMENTATION.md](./AR_PHASE_3_4_IMPLEMENTATION.md) — **WP0–WP5 done; WP6–WP7 deferred** (see [Deferred — ledger poster](#deferred--ledger-poster-wp67) below).

## How to run a module

1. Do the module named in the task, then stop. Do not start the next module.
2. Read the files listed for that module before editing. Prefer current-branch schema and screens over copying prod wholesale.
3. Work on a branch from `fabriq-books`. Domain code: `backend/lib/<module>/`, `frontend-0/src/domain/<module>/`. Register via `frontend-0/src/domain/routes.tsx` (`DomainRoutes()`) and `backend/lib/domain.ts`.
4. Kernel files under `backend/src` and under `frontend-0/src` outside `domain/` must not import the product folder.
5. Replace a stub in place. Keep its id prefix and `@@map` name. Do not add a second table.
6. Do not run `prisma db push` or `prisma migrate`. Propose the SQL diff from [../kernel/adding-a-model.md](../kernel/adding-a-model.md) and apply it only if the task says the database is the local one.
7. Do not redeploy an existing prod or dev service. Do not print tokens or `DATABASE_URL`.
8. Seed views with `data_graph`. Restart the backend after registering a model.
9. Prove the module: create a **native** row, list it on the native view, confirm a synced row does not appear there (and vice versa). `npx tsc --noEmit` in `backend` is clean.

## Current status (fabriq-books)

| Area | Status |
|---|---|
| Ledger (chart, transactions, statement import, dry-run categorize, discard) | Done |
| Module 1 — reports, entity, exchange rates, opening balances | Done |
| Parties / items / tax schema + UI | Mostly done (universal model); sync lineage kept |
| QBO forward sync → customers, items, invoices, payments, credit notes | Done (subledger; no GL poster) |
| AR Phase 3–4 WP0–WP5 | Done (schema, dbt, Master UI, entity ledger defaults) |
| **Next — Module 3B native create** (invoice + payment + credit) | **This plan** |
| Module 4 — quote / SO / challan | Parked |
| Purchases (bills, PR, PO) | Parked |
| Investing | Parked |
| WP6 poster + WP7 sync-wire | Deferred (detailed notes below) |
| Reverse sync / push to QBO | **Out of scope** (confirmed) |

## Names already locked

Use these. Do not reintroduce prod names.

| Prod | This branch |
|---|---|
| `posting.account_id` | `debit_account_id` |
| `posting.posting_type` | `kind` |
| `posting.reversal_of_posting_id` | `reverses_id` |
| `posting.legal_entity_id` / `legal_entity_id` | `entity_id` |
| `account.base_currency_id` | `currency_id` |
| `plaid_item` / `plaid_transaction` | `ext_connection` / `ext_transaction` |

Money: `Decimal(19, 4)`. Enums lowercase. `department` stays the kernel model. `currency` and `attachment` stay platform. Do not fill `general_ledger`.

---

## View naming: native vs synced

One Prisma model, **two Master views**. Do not use one combined list for create UX.

### Convention

```
{model}_native_view   → rows with source_system_id IS NULL   (Books-authored)
{model}_synced_view   → rows with source_system_id IS NOT NULL (connector-authored)
```

| Model | Native view | Synced view |
|---|---|---|
| `invoice` | `invoice_native_view` | `invoice_synced_view` |
| `payment_receipt` | `payment_receipt_native_view` | `payment_receipt_synced_view` |
| `credit_note` | `credit_note_native_view` | `credit_note_synced_view` |

**Filters (required in seed `data_graph` / list default filter):**

- Native: `source_system_id` null **and** (for invoice) `direction = sales`.
- Synced: `source_system_id` not null **and** (for invoice) `direction = sales`.

**Nav / routes (preferred):**

| Label | Path | View |
|---|---|---|
| Invoices | `/sales/invoices` | `invoice_native_view` |
| Synced invoices | `/sales/invoices/synced` | `invoice_synced_view` |
| Payments received | `/sales/payments` | `payment_receipt_native_view` |
| Synced payments | `/sales/payments/synced` | `payment_receipt_synced_view` |
| Credit notes | `/sales/credit-notes` | `credit_note_native_view` |
| Synced credit notes | `/sales/credit-notes/synced` | `credit_note_synced_view` |

**Rules:**

1. Create / edit forms bind only to **`_native_view`**. Synced paths are read-only detail (current invoice detail pattern).
2. Native create leaves lineage null: `source_system_id`, `source_record_id`, `source_updated_at`, `ingest_batch_id`.
3. Synced rows: **no edit, no void from Books UI** in this module (mirror only). No push to QBO.
4. Retire or stop linking the old single `invoice_view` / `payment_receipt_view` / `credit_note_view` from nav once dual views are seeded. Keep the old names temporarily as aliases only if a seed migration needs them; do not leave both in the sidebar.
5. Synced list may show Origin / source id columns; native list should not emphasize lineage (columns optional, hidden by default).

---

## Module 3B — Native sales create (invoice, payment, credit)

**Goal.** Create and manage **Books-authored** sales invoices, payment receipts, and credit notes on the same tables QBO sync fills. Dual views separate the two populations. **No GL poster** in this module (see Deferred). **No reverse sync.**

**Already on the branch (do not rebuild):**

- Schema: `invoice`, `invoice_line_item`, `payment_receipt`, `payment_receipt_application`, `credit_note`, `credit_note_item`, `credit_note_application`, tax models, lineage columns, `ledger_*` columns.
- QBO forward sync + WP4 read-only Master lists (today’s single views).
- Customers, items, entity ledger default *columns* (unused until poster).

**Read first.**

- This file (view naming + acceptance).
- [AR_SETTLEMENT_AND_LEDGER.md](./AR_SETTLEMENT_AND_LEDGER.md) §§3, 6.8–6.9 (applications vs postings; native credit apply).
- Current UI: `frontend-0/src/domain/sales/InvoiceForm.tsx`, `PaymentReceiptList.tsx`, `CreditNoteList.tsx`, `routes.tsx`, `navigation.ts`.
- Seeds: `backend/src/utils/setup/seedSales.ts`, `seedArSettlement.ts`.

### Schema

No new header models. Application-level rules only:

| Rule | Detail |
|---|---|
| Direction | Native invoice create always `direction = sales`. |
| Customer | Required on sales invoice / receipt / credit note. |
| Lineage | Native writes must leave lineage null. Reject create/update that sets lineage from the form. |
| Synced immutability | API/UI: if `source_system_id` is set, reject update/delete from native forms. |
| Status | Native invoice: `draft` → `posted` → `void`. Synced rows stay as sync mapped them (`posted` / `void`). |
| Money | Header totals and line amounts `Decimal(19, 4)`. On save, recompute `net_amount` / `tax_amount` / `total_amount` from lines (or require explicit tax fields — pick one approach and document in the form). |
| Balance | On create of a posted invoice with no apps: `balance_amount = total_amount`. Receipt/credit apply updates balances per design T1/T2 **in application code** (do not wait for poster). |
| Payment apply | Prefer `payment_receipt_application` rows (signed amounts). Convenience `payment_receipt.invoice_id` only when exactly one invoice target. |
| Credit apply (native) | Prefer `credit_note_application` (example 6.8). Do **not** invent a $0 payment unless matching QBO shape for tests. |

Optional thin fields if missing for UX: keep using existing columns (`number`, dates, `entity_id`, `currency_id`, `account_id` on receipt, line `item_master_id` / `account_id`).

### Code

**Seeds**

- Extend `seed:sales` / `seed:ar-settlement` (or one `seed:sales-native`) to upsert the six views above with default filters and `data_graph`.
- Permissions / role_view for the new view names.

**Backend**

- Domain helpers under `backend/lib/sales/` for **document persistence and settlement math only** (create/update draft, post status transition, apply payment, apply credit, void native).  
  Names suggestion: `saveNativeInvoice.ts`, `saveNativeReceipt.ts`, `saveNativeCreditNote.ts`, `applySettlement.ts`.
- **Do not** implement `ledgerPosting.ts` / `postInvoice` GL legs here.
- On native `posted` / apply / void: set or leave `ledger_status = pending` (or leave null) so a future poster can pick them up. Do not invent postings.
- Mount routes from `domain.ts` only if the Master view API cannot express the action (e.g. “post draft”, “apply payment”). Prefer view API create/update when sufficient.

**Frontend**

- Forms under `frontend-0/src/domain/sales/`:
  - Native invoice create/edit (lines editor).
  - Native payment create + apply-to-invoice(s).
  - Native credit note create + optional apply via `credit_note_application`.
- Synced detail pages stay read-only; show a clear banner (“Synced from connection — edit in the source system”).
- Wire nav to dual paths; native lists show Create.

### Acceptance

1. Create a native customer invoice with one line → appears on **Invoices** (`invoice_native_view`), **not** on Synced invoices.
2. A QBO-synced invoice appears only on **Synced invoices**. Opening it is read-only; save is rejected if attempted.
3. Native payment against that invoice reduces `balance_amount`; application row visible; receipt on **Payments received** only.
4. Native credit note + `credit_note_application` reduces invoice balance without a $0 payment.
5. Second payment that would drive balance below zero is rejected (or overpay only via explicit unapplied on the receipt — pick one; default: reject over-apply to an invoice).
6. No `posting` rows required for acceptance (poster deferred). Trial balance unchanged by these docs until WP6.
7. Backend `tsc --noEmit` clean.

### Out of scope for Module 3B

- GL poster / WP6–WP7.
- Push to QBO or any reverse sync.
- Quote, sales order, delivery challan (Module 4 parked).
- Purchase bills / PO / PR.
- Editing synced rows, PDF upload, email ingest, tax engine auto-calc beyond storing amounts the user entered (or selected group totals you choose to compute client-side — no new tax service required).

---

## Parked (do not start)

### Module 4 — Quotes, sales orders, delivery challan

Schema absent by design ([SALES_MODEL.md](./SALES_MODEL.md)). Fulfillment-only; no posting until invoice. Revisit when native invoice create is stable and a fulfillment workflow is needed.

### Purchases — bills, purchase orders, requisitions

| Item | Notes |
|---|---|
| Bills | Same `invoice` with `direction = purchase`; `supplier.payable_account_id` exists. No `/purchases/bills`, no `postBill`. |
| PO / PR | Stubs only (`purchase_order`, `purchase_requisition`). No line models, no workflow seed. |
| Why parked | Sales native create + dual-view UX first; AP is a separate engagement. |

Suppliers list/form may stay for tax/catalog; do not expand into bill entry under this plan.

### Investing — instruments, trades, holdings

Stubs only; no `instrument` model. Manual trade posting is a later module after sales native path exists.

### Other stand-downs (unchanged)

| Item | Reason |
|---|---|
| Bank-feed service / bank-transactions screen | Statement CSV/PDF already import |
| Reverse sync / QBO write-back | Product decision: **no** |
| Historical bank↔invoice match | Separate from document create |
| Invoice/bill PDF extractors | Prod-only for now |
| Filling `general_ledger` / copying `category` | Chart is `account`; contra is category |

---

## Deferred — ledger poster (WP6/WP7)

**Status:** Deferred to a later **agentic** (or dedicated) engagement. Do **not** implement under Module 3B.

**Design source:** [AR_SETTLEMENT_AND_LEDGER.md](./AR_SETTLEMENT_AND_LEDGER.md) §5–§6, §8. Checklist: [AR_PHASE_3_4_IMPLEMENTATION.md](./AR_PHASE_3_4_IMPLEMENTATION.md) WP6–WP7.

### Why defer

Subledger sync and (after 3B) native documents can exist without GL. The poster is **mostly deterministic** for happy-path economics, but several **policy decisions and resolution rules are still open**. Coding WP6 without freezing them forces an implementer to invent accounting policy.

### What is already specified (deterministic core)

Use this as the future requirements baseline — do not contradict it when the poster is built.

1. **What creates GL**
   - Invoice → Dr AR / Cr income (+ tax liability when `tax_amount` > 0).
   - Credit note → reverse of invoice legs.
   - Payment receipt → Dr deposit account (UF/bank) / Cr AR for `amount`.
   - **Applications do not post** (no GL on `payment_receipt_application` / `credit_note_application`), except a possible later FX/reclass exception.
   - Receipt `amount = 0` → `ledger_status = not_required` (QBO-style credit apply via $0 payment).

2. **Idempotency**
   - Reverse-and-repost by `posting_key`.
   - Partial unique on active `(org_id, posting_key)`.
   - Kinds: `sales_invoice`, `sales_credit_note`, `sales_receipt` (+ `sales_settlement` only if FX/reclass ever posts).
   - Shared functions for native and sync so backfill cannot double-post.

3. **Order of operations (WP7)**
   - After sync (or on native post): invoices → credit notes → receipts.
   - Then optional app FX (out of scope until multi-currency is chosen).

4. **Close invariant (T4)**
   ```
   GL A/R  =  Σ invoice.balance_amount
            − Σ payment_receipt.unapplied_amount
            − Σ credit_note.balance_amount
   ```

5. **Worked examples** in design §6.1–6.9 (full pay, partial, multi-invoice receipt, overpay, advance, credit+$0 payment, mixed cash+credit, native `credit_note_application`). Future poster tests should encode these fixtures.

6. **Schema already landed (WP5)**
   - `posting.credit_note_id`, `posting_key`, multi-posting per receipt, entity default account columns, `ledger_status` on docs.

### Open decisions that must be frozen before WP6

From design §8 and gaps found in review — **product/agent must choose before coding**:

| # | Topic | Options / recommendation in design | Impact if undecided |
|---|---|---|---|
| 1 | Ledger cutover | Post all history vs honor `entity.ledger_start_date` (+ openings). Design leans cutover date. | Wrong opening AR / duplicate history |
| 2 | Multi-currency | Block non-functional-currency docs (`ledger_status=blocked`) vs FX legs now. Design leans block. | Silent bad rates vs blocked backlog |
| 3 | Bank feed vs QBO cash | Avoid double-count when statement import and QBO receipts both hit cash. | Double cash / AR |
| 4 | Void in closed period | Retroactive reverse vs dated contra void. Design leans reverse. | Audit trail shape |
| 5 | QBO Deposits | Out of Phase 3–4; receipts stay on Undeposited Funds. Confirm still true. | UF vs bank presentation |

### Requirements still thin (agent will guess unless written)

Capture these in the future poster brief:

| Topic | Needed rule |
|---|---|
| Account resolution order | Priority when building legs: line `account_id` → item sales/purchase account → `entity.default_income_account_id` / `default_receivable_account_id` / `default_undeposited_funds_account_id` → customer `receivable_account_id` → receipt `account_id`. On miss → `ledger_status=blocked` + `ledger_error`, **do not** invent accounts. |
| Tax liability account | Which account for tax credit leg: tax_master / group component / entity setting? Not specified. |
| Discount / shipping / adjustment | Header and line fields exist; no poster examples. Include or park explicitly. |
| Multiple income accounts on one invoice | One posting per distinct credit account vs single lumped income leg. Example `posting_key` shapes suggest per-bucket keys — confirm algorithm. |
| Native vs sync trigger | Native: post on status→`posted` and on void. Sync: WP7 after dbt + resolve/sweep. Same library both paths. |
| Repost triggers | Amount/date/account change on a native posted doc → reverse old keys, write new. Synced: re-sync then poster; no Books edit. |
| `ledger_mark-pending` | Script exists; poster should select `pending` / null / needs-repost, skip `posted` unchanged, skip `not_required` / `blocked`. |

### Suggested future package shape (when un-deferred)

**WP6 — Shared poster library (no sync hook)**

- `backend/lib/sales/ledgerPosting.ts`: `postInvoice`, `postCreditNote`, `postPaymentReceipt`.
- Advisory lock per doc; reverse-and-repost by `posting_key`.
- Unit tests from design examples 6.1, 6.3, 6.6 (and 6.8 for “no receipt posting”).
- Acceptance: post twice → no duplicate active rows; change amount + repost → old reversed; $0 receipt → `not_required`.

**WP7 — Wire after sync + backfill + T4**

- Run poster after successful sync for the org (invoice → CN → receipt).
- CLI `ledger:post-org` for backfill.
- Warn-level T4 report; document variances (unsynced refunds/JEs, deposits).
- Acceptance: synced payment → receipt in UI → postings on Transactions / trial balance; re-sync does not duplicate.

### Explicitly still later than WP6/7

- QBO Deposit → `bank_deposit`
- RefundReceipt / refund checks / A/R journal entries
- Multi-currency FX on applications
- Reverse sync
- Bills / PO

### Agent prompt when ready

> Implement WP6 only from `docs/domain/AR_PHASE_3_4_IMPLEMENTATION.md`, using the Deferred section of `AGENT_PLAN.md` as the requirements freeze. Before coding, confirm the open-decision table (cutover, multi-currency=block, void policy) in the PR description. Do not start WP7.

---

## Done when

Module 3B acceptance passes. Purchases, Module 4, investing, and WP6–WP7 remain parked/deferred. Sidebar shows dual native/synced sales lists. Synced data remains read-only in Books. No write-back to QBO.
