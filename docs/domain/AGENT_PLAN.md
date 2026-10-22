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
9. Prove the slice: create an editable row, list it on `_edit_view`, confirm an imported row appears only on `_readonly_view` (and vice versa). `npx tsc --noEmit` in `backend` is clean.

## Current status (fabriq-books)

| Area | Status |
|---|---|
| Ledger (chart, transactions, statement import, dry-run categorize, discard) | Done |
| Module 1 — reports, entity, exchange rates, opening balances | Done |
| Parties / items / tax schema + UI | Mostly done (universal model); sync lineage kept |
| QBO forward sync → customers, items, invoices, payments, credit notes | Done (subledger; no GL poster) |
| AR Phase 3–4 WP0–WP5 | Done (schema, dbt, Master UI, entity ledger defaults) |
| **Next — Module 3B create** (invoice + payment + credit; edit vs readonly views) | **This plan** |
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

## View naming: edit vs readonly

One Prisma model, **two Master views**. Name views by **capability**, not by how the row got there. That keeps the pattern reusable (synced connectors today; later: locked periods, voided docs, audit mirrors, imported CSV batches, etc.).

### Convention

```
{model}_edit_view       → rows the operator may create / update in Books
{model}_readonly_view   → rows shown in Books but not edited here
```

| Model | Edit view | Readonly view |
|---|---|---|
| `invoice` | `invoice_edit_view` | `invoice_readonly_view` |
| `payment_receipt` | `payment_receipt_edit_view` | `payment_receipt_readonly_view` |
| `credit_note` | `credit_note_edit_view` | `credit_note_readonly_view` |

**Module 3B default filters** (seed these; change filters later without renaming views):

- Edit: `source_system_id` is null **and** (for invoice) `direction = sales`.
- Readonly: `source_system_id` is not null **and** (for invoice) `direction = sales`.

Provenance (Books-authored vs connector) belongs in the **filter**, not the view name. A later module can point `_readonly_view` at a different predicate without a rename.

**Nav / routes (preferred):**

| Label | Path | View |
|---|---|---|
| Invoices | `/sales/invoices` | `invoice_edit_view` |
| Imported invoices | `/sales/invoices/imported` | `invoice_readonly_view` |
| Payments received | `/sales/payments` | `payment_receipt_edit_view` |
| Imported payments | `/sales/payments/imported` | `payment_receipt_readonly_view` |
| Credit notes | `/sales/credit-notes` | `credit_note_edit_view` |
| Imported credit notes | `/sales/credit-notes/imported` | `credit_note_readonly_view` |

Nav labels may say “Imported …” for connector-fed lists; the view id stays `_readonly_view`.

**Rules:**

1. Create / edit forms bind only to **`_edit_view`**. Readonly paths use read-only detail (current invoice detail pattern).
2. Rows created via `_edit_view` leave lineage null: `source_system_id`, `source_record_id`, `source_updated_at`, `ingest_batch_id`.
3. Rows on `_readonly_view` (Module 3B: connector-fed): **no edit, no void from Books UI**. No push to QBO.
4. Retire or stop linking the old single `invoice_view` / `payment_receipt_view` / `credit_note_view` from nav once dual views are seeded. Keep old names as temporary aliases only if a seed migration needs them; do not leave both in the sidebar.
5. Readonly list may show Origin / source id columns; edit list hides lineage by default.

---

## Module 3B — Sales create (invoice, payment, credit)

**Goal.** Create and manage Books-authored sales invoices, payment receipts, and credit notes on the same tables QBO sync fills. **`_edit_view` / `_readonly_view`** separate writable vs display-only populations. **No GL poster** in this module (see Deferred). **No reverse sync.**

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
| Direction | Editable invoice create always `direction = sales`. |
| Customer | Required on sales invoice / receipt / credit note. |
| Lineage | Writes via `_edit_view` leave lineage null. Reject create/update that sets lineage from the form. |
| Readonly immutability | API/UI: if `source_system_id` is set (Module 3B readonly population), reject update/delete. |
| Status | Editable invoice: `draft` → `posted` → `void`. Readonly (imported) rows stay as sync mapped them. |
| Money | Header totals and line amounts `Decimal(19, 4)`. On save, recompute `net_amount` / `tax_amount` / `total_amount` from lines (or require explicit tax fields — pick one approach and document in the form). |
| Balance | On create of a posted invoice with no apps: `balance_amount = total_amount`. Receipt/credit apply updates balances per design T1/T2 **in application code** (do not wait for poster). |
| Payment apply | Prefer `payment_receipt_application` rows (signed amounts). Convenience `payment_receipt.invoice_id` only when exactly one invoice target. |
| Credit apply (editable) | Prefer `credit_note_application` (example 6.8). Do **not** invent a $0 payment unless matching QBO shape for tests. |

Optional thin fields if missing for UX: keep using existing columns (`number`, dates, `entity_id`, `currency_id`, `account_id` on receipt, line `item_master_id` / `account_id`).

### Form CTA policy (dynamic footer)

Prod already has two levers; Module 3B should reuse the idea, not copy the PR wizard shell wholesale.

| Lever (prod) | What it drives | Books equivalent |
|---|---|---|
| `isExternalSource(source_system_id)` / `isFabriqSource` | Masters + invoice: Close vs Save; Master list Eye vs Edit | View id (`*_edit_view` vs `*_readonly_view`) **and** record `source_system_id` (defense in depth) |
| `workflow_context.current_state_ref.source_actions` | Approve / Reject / Submit buttons from DB | Not required for Module 3B (no sales workflow yet). Leave a slot for later |
| Imperative footer (`WorkflowActions`) | Wizard step, role, Save Draft vs Cancel | Replace with a small shared **document footer** driven by a mode object |

**Mode object (compute once per form open):**

```
mode.capability:  'edit' | 'readonly'     // from route/view; assert vs source_system_id
mode.status:      draft | posted | void   // document status
mode.actions:     DocumentAction[]        // resolved CTAs for the footer
```

**Module 3B action matrix (no workflow engine):**

| Capability | Status | Primary CTAs |
|---|---|---|
| `readonly` | any | **Close** only (optional: Open in connection — later) |
| `edit` | new / `draft` | **Cancel**, **Save draft**, **Post** |
| `edit` | `posted` | **Cancel**/Close, **Record payment** / **Apply credit** (where relevant), **Void** |
| `edit` | `void` | **Close** |

List rows: `_edit_view` → Edit (pencil); `_readonly_view` → View (eye). Same idea as prod `Master.tsx` `isFabriqSource` branching.

**Rules:**

1. Prefer resolving CTAs from `mode` in one shared helper (`resolveDocumentActions(mode)`), not copy-pasted if/else in each sales form.
2. Route/`viewId` sets capability; if the loaded row’s `source_system_id` disagrees (e.g. opened edit URL for an imported id), force `readonly` and show the imported banner.
3. Do **not** invent fake workflow states to mean “synced”. Provenance stays on lineage; capability stays on the view + mode.
4. When a later module adds a real workflow on invoices, **append** `source_actions` into `mode.actions` (prod pattern) instead of replacing the edit/readonly switch. Workflow buttons are an extra catalog; readonly still suppresses all mutating CTAs.

Prod references (read, do not port wholesale): `frontend-1/src/utils/sourceSystem.ts`, `Master.tsx` Eye/Edit branch, `InvoiceForm.tsx` `readOnly` footer, `components/forms/sales/WorkflowActions.tsx` / `purchase-requisition/WorkflowActions.tsx`.

### Code

**Seeds**

- Extend `seed:sales` / `seed:ar-settlement` (or one `seed:sales-native`) to upsert the six views above with default filters and `data_graph`.
- Permissions / role_view for the new view names.

**Backend**

- Domain helpers under `backend/lib/sales/` for **document persistence and settlement math only** (create/update draft, post status transition, apply payment, apply credit, void).  
  Names suggestion: `saveInvoice.ts`, `saveReceipt.ts`, `saveCreditNote.ts`, `applySettlement.ts`.
- **Do not** implement `ledgerPosting.ts` / `postInvoice` GL legs here.
- On `posted` / apply / void for editable rows: set or leave `ledger_status = pending` (or leave null) so a future poster can pick them up. Do not invent postings.
- Mount routes from `domain.ts` only if the Master view API cannot express the action (e.g. “post draft”, “apply payment”). Prefer view API create/update when sufficient.

**Frontend**

- Forms under `frontend-0/src/domain/sales/`:
  - Invoice create/edit on `invoice_edit_view` (lines editor).
  - Payment create + apply-to-invoice(s) on `payment_receipt_edit_view`.
  - Credit note create + optional apply via `credit_note_application` on `credit_note_edit_view`.
- Shared document footer using the CTA policy above; readonly detail banner (“Imported from a connection — edit in the source system”).
- Wire nav to dual paths; edit lists show Create. Port a thin `isExternalSource` / `isEditableSource` helper (null lineage or Books-authored = editable).

### Acceptance

1. Create an invoice with one line → appears on **Invoices** (`invoice_edit_view`), **not** on Imported invoices.
2. A QBO-synced invoice appears only on **Imported invoices** (`invoice_readonly_view`). Opening it is read-only; save is rejected if attempted.
3. Payment against that editable invoice reduces `balance_amount`; application row visible; receipt on **Payments received** only.
4. Credit note + `credit_note_application` reduces invoice balance without a $0 payment.
5. Second payment that would drive balance below zero is rejected (or overpay only via explicit unapplied on the receipt — pick one; default: reject over-apply to an invoice).
6. No `posting` rows required for acceptance (poster deferred). Trial balance unchanged by these docs until WP6.
7. Backend `tsc --noEmit` clean.
8. Readonly imported invoice footer shows **Close** only (no Save / Post / Void). Editable draft shows **Save draft** + **Post**.

### Out of scope for Module 3B

- GL poster / WP6–WP7.
- Push to QBO or any reverse sync.
- Quote, sales order, delivery challan (Module 4 parked).
- Purchase bills / PO / PR.
- Editing synced rows, PDF upload, email ingest, tax engine auto-calc beyond storing amounts the user entered (or selected group totals you choose to compute client-side — no new tax service required).

### Recommended work packages (run one, then stop)

Feed these to an agent in order. Each package must meet its own acceptance before the next starts.

| WP | Name | Do | Stop when |
|---|---|---|---|
| **3B.0** | Dual views + nav | Seed `*_edit_view` / `*_readonly_view` for invoice, payment_receipt, credit_note with filters; wire nav/routes (`/sales/…` + `/imported`); retire single views from sidebar; list Eye vs Edit by view | Imported QBO invoice on readonly list only; empty edit list OK |
| **3B.1** | Document mode + footer | `isEditableSource` helper; `resolveDocumentActions(mode)`; shared footer; readonly detail banner; force readonly if lineage disagrees with route | Open imported invoice → Close only; no Save |
| **3B.2** | Invoice create/edit | Form on `invoice_edit_view`: lines, draft/post/void, lineage null, totals/balance rules | Create draft → Post → on edit list; not on imported |
| **3B.3** | Payment create + apply | Form on `payment_receipt_edit_view`; `payment_receipt_application`; balance T1/T2 in app code | Pay posted invoice → balance drops; on payments edit list |
| **3B.4** | Credit note + apply | Form on `credit_note_edit_view`; `credit_note_application` (no $0 payment) | Credit + apply → invoice balance drops |

Do **not** fold poster, reverse sync, or purchases into any 3B.* package.

### After Module 3B (priority order)

1. **Optional polish** — uom / payment_terms Master screens if create UX needs them; numbering series for `invoice.number`.
2. **OSS** — WP-D6 (kernel docs → `main`) and/or WP-T* test harness when asked; not blocked on 3B.
3. **Parked until explicitly un-parked** — Module 4 (quote/SO), purchases (bills/PR/PO), investing.
4. **Deferred agentic** — WP6 poster, then WP7 sync-wire (see Deferred). Freeze open decisions in the PR before coding.

---

## Parked (do not start)

### Module 4 — Quotes, sales orders, delivery challan

Schema absent by design ([SALES_MODEL.md](./SALES_MODEL.md)). Fulfillment-only; no posting until invoice. Revisit when native invoice create is stable and a fulfillment workflow is needed.

### Purchases — bills, purchase orders, requisitions

| Item | Notes |
|---|---|
| Bills | Same `invoice` with `direction = purchase`; `supplier.payable_account_id` exists. No `/purchases/bills`, no `postBill`. |
| PO / PR | Stubs only (`purchase_order`, `purchase_requisition`). No line models, no workflow seed. |
| Why parked | Sales create + edit/readonly view UX first; AP is a separate engagement. |

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

Module 3B acceptance passes. Purchases, Module 4, investing, and WP6–WP7 remain parked/deferred. Sidebar shows `_edit_view` / `_readonly_view` sales lists. Imported (readonly) data is not edited in Books. No write-back to QBO.
