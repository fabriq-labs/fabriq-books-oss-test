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

**Goal.** A **complete** Books-authored create path for sales invoices (with full line editor), payment receipts, and credit notes on the same tables QBO sync fills. Dual `*_edit_view` / `*_readonly_view`. **No GL poster. No reverse sync.**

**Already on the branch (do not rebuild):**

- Schema: `invoice`, `invoice_line_item`, `invoice_line_tax`, `payment_receipt`, `payment_receipt_application`, `credit_note`, `credit_note_item`, `credit_note_application`, tax models, lineage, `ledger_*`.
- QBO forward sync + current read-only lists/detail.
- Customers, items, tax masters/groups/regions UI.

**Read first.**

- This file (especially [Detailed requirements](#detailed-requirements-complete-create) below).
- [AR_SETTLEMENT_AND_LEDGER.md](./AR_SETTLEMENT_AND_LEDGER.md) §§3, 6.8–6.9.
- Prod (study, do not copy wholesale): `frontend-1/src/components/InvoiceForm.tsx`, `forms/Masters/SalesInvoiceItemTable.tsx`, `PaymentReceiptForm.tsx`, `PaymentReceiptModal.tsx`, `forms/sales/CreditNoteForm.tsx`, `CreditNoteItems.tsx`; totals logic in prod `backend/src/lib/actions/zeiv.ts` (`calculate_invoice_total`).
- This branch: `frontend-0/src/domain/sales/*`, `backend/prisma/schema/sales.prisma`, `tax.prisma`.

---

### Detailed requirements (complete create)

Captured against prod sales create + Books schema. **Module 3B is incomplete unless these are met** (unless marked Defer).

#### 1. Create entry points (buttons + routes) — **must**

| Surface | Requirement |
|---|---|
| Invoice edit list | **Create** / “New invoice” on `/sales/invoices` (`invoice_edit_view`) → opens blank create form (or create-draft-then-edit). |
| Payment edit list | **Create** on `/sales/payments` → receipt form (optionally deep-link `?invoice_id=`). |
| Credit note edit list | **Create** on `/sales/credit-notes`. |
| From posted invoice | Footer **Record payment** / **Apply credit** navigates to create with invoice pre-selected. |
| Imported lists | **No Create** on `*_readonly_view` paths. Row action = View (eye) only. |
| Edit lists | Row action = Edit (pencil). |

Prod analogue: `InvoiceList` → `Master` Create New + `createDefaults`; Books must not depend on workflow `workflowAPI.create` — use view API / domain save that inserts `status=draft`, `direction=sales`, lineage null.

#### 2. Invoice header — **must**

| Field | Required | Notes |
|---|---|---|
| `customer_id` | Yes | Lookup; on select may default currency / payment terms / bill_to from customer when empty |
| `entity_id` | Yes | Legal entity; default HQ if one exists |
| `invoice_date` | Yes | Default today |
| `due_date` | No* | *Compute from `payment_terms.days` when terms set; user may override |
| `payment_terms_id` | Recommended | Drives due date |
| `currency_id` | Yes | Default customer currency → org/entity currency |
| `exchange_rate` | Yes if FX | Default 1 when same as org reporting currency; editable |
| `number` | No | Manual or leave null until numbering series (polish) |
| `location_id` / `bill_to` | Optional | bill_to editable text |
| `tax_region_id` | Optional | Place of supply when entity tax pack ≠ GENERIC; Defer full pack UX if GENERIC-only orgs |
| `notes` / `reference` | Optional | |
| `shipping_amount` / `adjustment_amount` | Optional | Include in total calc if shown; shipping UI may be Defer |

Always: `direction = sales`, lineage null on create.

#### 3. Invoice line items — **must**

**UI**

- Add line, remove line, reorder by `line_number` (add appends; drag-reorder optional Defer).
- Block Post if zero lines or any line missing description + (qty and unit_price).
- Columns: Item (lookup), Description, Qty, Unit price, Discount %, Tax (group or rate), Tax amount (display), Line amount (display), Account (optional), remove.

**Non-catalog / free-text lines — Yes (Books)**

- `item_master_id` is **optional** (schema already).
- User may add a line with **description only** (no item): enter description, qty, price, tax manually.
- Prod sales UX forces item SearchDropDown; Books **relaxes** this so services/ad-hoc lines work without a catalog row.
- If item cleared: keep description/qty/price user typed; clear auto-filled tax/account only if they still match the previous item defaults (or clear tax_group and account always on clear — pick one; default: clear `tax_group_id` + `account_id`, keep description/qty/price).

**Item select → copy onto line (defaults; all user-editable after)**

| From `item_master` | Onto `invoice_line_item` | Editable after? |
|---|---|---|
| `id` | `item_master_id` | Yes (change/clear item) |
| `name` and/or `description` | `description` (prefer item description if set, else name) | **Yes** |
| `unit_price` | `unit_price` | **Yes** |
| `sales_account_id` | `account_id` | **Yes** |
| `tax_group_id` (else see tax rules) | `tax_group_id` | **Yes** |
| `classification_code` / `classification_scheme` | same on line | Yes |
| `code` | *display only* via relation (no denormalized code column) | — |
| `uom_id` | *display only* via item relation for 3B | Defer line uom column |

Do **not** copy qty (leave 1 or prior). Do **not** overwrite description/unit_price/tax if user already edited them **unless** this is a fresh select on an empty line (standard: selecting a new item always refreshes defaults from the item).

#### 4. Discount & amount calculation — **must**

Per line (money `Decimal(19,4)`; rates as stored):

1. `base = quantity × unit_price`
2. If `discount_rate` set: `discount_amount = base × discount_rate` (store rate as fraction **or** percent consistently — **lock: UI shows percent; persist `discount_rate` as percent/100 in Decimal(9,6) matching schema intent, or persist percent and document — prefer **percent in UI, store as 0–100 in `discount_rate` like prod**, compute `discount_amount = base × (discount_rate/100)`).
3. `taxable = base − discount_amount` (floor at 0).
4. Tax (next section) → `line_tax_amount`; write `invoice_line_tax` rows when using a group.
5. Persist line `amount = taxable` (**exclusive of tax**, matching typical `net` semantics) **or** `amount = taxable + tax` — **lock: `amount` = taxable (net of discount, before tax)**; tax lives in `invoice_line_tax` / header `tax_amount`. Align with QBO sync conventions on this branch when they conflict — prefer exclusive net on `amount`.

Header formula:

1. `net_amount` = Σ line taxable  
2. `tax_amount` = Σ line tax  
3. `total_amount` = `net_amount` + `tax_amount` + (`shipping_amount` \|\| 0) + (`adjustment_amount` \|\| 0)  
4. If no applications: `balance_amount = total_amount` when status is `posted`; draft may show projected balance = total  

**Server recomputation = prod action / `functionMap` pattern (required), not an ad-hoc “save then fix” call.**

Prod wires totals through the DAL post-write hook:

- Handlers: `calculate_invoice_total`, `calculate_payment_total`, `calculate_credit_note_total` in `backend/src/lib/actions/zeiv.ts` / `actions/sales.ts`.
- Registry: `functionMap` in `backend/src/lib/actions.ts` — keys like `"invoice"`, `"invoice.invoice_line_item"`, `"invoice.payment_receipt"`, `"credit_note.credit_note_item"` with a `fields[]` watch list; on ADD/UPDATE/DELETE of those fields, `execute_Action` runs the method **inside the same transaction**.
- Also registered on `workflowActionMap` so Submit side effects can re-run the same method; **totals must not depend on workflow Submit alone** (prod comment).

Books already has the kernel seam empty and ready:

- `backend/lib/domain.ts` → `functionMap` / `workflowActionMap`
- `backend/src/domain/actions.ts` → `execute_Action` (same ADD/UPDATE/DELETE contract)

**Module 3B must:**

1. Implement `calculate_invoice_total` / `calculate_payment_total` / `calculate_credit_note_total` under `backend/lib/sales/` (Books field names: `quantity`, `unit_price`, `discount_rate`, `tax_group_id`, `net_amount`, `tax_amount`, `total_amount`, `balance_amount`, `invoice_line_tax`, applications).
2. Register them on `functionMap` for parent + child keys, e.g. `"invoice"`, `"invoice.line_items"` / `"invoice.invoice_line_item"` (match whatever relation name the DAL emits), `"payment_receipt"`, `"payment_receipt.applications"` (or equivalent), `"credit_note"`, `"credit_note.items"`.
3. Watch fields that affect money (qty, price, discount, tax, adjustment/shipping, application amounts).
4. Keep UI optimistic display optional; **persisted truth is the action result**. Do not invent a parallel `/api/sales/recalculate` unless the view API cannot surface the updated header.

Client may preview totals; every line/header money write goes through the normal view/child APIs so `execute_Action` fires.

#### 5. Tax behavior — **must**

| Behavior | Requirement |
|---|---|
| Auto from item | On item select: set `tax_group_id` from `item_master.tax_group_id` when present. If only `tax_master_id` on item, either set a one-component calculation from that master **or** require user to pick a group — **prefer:** if `tax_group_id` null and `tax_master_id` set, create/display tax from that single `tax_master.rate`. |
| Line tax control | User can change `tax_group_id` via lookup **or** clear tax. |
| Edit rate | User may override: changing group rebuilds `invoice_line_tax` from `tax_group_component` → each `tax_master.rate`. For simple orgs, allow a line-level effective % override that writes a single `invoice_line_tax` row (rate + amount) tied to a chosen `tax_master` or a null-group override — **minimum:** group select + amounts from components; **also must:** allow clearing tax (0). Manual percent field that updates amounts is **must** when no group (GENERIC pack / ad-hoc lines). |
| Persist | `invoice_line_tax`: `tax_master_id`, `rate`, `amount`, optional `tax_group_id`. |
| Header | `tax_amount` = sum of line tax amounts. |
| Interstate / export suggestion engine | **Defer** (prod `suggestTaxGroupId` / tax packs). Storing the user-selected group is enough for 3B. |

#### 6. Payment create — **must**

- Create button on payments edit list; optional from invoice **Record payment**.
- Fields: `customer_id`, `receipt_date`, `amount`, deposit `account_id` (bank/UF), `currency_id`, optional reference/notes/`payment_method`, `entity_id`.
- Apply: one or more `payment_receipt_application` rows (`target_type=invoice`, `amount_applied ≥ 0`).
- T1: `amount = Σ applications.amount_applied + unapplied_amount`.
- Default: reject apply that would make invoice `balance_amount` &lt; 0; overpay only by leaving `unapplied_amount` &gt; 0 with explicit UX.
- Status draft/posted; lineage null.
- Convenience `invoice_id` only when exactly one invoice application.

#### 7. Credit note create — **must**

- Create button on credit-notes edit list; optional from invoice **Apply credit**.
- Header: customer, entity, date, currency, optional origin `invoice_id` (reference only), notes.
- Lines: same line editor rules as invoice (item lookup + copy matrix, discount, tax, free-text description lines).
- Totals: `net_amount` / `tax_amount` / `total_amount` / `balance_amount` on credit note.
- Apply via **`credit_note_application`** (not $0 payment). Reduces invoice and credit balances in app code.
- Status draft/posted/void; lineage null.

#### 8. Form CTA policy (dynamic footer) — **must**

| Capability | Status | Primary CTAs |
|---|---|---|
| `readonly` | any | **Close** only |
| `edit` | new / `draft` | **Cancel**, **Save draft**, **Post** |
| `edit` | `posted` | **Close**, **Record payment** / **Apply credit**, **Void** |
| `edit` | `void` | **Close** |

Shared `resolveDocumentActions(mode)`; route/view sets capability; if `source_system_id` set, force readonly. Later workflows **append** `source_actions`; do not replace edit/readonly.

#### 9. Schema / product locks

| Topic | Lock |
|---|---|
| New tables for 3B | None required for MVP create |
| Line without item | Allowed |
| QBO write-back | No |
| GL poster | Deferred (WP6/7) |
| Prod workflow create | Do not require; Books uses draft/post status |

#### 10. Must vs defer (summary)

**Must:** Create buttons; complete invoice header+lines (add/remove, item copy, discount %, tax group/rate editable, free-text lines); server totals; draft/post/void; payment+apply; credit+apply; edit/readonly CTAs.

**Defer:** IN interstate tax suggestion; shipping UI; attachments/PDF; numbering series; line UOM column; drag-reorder; multi-currency bank charges nuance; quote/SO; purchases; poster.

---

### Schema rules (persistence)

| Rule | Detail |
|---|---|
| Direction | Always `sales` on editable create |
| Lineage | Null on edit-view writes; reject form-set lineage |
| Readonly immutability | `source_system_id` set → reject update/delete |
| Status | `draft` → `posted` → `void` |
| Money | `Decimal(19, 4)`; server recomputes totals |
| Balance | Posted + no apps → `balance_amount = total_amount`; apps update per T1/T2 in app code |

### Code

**Seeds** — six views + permissions; Create only on edit views.

**Backend** — `backend/lib/sales/`: `calculateInvoiceTotal` / `calculatePaymentTotal` / `calculateCreditNoteTotal` registered on `functionMap` (prod action pattern); thin save/apply helpers only where view API is insufficient. **No** `ledgerPosting.ts`.

**Frontend** — create/edit forms with line table; shared footer; `isEditableSource`; nav Create on edit lists only.

### Acceptance

1. **Create** on Invoices edit list opens a blank invoice; Save draft → row on `invoice_edit_view` only.
2. Add line → pick item → description, unit_price, account_id, tax_group_id populated; user changes tax → totals update; Post succeeds.
3. Add line **without** item → description + qty + price + tax % → included in totals.
4. Discount % reduces taxable and tax base correctly (server + UI).
5. Imported invoice: no Create on imported list; open → Close only; save rejected.
6. Record payment → applications → invoice `balance_amount` drops; T1 holds.
7. Credit note + `credit_note_application` → balances drop; no $0 payment.
8. Over-apply to invoice rejected (default).
9. No GL `posting` rows required. `tsc --noEmit` clean.

### Out of scope for Module 3B

- GL poster / WP6–WP7; QBO write-back; Module 4; purchases; PDF/email; full tax-pack suggestion engine; editing synced rows.

### Recommended work packages (run one, then stop)

| WP | Name | Do | Stop when |
|---|---|---|---|
| **3B.0** | Dual views + nav + **Create buttons** | Seed edit/readonly views; routes incl. `/imported`; **Create** on each edit list only; Eye vs Edit row actions; retire old single views from nav | Create visible on Invoices/Payments/Credit notes edit lists; absent on imported lists |
| **3B.1** | Document mode + footer | `isEditableSource`; `resolveDocumentActions`; shared footer; readonly banner | Imported open → Close only |
| **3B.2** | Invoice create (**complete** line editor) | Header + line add/remove; item lookup + copy matrix; free-text lines; discount %; tax group/rate editable; `invoice_line_tax`; **`calculate_invoice_total` on `functionMap`**; draft/post/void | Acceptance 1–5 for invoice; editing a line qty updates header totals via action hook |
| **3B.3** | Payment create + apply | Create button + from-invoice; applications; **`calculate_payment_total` on `functionMap`**; T1/T2 | Acceptance 6, 8 |
| **3B.4** | Credit note create + apply | Lines (same line rules); `credit_note_application`; **`calculate_credit_note_total` on `functionMap`** | Acceptance 7 |

Do **not** fold poster, reverse sync, or purchases into any 3B.* package.

### After Module 3B (priority order)

1. **Optional polish** — numbering series; uom on lines; attachments; tax-pack suggestions.
2. **OSS** — WP-D6 / WP-T* when asked.
3. **Parked** — Module 4, purchases, investing.
4. **Deferred** — WP6 → WP7 (see Deferred).

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
