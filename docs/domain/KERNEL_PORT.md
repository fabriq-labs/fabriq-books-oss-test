# Books on the kernel

Prod keeps the long domain references in `docs/book-keeping/` (`BOOKKEEPING_DOMAIN.md`, `INVESTMENTS.md`, the report notes). This file is the porting record for this branch: what the ledger slice taught us, and the order for the next modules.

The kernel rule is [../kernel/PORTING_A_DOMAIN.md](../kernel/PORTING_A_DOMAIN.md). The module-by-module instructions for a coding agent are [AGENT_PLAN.md](./AGENT_PLAN.md). Follow both for every module below.

## What the ledger slice taught us

The chart, transactions, statement import, categorization, and import discard are on this branch. These are the practices that held up.

1. **Kernel files do not name the ledger.** Extractors, the categorize route, and the import toolbar register through `backend/lib/domain.ts`, `frontend-0/src/domain/register.ts`, and `DomainRoutes()`. `App.tsx` calls `DomainRoutes()` so the router receives a fragment.
2. **A feature that works with no product installed stays in the kernel.** Discarding an import run is that case. The handler had to be mounted at `POST /api/import_run/:id/discard`. An unmounted handler surfaces as the mapper toast “Discard failed”.
3. **A feature that names accounts or postings stays in `backend/lib/gl` and `frontend-0/src/domain/gl`.** The AI Category column is a `getColumns` hook on the posting import extension. The Categorize button is `renderToolbarActions`. The column stays hidden until a prediction exists.
4. **Rename columns to kernel norms before copying SQL or forms.** Locked for the ledger: `debit_account_id`, `currency_id`, `entity_id`, `ext_connection_id`, `ext_account_id`, `kind`, `ai_category_score`, `account_types`, lowercase `classification`. Do this at the start of each later module, not after the screens exist.
5. **A model you are not porting yet is a stub:** `id`, required `org_id`, and the foreign keys the current module needs. The next module replaces that stub. Do not keep a second table beside it.
6. **Seed is a second command** after `setup:kernel`. Write the view, permission, and `data_graph` in that command. Do not replay a prod view dump, and do not copy `setup-db.js` or `backend/integrations`.
7. **One org holds one chart.** `(org_id, code)` is unique. The US/CA and India templates share codes and differ by currency (USD vs INR). Loading a second geo rewrites those codes. Do not load a template onto an org whose code `1000` is already a real account.
8. **Statement import.** CSV does not need an LLM key. PDF extract does. The bank account sets the side: money out credits the bank, money in debits it. Categorization is a dry run against the chart. It does not insert postings and it does not use the prod historical-match handler.
9. **The runtime image has Node, not npm.** A pre-deploy `npm run` fails the deployment. Apply schema SQL from outside the container when a project token cannot SSH. Do not point a new service at an existing prod database, and do not redeploy prod or dev to try a branch.
10. **`general_ledger` on this branch is the old chart stub, not the ledger.** The chart is `account`. Leave that stub unused.

## Already on this branch

| Piece | Where |
|---|---|
| `account`, `posting` | `backend/prisma/schema/domain.prisma` |
| View seed | `npm run seed:gl` |
| US/CA and India charts | `npm run seed:coa -- us-ca` or `india` |
| Screens | Chart of Accounts, Transactions, account form, posting form |
| Statement import | CSV and PDF, mapper, Categorize, discard |
| Stubs still empty | `entity`, `ext_connection`, `ext_transaction`, `invoice`, `payment_receipt`, `credit_note`, `trade`, `holding`, `budget_period`, `general_ledger`, `purchase_requisition`, `purchase_order`, `item_master`, `project_master` |

Not ported, and not part of the ledger slice: trial balance and the other financial reports, opening balances, bank-feed UI, reconcile-to-document, the long posting form, and the prod ERP categorizer.

## How every later module is built

1. Read the prod model and the prod screen. List the fields this slice actually needs.
2. Lock names: `snake_case`, foreign key `{relation}_id`, singular model names, lowercase enums. `legal_entity_id` is already `entity_id`.
3. Replace the stub in `domain.prisma`, or add the model. Keep `org_id`. Add the other side of each relation.
4. Apply the SQL diff from [../kernel/adding-a-model.md](../kernel/adding-a-model.md). Do not run `prisma db push`.
5. Add `npm run seed:<module>` for views and permissions. Restart the backend so the model is registered.
6. Put behavior in `backend/lib/<module>/` and UI in `frontend-0/src/domain/<module>/`. Register routes and import extensions from the domain entry files.
7. A document that changes the books writes a `posting`. The screen does not invent a second journal.
8. Vendor connectors, `backend/integrations`, and broker SDKs stay on prod until that module’s manual slice works.

## Module order

Sales, purchases, and investing all post into `account` and `posting`. Reports come first so those postings can be checked. Parties and items are shared, so they come before either document flow. Investing does not depend on sales or purchases.

```
ledger (done)
  → reports, legal entities, exchange rates
  → customers, suppliers, items
  → sales
  → purchases
  → investing
```

Tax rates, bank feeds, and ERP sync are called out inside the module that needs them. They are not a separate first slice.

### 1. Reports, legal entities, and exchange rates

Prod reference: `docs/book-keeping/INCOME_STATEMENT_AND_BALANCE_SHEET.md`, `OPENING_BALANCE_AND_BALANCE_SHEET.md`, and the entity section of `BOOKKEEPING_DOMAIN.md`. The task steps are [AGENT_PLAN.md](./AGENT_PLAN.md).

| Bring across | Leave for later |
|---|---|
| Trial balance, income statement, balance sheet, cash flow, posting list | Monthly trial balance |
| Opening postings (`kind = opening`), excluded from period activity | Personal-income report and net-worth ratios |
| `entity` for real, many entities per org, reports filtered to one or more | HQ account remapping (`hq_account_id`) |
| `exchange_rate` and conversion into `org.basecurrency_id` | |

`average` rates convert period activity. `closing` rates convert balance-sheet and opening amounts. A missing rate is flagged. It is not treated as 1.

`npm run seed:books-demo` loads a small multi-entity example on top of an India chart: USD and INR, a US headquarters and an India entity, INR→USD average and closing rates, and a few journals. The organization reporting currency stays USD, so the 2026 income statement and balance sheet show the India amounts converted. Run `npm run seed:coa -- india` first. It does not replace the chart.

### 2. Customers, suppliers, and items

Prod schema: `backend/prisma/schema/zeiv.prisma` (`customers`, `supplier`, `item_master`, `uom`, `payment_terms`).

The legal entity is module 1. This module replaces the `item_master` stub and adds `customer` (prod table is `customers`), `supplier`, `uom`, and `payment_terms`.

| Screen | Prod path |
|---|---|
| Customers | `/sales/customers` |
| Suppliers | `/purchases/suppliers` |
| Item master | `/masters/items` |

Legal entity stays the module 1 screen at `/masters/entity`.

First slice fields: name, address, email, phone, `currency_id`, `payment_terms_id`, status, `org_id`. Item: name, code, `sales_account_id`, `purchase_account_id`, `uom_id`, price. Drop prod-only columns that exist for ERP sync (`ingest_batch_id`, default `source_system_id`) until a connector is in scope.

`entity` is the legal entity on an account and on a document. It is not a second tenant. `org_id` remains the tenant.

### 3. Sales

Prod schema: `sales.prisma` plus `invoice`, `payment_receipt`, and `credit_note` in `zeiv.prisma`. Prod `invoice.invoice_type` is `SALES` or `PURCHASE`. Keep one `invoice` model. Replace the `invoice`, `payment_receipt`, and `credit_note` stubs.

**First slice.** Customer invoice, lines, payment receipt, credit note. Posting the invoice debits the receivable and credits income. A receipt debits the bank and credits the receivable. A credit note reverses that.

**Second slice.** Quote, sales order, delivery challan. These track fulfillment. They do not post until the invoice does.

Leave invoice PDF extraction and email ingest on prod. Bank-statement categorization stays a chart score. Matching a receipt to an invoice is part of this module, in `backend/lib/sales/`, not a change to the kernel mapper.

### 4. Purchases

Prod schema: `purchase_requisition`, `purchase_order`, `purchase_order_item` in `zeiv.prisma`. A bill is an `invoice` with `invoice_type = PURCHASE`.

**First slice.** Supplier bill and lines, with or without a PO. Posting debits expense (or the item’s purchase account) and credits the payable. A payment debits the payable and credits the bank.

**Second slice.** Purchase order, then purchase requisition. Requisition approval uses the kernel workflow engine. Seed that flow in the purchase seed. Do not copy every prod workflow.

Budget period, budget line, and project can wait until a requisition needs them. The stubs stay until then.

### 5. Investing

Prod reference: `docs/book-keeping/INVESTMENTS.md`. Prod schema: `instrument`, `trade`, `holding` in `data.prisma`.

Replace the `trade` and `holding` stubs. Add `instrument`.

| Choice | Plan |
|---|---|
| `instrument` | Shareable, same idea as `currency`: one row for a symbol, no tenant `org_id`. Holdings and trades carry `org_id`. |
| First slice | Manual instrument, trade, and holding screens. A trade writes a `posting` between the cash account and the investment account. |
| Names | Keep `ext_connection` for a broker link. Do not put a broker product name on a kernel model. |
| Later | Position sync, quotes, option chain, portfolio and options MCP tools. Prod files: `QUESTRADE_*`, option-chain handlers. |

### Explicitly later

| Area | Why it waits |
|---|---|
| Bank feed UI on `ext_connection` / `ext_transaction` | The ledger already imports statements. A live feed is a connector, after reports exist. |
| Tax regions, groups, and line tax | Prod `tax.prisma` and `tax_master`. Add when the first invoice needs a rate. US/CA and India do not share one rate table. |
| ERP forward and reverse sync | `backend/integrations` and the connector docs on prod. Needs sales and purchases to exist here first. |
| Email ingest, Slack, full Workbench invoice match | Separate from the document screens. |

## Done when

A module is done when its seed creates the views, its screens create a row, a posted document shows up on Transactions, and a report in module 1 includes that posting. Kernel files still do not import the new product folder.
