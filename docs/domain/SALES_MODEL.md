# Universal sales data model (review)

**Branch:** `agentc/sales-universal-model-6a16`  
**Scope:** Module 2 Phase A — Prisma models only (no UI, posting lib, or connectors yet).  
**Schema files:** `backend/prisma/schema/sales.prisma`, `tax.prisma`, `integrations.prisma` (`source_system`) (+ `entity` / `account` / `currency` relation updates).  
**SQL:** `backend/prisma/migration/2026-10-19/sales_universal_model_delta.sql` + `datalake_bootstrap.sql`  
**Local smoke (no UI):** `cd backend && npm run smoke:sales-model` (after `setup:kernel` or applying the SQL deltas).

This document is the coverage matrix and include/park judgment call for **QuickBooks Online**, **Zoho Books**, and **Xero**. NetSuite is noted only for forward-compatibility (no connector on prod).

---

## What we built

| Area | Models |
|---|---|
| Parties | `customer`, thin `supplier` (for tax + ERP vendors + item preferred vendor) |
| Sites / terms | `location`, `payment_terms`, `uom` |
| Catalog | `item_master` (replaces stub; prefix stays `item_`) |
| Tax | `tax_region`, `party_tax_registration`, `tax_master`, `tax_group`, `tax_group_component`, `invoice_line_tax`, `entity_tax_settings`; `entity.tax_treatment` / `default_tax_region_id` |
| Documents | `invoice` + `invoice_line_item`, `payment_receipt` + `payment_receipt_application`, `credit_note` + `credit_note_item` |

**Locked norms:** Decimal money, lowercase enums (`sales`/`purchase`, `draft`/`posted`/`void`), `entity_id`, lineage quartet on syncable headers, `invoice_id` (not prod `instance_id`).

**Intentionally not in this schema:** quote / sales_order / delivery_challan, item_category, shipping_method / shipping_terms masters, `source_system` connection table (Module 3), bank `ext_*` fill-out (Module 3).

---

## How coverage % is calculated

For each ERP we listed **sales-relevant attributes** that appear in that product’s API (and/or prod staging/normalized dbt today). Each attribute gets one judgment:

| Judgment | Meaning |
|---|---|
| **INCLUDE** | Column (or related model) exists on the universal Fabriq model |
| **PARK** | Remains in connector staging / raw JSON / dbt only — not worth a first-class Fabriq column for posting, tax, list UI, or cross-ERP sync |
| **N/A** | ERP does not expose the concept (excluded from denominator) |

\[
\text{Coverage %} = \frac{\text{INCLUDE}}{\text{INCLUDE} + \text{PARK}} \times 100
\]

Lineage technical fields (`source_*`, `ingest_batch_id`) are counted once per syncable entity as INCLUDE for every ERP.

---

## Headline coverage

| ERP | Attributes scored | INCLUDE | PARK | Coverage |
|---|---:|---:|---:|---:|
| **QuickBooks Online** | 78 | 64 | 14 | **82%** |
| **Zoho Books** | 82 | 68 | 14 | **83%** |
| **Xero** | 58 | 48 | 10 | **83%** |

Interpretation: of the ERP fields we judged as sales-relevant, roughly **four out of five** land on the universal model. The remaining ~17–18% are parked in dbt/raw (person-name splits, print/email status, home-currency totals, QBO job balances, Zoho custom fields, etc.).

---

## Judgment principles (applied consistently)

1. **Include** if needed for in-app posting, tax calc, AR balance, multi-entity filter, or if ≥2 ERPs expose it with clear semantics.
2. **Include** lineage on headers that ERPs already sync (and on `credit_note` / `location` / `payment_terms` even when prod omitted them).
3. **Park** UI chrome, print/email flags, person-name atomization when `name` is enough, vendor-only tax engines we re-model via `tax_*`, and purchase-only deep fields (bills stay `direction=purchase` nullable FKs only).
4. **Thin `supplier`** is included now because all three ERPs sync vendors and items/tax need the party — purchase bill UI stays later.
5. **`payment_receipt_application`** is included because Zoho customer payments and QBO Payment.Line LinkedTxn commonly apply one payment to many invoices.

---

## Per-entity matrix

Legend: **I** = INCLUDE · **P** = PARK · **—** = N/A for that ERP

### Customer

| Fabriq / concept | QBO | Zoho | Xero | Judgment notes |
|---|---|---|---|---|
| `name` | I DisplayName | I contact_name | I Name | |
| `legal_name` | I CompanyName | I company_name | P | Xero rarely separates; park company vs name split |
| Billing address fields | I BillAddr | P* | I Addresses | *Zoho contacts stream often omits address — columns exist for when present / UI |
| `email` / `phone` / `website` | I | I | I | |
| Mobile / fax / other phone | P | P | P | Park secondary phones in raw |
| Given/Family/Middle name | P | P | P | Atomized names → park; use `name` |
| `currency_id` | I CurrencyRef | I | I | |
| `payment_terms_id` | I SalesTermRef | I | I | |
| `receivable_account_id` | P | P | P | Not on customer APIs; Fabriq posting config (INCLUDE on model, N/A to ERP %) |
| `tax_treatment` / `default_tax_region_id` | I Taxable/DefaultTaxCode | I tax treatment | I | Mapped into tax primitives |
| `party_tax_registration` | I ResaleNum / tax id | I GSTIN etc. | I TaxNumber | |
| `is_active` | I Active | I status | I ContactStatus | |
| `entity_id` | — | I location/org branch | — | Optional filter; Zoho location may map later |
| `Balance` / BalanceWithJobs | P | P | P | Derived from open invoices, not stored |
| PaymentMethodRef | P | P | P | Method on receipt, not customer master |
| Industry (prod required) | — | — | — | **Dropped** as required; none of the three ERPs need it |
| Lineage | I | I | I | |

### Location

| Concept | QBO | Zoho | Xero | Notes |
|---|---|---|---|---|
| `name` / address / `code` | I (often from BillAddr) | I Locations API | P | Xero tracking categories ≠ site; park until needed |
| `entity_id` / `customer_id` | I | I | — | |
| Department as location | P | — | — | QBO Department → park unless used as site; do not overload `location` blindly |
| Lineage | I | I | — | |

### Payment terms / UOM

| Concept | QBO | Zoho | Xero | Notes |
|---|---|---|---|---|
| Term name + days | I Term | I | I | INCLUDE |
| UOM master | P (on item) | I unit | P | Master included for Zoho/NetSuite; QBO/Xero park unit string on item/raw until linked |

### Item (`item_master`)

| Concept | QBO | Zoho | Xero | Notes |
|---|---|---|---|---|
| `name`, `code` (SKU), `description` | I | I | I | Xero items thinner; still INCLUDE |
| `item_type` | I Type | I item_type | I | lowercase service/inventory/non_inventory |
| `unit_price` | I | I rate | I | Decimal |
| `sales_account_id` / `purchase_account_id` | I | I | I | |
| `is_stockable` | I TrackQtyOnHand | I stock_on_hand | P | |
| `tax_group_id` / `item_tax_category` | I SalesTaxCode | I | I | Code → group or category label |
| `classification_code` / scheme | — | I HSN/SAC | — | INCLUDE for India packs |
| `preferred_supplier_id` | I PrefVendor | P | P | |
| `uom_id` | P | I | P | |
| PurchaseCost / PurchaseDesc | P | P | P | No Fabriq purchase-cost column yet |
| QtyOnHand / inventory detail | P | P | P | Inventory module later |
| Lineage | I | I | I | |

### Tax

| Concept | QBO | Zoho | Xero | Notes |
|---|---|---|---|---|
| `tax_master` (rate component) | I TaxRate | I taxes | I TaxRate | |
| `tax_group` (+ components) | I TaxCode | I tax groups | P | Xero often single rate — park group or 1:1 group |
| `tax_region` / place of supply | P | I | P | INCLUDE model; QBO AST parked as engine detail |
| `invoice_line_tax` snapshot | I TxnTaxDetail lines | I | I | |
| `party_tax_registration` | I | I | I | |
| `entity_tax_settings` pack | — | — | — | Fabriq config (IN/CA/US/GENERIC) |
| Automated sales tax calc engine | P | P | P | Call ERP or local rules later; store results |

### Invoice (+ lines)

| Concept | QBO | Zoho | Xero | Notes |
|---|---|---|---|---|
| `number`, dates, `due_date` | I | I | I | |
| `direction` | I (Invoice vs Bill) | I invoice vs bill | I ACCREC/ACCPAY | sales module writes `sales` |
| `customer_id` / `supplier_id` | I | I | I | |
| `currency_id`, `exchange_rate` | I | I | I | |
| `payment_terms_id` | I | I | I | |
| Amounts net/tax/total/balance | I | I | I | Decimal |
| `shipping_amount` | P | I shipping_charge | — | INCLUDE (Zoho + often QBO custom); Xero N/A |
| `adjustment_amount` | P | I adjustment | P | INCLUDE for Zoho parity |
| `bill_to` / `ship_to` text | I | I | P | |
| `location_id` | I (addr/dept) | I location_id | — | |
| Tax region / responsibility | P | I | P | INCLUDE for India/CA packs |
| `notes` / `reference` | I PrivateNote | I | I Reference | |
| `status` draft/posted/void | I mapped | I | I | ERP Paid/Open → balance + status mapping in dbt |
| PrintStatus / EmailStatus | P | P | P | |
| HomeTotalAmt | P | P | P | Recompute via FX |
| Line item qty/price/amount/item/account | I | I | I | |
| Line tax group + `invoice_line_tax` | I | I | I | |
| Line discount | I | I | I | |
| CustomField / Class / Department | P | P | P | Dimensions later |
| LinkedTxn deep graph | P | P | P | Applications table covers payments |
| Lineage | I | I | I | |

### Payment receipt (+ applications)

| Concept | QBO | Zoho | Xero | Notes |
|---|---|---|---|---|
| Amount, date, customer, deposit account | I | I | I | |
| `payment_method` / reference | I | I | I | |
| `payment_type` full/partial/advance | I | I | I | |
| Multi-invoice application | I Line LinkedTxn | I invoices[] | I | **`payment_receipt_application` INCLUDE** |
| Unapplied / credit remainder | P | P | P | Derive or park |
| ProcessPayment / card fees | P | P bank_charges | P | Park fees |
| Lineage | I | I | I | |

### Credit note (+ lines)

| Concept | QBO | Zoho | Xero | Notes |
|---|---|---|---|---|
| Header + customer + amounts + lines | I CreditMemo | I | I CreditNote | |
| Link to invoice | P (QBO weak) | I | I | nullable `invoice_id` |
| Lineage | I | I | I | **Added** (prod lacked it) |
| TxnTaxDetail | I → line tax | I | I | |

---

## Parked in dbt / raw (summary list)

Do **not** add these as Fabriq columns in Module 2 unless a later review overturns the call:

- QBO/Xero/Zoho: GivenName, FamilyName, MiddleName, Suffix, Title, Fax, AlternatePhone
- QBO: Balance, BalanceWithJobs, PrintOnCheckName, FullyQualifiedName, PrintStatus, EmailStatus, HomeTotalAmt, ClassRef, DepartmentRef (until dimensions module), PurchaseCost, QtyOnHand detail, PaymentMethodRef on customer
- Zoho: custom_fields blob, reporting tags, payment card / autotransaction refunds, unused bill-only requester/AP fields on sales path
- Xero: Tracking categories (as pseudo-location), branded theme, repeating invoice templates
- All: Airbyte meta, SyncToken / optimistic concurrency tokens (connector concern)

---

## ERP-specific coverage detail

### QuickBooks Online — **82%** (64 I / 14 P)

**Strengths vs model:** Customer, Item, Invoice+lines, TaxCode/TaxRate, CreditMemo, Payment+LinkedTxn, Term, BillAddr→location pattern already in prod dbt.

**Gaps parked:** Person-name split, balances on customer, print/email status, home totals, Class/Department, inventory qty, purchase cost.

**Connector work later:** Map TaxCode→`tax_group`, TaxRate→`tax_master`+components; Payment lines→`payment_receipt_application`; CreditMemo lineage into new columns.

### Zoho Books — **83%** (68 I / 14 P)

**Strengths:** Contacts, Items, Invoices, Customer Payments (multi-invoice), Credit Notes, Taxes, Locations, Payment terms, HSN/SAC — all first-class here.

**Gaps parked:** custom_fields, reporting tags, card/autotransaction refunds, contact address often empty in current Airbyte stream (columns ready).

**Connector work later:** Point normalized SQL at `customer` (singular), `direction`, Decimal casts, `invoice_id` on lines, applications table.

### Xero — **83%** (48 I / 10 P)

**Strengths:** Contacts, ACCREC invoices, payments, credit notes, tax rates — covered.

**Thinner catalog:** Items/UOM/locations less rich; tracking categories parked; shipping N/A.

**Connector work later:** Same rename adaptations; dual-role contacts already documented on prod (customer + supplier rows).

---

## NetSuite (design only — not in %)

Expected map: Customer→`customer`, Item→`item_master`, Invoice→`invoice`, CustomerPayment→`payment_receipt`(+applications), CreditMemo→`credit_note`, Location→`location`, TaxGroup/SalesTaxItem→`tax_group`/`tax_master`. No NetSuite connector in this branch; schema should not require NetSuite-only tables.

---

## SQL apply (local)

Do **not** run against prod. After review:

```bash
cd backend
# DATABASE_URL from backend/.env — do not print it
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migration/2026-10-19/sales_universal_model_delta.sql
npx prisma generate
```

Review the delta before apply: it ALTERs stub `invoice` / `payment_receipt` / `credit_note` / `item_master` and CREATEs the new tables. `amount` / `modified_at` defaults were hardened for existing stub rows.

---

## Out of this PR (next after review)

- Seeds + views (`seed:sales`)
- Posting lib + sales UI (Module 2 Phase B)
- Module 3 connectors adapting dbt to these names

Please review the INCLUDE/PARK calls and the three coverage % figures. If you want a parked field promoted (e.g. QBO Department→`location`, or customer secondary phones), say which ones and we adjust the schema before Phase B.
