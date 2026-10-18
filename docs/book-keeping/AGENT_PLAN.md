# Agent plan: next books modules

Feed this file to a coding agent one module at a time. The overview is [KERNEL_PORT.md](./KERNEL_PORT.md). The kernel rule is [../kernel/PORTING_A_DOMAIN.md](../kernel/PORTING_A_DOMAIN.md).

Prod is the git ref `prod` (`frontend-1`, `backend/prisma/schema/{data,sales,zeiv,tax,plaid}.prisma`). This branch is the kernel shell plus the ledger (`frontend-0`, `backend/lib/gl`, `backend/prisma/schema/domain.prisma`).

## How to run a module

1. Do the module named in the task, then stop. Do not start the next module.
2. Read the prod files listed for that module before editing. Copy behavior. Do not copy a 1,000-line form wholesale when this schema has fewer fields.
3. Work on a branch from this one. Domain code goes in `backend/lib/<module>/` and `frontend-0/src/domain/<module>/`. Register screens from `frontend-0/src/domain/routes.tsx` by calling `DomainRoutes()` (already how `App.tsx` mounts them). Register backend hooks from `backend/lib/domain.ts`.
4. Kernel files under `backend/src` and under `frontend-0/src` outside `domain/` must not import the product folder.
5. Replace a stub in place. Keep its id prefix and `@@map` name. Do not add a second table.
6. Do not run `prisma db push` or `prisma migrate`. Propose the SQL diff from [../kernel/adding-a-model.md](../kernel/adding-a-model.md) and apply it only if the task says the database is the local one.
7. Do not copy `backend/integrations`, prod `setup-db.js`, or `backend/prisma/metadata/views/`. Do not redeploy an existing prod or dev service. Do not print tokens or `DATABASE_URL`.
8. Seed with a new `npm run seed:<module>` script modeled on `backend/src/utils/setup/seedGl.ts`. Views need `data_graph`. Restart the backend after the model is registered.
9. Prove the module: the screen creates a row, a posted document appears on Transactions, and `npx tsc --noEmit` in `backend` is clean.

## Snapshot

| Prod area | Prod home | This branch |
|---|---|---|
| Chart and transactions | `data.prisma` `account`, `posting`. Screens `AccountList`, `AccountForm` (35 KB), `Transactions`, `PostingForm` (64 KB) | Ported, thinner. Forms are about 420 lines. Views `account_view`, `posting_view` |
| Statement import and categorize | `frontend-1/src/features/import-extensions/posting/`. Handler `backend/src/agent/handlers/erp/categorizeTransactionBatch.ts` (34 KB) plus historical match | Ported as a dry-run chart score in `backend/lib/gl/categorizeImportBatch.ts`. No historical match |
| Import discard | `POST /api/import_run/:id/discard` | Ported. This is kernel |
| Reports | `backend/src/lib/reports/perfin.ts` (70 KB). Pages under `frontend-1/src/pages/reports/` | Absent. SQL still says `account_id`, `posting_type`, `legal_entity_id` |
| Opening balances | `frontend-1/src/pages/accounting/OpeningBalances.tsx` (31 KB) | Absent. `kind = opening` exists on `posting` |
| Bank transactions screen | `frontend-1/src/pages/reports/BankTransactions.tsx` (51 KB) | Absent |
| Bank feed | `plaid.prisma`, `backend/src/plaid/plaid.service.ts` (40 KB) | Stubs `ext_connection`, `ext_transaction` only. No vendor name in the schema |
| Legal entity | `zeiv.prisma` `entity`. Form `OrganizationForm.tsx` (22 KB) | Stub: `id`, `org_id` |
| Customers, suppliers | `zeiv.prisma` `customers`, `supplier`. Forms 25 KB and 90 KB | Absent |
| Items | `item_master` plus `uom`, `item_category`. Form 90 KB | `item_master` stub: id, org, two account ids |
| Sales documents | `sales.prisma` quote, sales order, delivery challan. Invoice, receipt, credit note in `zeiv.prisma` | Stubs: `invoice`, `payment_receipt`, `credit_note`. No quote or sales order |
| Bills | Same `invoice` with `invoice_type = PURCHASE`. `BillsInvoiceForm.tsx` (49 KB), `InvoiceUpload.tsx` (66 KB) | Same invoice stub |
| Purchase requisition and order | `zeiv.prisma`. Workflow detail pages | Stubs: id, org, `account_id` |
| Investing | `instrument`, `trade`, `holding` in `data.prisma`. `investments.ts` (46 KB). Portfolio and options pages | Stubs: `trade`, `holding`. No `instrument` |
| Tax | `tax.prisma`, `tax_master` | Absent |
| ERP sync | `backend/integrations` | Do not port |
| Categories | `category`, `category_group` | Absent. The ledger uses the contra account as the category |

## Names already locked

Use these. Do not reintroduce the prod name.

| Prod | This branch |
|---|---|
| `posting.account_id` | `debit_account_id` |
| `posting.credit_account_id` | unchanged |
| `posting.posting_type` | `kind` (`opening`, `duplicate`, `journal`, `reversal`, `sales_invoice`, `closing`) |
| `posting.reversal_of_posting_id` | `reverses_id` |
| `posting.legal_entity_id` | `entity_id` |
| `posting.ai_cat_score` | `ai_category_score` |
| `account.base_currency_id` | `currency_id` |
| `account.type` `String[]` | `account_types` |
| `account.legal_entity_id` | `entity_id` |
| `account.plaid_item_id` | `ext_connection_id` |
| `account.inst_id` | `ext_account_id` |
| `plaid_item` | `ext_connection` |
| `plaid_transaction` | `ext_transaction` |
| classification, status, reconciliation | lowercase enums already on the ledger |

`customers` becomes `customer` when that module starts. `legal_entity_id` on every later model becomes `entity_id`. Amounts that are money use `Decimal(19, 4)`, matching `posting.amount`. Prod `Float` totals get that treatment when the column is ported.

`department` already exists on the kernel (`metadata.prisma`, id prefix `dept_`). Do not add a second department model from `zeiv.prisma`. Extend the kernel one only when a requisition needs a field it does not have.

`currency` and `attachment` are platform models. Do not move them into `domain.prisma`.

`general_ledger` is the old chart stub. Do not fill it in. The chart is `account`.

## Module 1 — Reports, entities, and exchange rates

**Goal.** Trial balance, income statement, balance sheet, cash flow, and posting list for an org that has more than one legal entity. Amounts in an account currency convert into the org reporting currency. Opening balances write `kind = opening` postings.

**Read first.**

- `prod:backend/src/lib/reports/perfin.ts` functions `getTrialBalance`, `getIncomeStatement`, `getCashFlowStatement`, `getClassificationBreakdown`. Study `org_base`, `period_avg_rates`, `opening_close_rates`, and the `legalEntityIds` filter. Rewrite the SQL. Do not paste it.
- `prod:frontend-1/src/pages/reports/BalanceSheet.tsx`, `IncomeStatement.tsx`, `CashFlow.tsx`, `PostingList.tsx`
- `prod:frontend-1/src/pages/accounting/OpeningBalances.tsx`
- `prod:docs/book-keeping/INCOME_STATEMENT_AND_BALANCE_SHEET.md`, `OPENING_BALANCE_AND_BALANCE_SHEET.md`, and the entity section of `BOOKKEEPING_DOMAIN.md`
- `prod:backend/prisma/schema/zeiv.prisma` model `entity` and `prod:backend/prisma/schema/data.prisma` model `exchange_rate`
- This branch `account`, `posting`, and the `entity` stub in `domain.prisma`. `org.basecurrency_id` and `org.base_currency` are already on `metadata.prisma`.

**Schema.**

Replace the `entity` stub. Keep the `ent_` id prefix and the `accounts` and `postings` relations. Fields: `name`, `legal_name`, `address`, `city`, `state`, `country`, `postal_code`, `currency_id` (functional currency; prod calls this `basecurrency_id`), `is_headquarters` boolean, required `org_id`. One org has many entities. At most one entity per org has `is_headquarters` true. Enforce that in the write path.

Add `exchange_rate`. Id prefix `exrt_`. Required `org_id`. `from_currency_id`, `to_currency_id`, `effective_date` as a date, `rate` as `Decimal(19, 6)`, `rate_type` enum lowercase `spot`, `closing`, `average`. Unique on `(org_id, from_currency_id, to_currency_id, effective_date, rate_type)`. Prod stores `SPOT`, `CLOSING`, `AVERAGE`. Do not copy the uppercase enum.

`account.entity_id`, `account.currency_id`, `posting.entity_id` already exist. The account form already edits `currency_id`. Add `entity_id` to the account form and the posting form.

**FX rule.** The report currency is `org.basecurrency_id`. A caller may pass another `currency.id`. An account whose `currency_id` equals the report currency uses rate 1. Otherwise multiply by the latest `exchange_rate` for that org with `to_currency_id` equal to the report currency:

- Period activity on the income statement and the cash-flow lines uses `rate_type = average` with `effective_date` on or before the period end.
- Balance-sheet balances and opening balances use `rate_type = closing` with `effective_date` before the period start for the opening column, and on or before the period end for the closing column.
- Missing rate: leave the row in the source currency, set a `rate_missing` flag, and do not invent 1. The page shows that flag.

**Entity rule.** No `entity_id` query param means every posting in the org, including rows whose entity is null. `entity_id` may be repeated. When it is present, include only postings and accounts for those entities. A null entity does not match a filter. Combined multi-entity is the unfiltered report, after FX into the one report currency. Do not build HQ account remapping (`hq_account_id`) in this module.

**Reports.** Query `account` and `posting`. Rewrite every prod column from the rename table. Classifications are lowercase. Opening rows are `kind = 'opening'` and stay out of period activity. Skip `account_hierarchy` until a report is wrong without it. A recursive query in the report file is enough.

**Code.**

- `backend/lib/gl/reports.ts` with one function per report. Org id comes from the caller. No SQL string from the client.
- Mount read routes from a domain router registered in `domain.ts`. Paths under `/api`: `GET /gl/reports/trial-balance`, `income-statement`, `balance-sheet`, `cash-flow`, `posting-list`. Query params: `from`, `to`, optional repeated `entity_id`, optional `currency_id`.
- `frontend-0/src/domain/gl/reports/` pages. Reports group in `navigation.ts`. Paths: `/reports/trial-balance`, `/reports/income-statement`, `/reports/balance-sheet`, `/reports/cash-flow`, `/reports/posting-list`. Each page has an entity multi-select and shows the report currency.
- Opening balances: `frontend-0/src/domain/gl/OpeningBalances.tsx` at `/accounting/opening-balances`. Saving creates paired postings with `kind = opening` and the selected `entity_id`. Debit and credit totals match in the account currency.
- Entity screen: `frontend-0/src/domain/gl/EntityForm.tsx` and a list at `/masters/entity`, view `entity_view`. Seed it from `npm run seed:gl` or a `seed:entities` script. Do not port the 22 KB prod `OrganizationForm.tsx`.
- Exchange rates: Master list `/accounting/exchange-rates`, view `exchange_rate_view`, form routes `exchange_rate/view/:viewId` and `exchange_rate/:id/view/:viewId`.

**Acceptance.**

- A posting on Operating Cash and Rent Expense in the org currency appears on the trial balance with debit and credit equal.
- An `opening` posting shows in the opening column and not in the period column.
- Income statement shows income and expense only.
- Two entities in one org. A posting on entity A does not appear when the report is filtered to entity B. The unfiltered report includes both, in the org reporting currency.
- An account in a second currency with a `closing` rate of 2 contributes twice its balance to the balance sheet. With no rate row, the page shows the missing-rate flag and does not treat the rate as 1.
- Backend `tsc --noEmit` is clean. Pages render while logged in as `admin@example.com`.

**Out of scope.** Monthly trial balance, personal-income report, net-worth ratios, HQ account-to-account consolidation, translation to a presentation currency that is not the org base unless the caller passed `currency_id`.

## Module 2 — Customer, supplier, item

**Goal.** Add `customer`, `supplier`, `uom`, and `payment_terms`. Replace the `item_master` stub. Lists and forms. No invoices yet. The legal entity already exists from module 1. Do not replace `entity` again.

**Read first.**

- `prod:backend/prisma/schema/zeiv.prisma` models `customers`, `supplier`, `item_master`, `uom`, `payment_terms`
- Forms: `CustomersForm.tsx`, `SupplierForm.tsx`, `ItemMasterForm.tsx`, `UOMForm.tsx`, `PaymentTermsForm.tsx` under `prod:frontend-1/src/components/forms/Masters/`

**Schema.** Keep the `item_` id prefix. New prefixes: `cust_`, `supp_`, `uom_`, `payt_`. Required `org_id` on all of them. Customer and supplier: `name`, address lines, `email`, `phone`, `currency_id`, `payment_terms_id`, `entity_id` optional, `is_active`. Item: `name`, `code`, `description`, `sales_account_id`, `purchase_account_id`, `uom_id`, `unit_price` as `Decimal(19, 4)`. Drop prod sync columns (`ingest_batch_id`, default source-system id).

`item_master.code` is unique per org, not globally. Prod’s global `@unique` on `item_code` is not copied.

**Code.**

- `backend/src/utils/setup/seedParties.ts` and `npm run seed:parties`. Views: `customer_view`, `supplier_view`, `item_master_view`, `uom_view`, `payment_terms_view`. `entity_view` already exists from module 1.
- Forms in `frontend-0/src/domain/parties/`. Routes in `routes.tsx`: `/sales/customers`, `/purchases/suppliers`, `/masters/items`, `/masters/uom`, `/accounting/payment-terms`, plus `/{model}/view/:viewId` and `/{model}/:id/view/:viewId`. `/masters/entity` stays the module 1 screen.
- Sidebar groups: Organization, Sales, Purchases. Sales and Purchases only show the party or item screens until module 3 and 4.

**Acceptance.** Create one customer, one supplier, and one item whose sales account is an income account. Attach the customer to an entity from module 1. Reload the lists. `item_master` still has `sales_account_id` and `purchase_account_id`.

**Out of scope.** Item categories, locations, business units, cost centers, projects, shipping terms, tax fields on the item. `project_master` stays a stub.

## Module 3 — Sales invoices, receipts, credit notes

**Goal.** A sales invoice posts to the ledger. A receipt settles it. A credit note reverses it.

**Read first.**

- `prod:backend/prisma/schema/zeiv.prisma` models `invoice`, `invoice_line_item`, `payment_receipt`, `credit_note`, `credit_note_item`
- `prod:frontend-1/src/pages/InvoiceList.tsx`, `components/forms/invoice/BillsInvoiceForm.tsx` (sales mode), `components/forms/Masters/PaymentReceiptForm.tsx`, `components/forms/sales/CreditNoteForm.tsx`
- This branch stubs in `domain.prisma` (`inv_`, `payr_`, `cn_`)

**Schema.** Replace the three stubs. Add `invoice_line_item` (`invl_`) and `credit_note_item` (`cni_`). `invoice.direction` is `sales` or `purchase` (prod `invoice_type`, stored lowercase). This module only writes `sales`. Header: `number`, `invoice_date`, `due_date`, `customer_id`, `entity_id`, `currency_id`, `status` (`draft`, `posted`, `void`), `net_amount`, `tax_amount`, `total_amount`, `balance_amount`, all money `Decimal(19, 4)`. Lines: `item_master_id`, `description`, `quantity`, `unit_price`, `amount`, `account_id`. Receipt: `customer_id`, `invoice_id`, `account_id` (bank), `amount`, `receipt_date`, `posting_id`. Credit note: `invoice_id`, `customer_id`, lines, `posting_id`.

On post, insert one `posting`: debit the customer’s receivable account (require an account id on the customer, add `receivable_account_id` in this module), credit the line account. `posting.invoice_id` is already on the posting model. `kind` may be `sales_invoice`. Receipt: debit bank, credit receivable, set `payment_receipt.posting_id`. Void sets `status` and writes a reversing posting through `reverses_id`.

**Code.** `backend/lib/sales/postInvoice.ts` and `postReceipt.ts`. Seed `npm run seed:sales` for `invoice_view`, `payment_receipt_view`, `credit_note_view`. Screens under `frontend-0/src/domain/sales/`. Paths match prod: `/sales/invoices`, `/sales/payment-receipts`, `/sales/credit-notes`.

**Acceptance.** Post a one-line invoice. Transactions shows the debit and credit. Trial balance from module 1 still balances. A receipt reduces `balance_amount`. A second receipt past the balance is rejected.

**Out of scope.** Quote, sales order, delivery challan, invoice PDF upload, email ingest, tax calculation. Leave those prod files unread except to avoid copying them.

## Module 4 — Sales orders (after module 3)

**Goal.** Quote, sales order, and delivery challan, without posting until an invoice is created from the order.

**Read first.** `prod:backend/prisma/schema/sales.prisma`. Forms `QuotesForm.tsx`, `SalesOrderForm.tsx`, `DeliveryChallanForm.tsx`.

**Schema.** New models `quote`, `quote_item`, `sales_order`, `sales_order_item`, `delivery_challan`, `delivery_challan_item`. Status strings lowercase. `sales_order.invoice_id` optional. Creating the invoice copies lines and then uses module 3’s post function.

**Acceptance.** An order in `draft` creates no posting. “Create invoice” creates a draft invoice whose lines match the order.

## Module 5 — Purchase bills

**Goal.** A supplier bill is an `invoice` with `direction = purchase`. It posts debit expense (or the item purchase account), credit the supplier payable.

**Read first.** `BillsInvoiceForm.tsx`, `InvoiceLineItems.tsx`, and the purchase branch of the prod invoice save path. Search prod for `PURCHASE` near invoice create.

**Schema.** Add `supplier.payable_account_id`. Bill header uses `supplier_id` and leaves `customer_id` null. Check constraint is application-level: sales requires customer, purchase requires supplier.

**Code.** `backend/lib/purchases/postBill.ts`. Screen `/purchases/bills` in `frontend-0/src/domain/purchases/`. Seed can extend `seed:sales` or be `npm run seed:bills` if the invoice view must filter by direction. Prefer one `invoice_view` and a default filter `direction = sales` on the sales list, `direction = purchase` on the bills list.

**Acceptance.** A posted bill increases the payable and the expense. Trial balance balances. Paying it writes the opposite posting and clears `balance_amount`.

**Out of scope.** Bill PDF upload (`InvoiceUpload.tsx`), PO match, tax lines.

## Module 6 — Purchase orders and requisitions

**Goal.** Requisition, then purchase order, then “create bill” from the order. Requisition approval uses the kernel workflow.

**Read first.** `prod:backend/prisma/schema/zeiv.prisma` models `purchase_requisition`, `item` (the PR line; do not confuse with `item_master`), `purchase_order`, `purchase_order_item`. Pages `PurchaseRequisition.tsx`, `PurchaseOrder.tsx`. Kernel workflow docs: [../kernel/workflows.md](../kernel/workflows.md).

**Schema.** Replace the `purchase_requisition` and `purchase_order` stubs. Add line models. Prod names the PR line `item`, which collides with nothing here but is a bad name. Call it `purchase_requisition_line`. Status lowercase. `entity_id` not `legal_entity_id`. Money as `Decimal`. Do not port every boolean on the prod requisition (`on_behalf_of`, `on_budget`, `request_for_project`). First slice: number, date, requester user id, `entity_id`, `account_id`, lines (description, quantity, `unit_price`, `item_master_id`), status.

**Workflow.** Seed one flow: draft → submitted → approved → closed, and a reject back to draft. Register the model on `DOMAIN_WORKFLOW_MODELS` in `domain.ts` only after the flow exists.

**Acceptance.** An approved order can create a purchase invoice (module 5) whose lines copy over. The order itself has no posting.

**Out of scope.** Budget check, project, cost center, location. Stubs `budget_period` and `project_master` stay stubs.

## Module 7 — Investing, manual only

**Goal.** Instruments, trades, and holdings. A trade writes a posting. No broker calls.

**Read first.**

- `prod:backend/prisma/schema/data.prisma` models `instrument`, `trade`, `holding` and enums `instrument_type`, `trade_type`
- `prod:docs/book-keeping/INVESTMENTS.md` through the manual-entry section
- Forms `TradeForm.tsx`, `HoldingForm.tsx`
- Skip `backend/src/lib/reports/investments.ts` and `frontend-1/src/pages/investments/OptionsIncomeReport.tsx` until a follow-up says otherwise

**Schema.** Add `instrument` as shareable: `org_id` is `system`, same pattern as `currency`. Fields: `symbol`, `name`, `instrument_type` lowercase (`stock`, `etf`, `option`, `cash`, `bond`, `mutual_fund`), `currency_id`, `isin`. Replace `trade` and `holding` stubs. Trade: `instrument_id`, `account_id` (cash), `target_account_id` (investment account), `trade_type` (`buy`, `sell`), `quantity`, `price`, `amount`, `trade_date`, `posting_id`, `org_id`. Holding: `instrument_id`, `account_id`, `quantity`, `org_id`. Prod `holding.account_id` is required; keep it required.

Buy posting: debit `target_account_id`, credit `account_id`. Sell is the reverse. `kind` stays `journal` unless you add `trade` to the kind comment in `domain.prisma` and the seed description.

**Code.** `backend/lib/investing/postTrade.ts`. Seed `npm run seed:investing`. Screens `/investments/instruments`, `/investments/trades`, `/investments/holdings`. Portfolio page is a later report, not this module.

**Acceptance.** Buy 1 unit at a price. Transactions shows the two accounts. Holding quantity for that org and instrument is 1. A sell larger than the holding is rejected.

**Out of scope.** Option chain, quotes, mobile `/m`, portfolio MCP tools, any broker SDK. The connection model remains `ext_connection`.

## Do not start these

| Item | Reason |
|---|---|
| Bank-feed service and bank-transactions screen | Statement CSV and PDF already import. A live feed is a connector on `ext_connection` after reports exist |
| Tax regions, groups, line tax | Add when a bill or invoice task says a rate is required. US/CA and India do not share one table |
| ERP connectors and prod `backend/integrations` | Sales and purchases have to exist here first |
| Historical categorization and `suggestReconciliationMatches.ts` | The mapper scores against the chart. Matching a bank line to an invoice is a sales/purchase task, in that module’s lib |
| Invoice and bill PDF extractors | `prod:backend/src/lib/extractors/invoice-extractor.ts` and `InvoiceUpload.tsx` |
| Filling `general_ledger` | The chart is `account` |
| Copying prod `category` / `category_group` | The contra account is the category |

## Done when the sequence is done

Modules 1 through 7 each meet their acceptance checks. `backend/src` still has no import from `backend/lib/sales`, `backend/lib/purchases`, or `backend/lib/investing` except the calls inside `backend/lib/domain.ts`. The sidebar shows Reports, the party screens, Sales, Purchases, and Investments. A sales invoice, a supplier bill, and a trade each appear on Transactions and on the trial balance.
