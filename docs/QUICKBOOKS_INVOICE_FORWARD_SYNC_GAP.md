# QuickBooks Forward Sync — What Works, What’s Missing, and How to Connect Invoices

**Audience:** managers and engineers  
**Last updated:** 2026-09-19  
**Related:** [QUICKBOOKS_FORWARD_SYNC.md](./QUICKBOOKS_FORWARD_SYNC.md) · Zoho reference: `backend/integrations/zoho_books/dbt/`

---

## 1. Simple picture

```
QuickBooks Online
       ↓
Airbyte extract
       ↓
datalake.qb_*          ← raw data lands here
       ↓
DBT models             ← THIS step maps into Fabriq tables
       ↓
public.* tables        ← Fabriq app / views read from here
```

- If a stream has **DBT models**, it appears in Fabriq.
- If a stream is only in the **datalake**, it does **not** appear in Fabriq.

---

## 2. What is already connected (shows in Fabriq)

| Airbyte table | DBT staging | Fabriq table | App area |
|---------------|-------------|--------------|----------|
| `datalake.qb_customers` | `stg_qbo_customers` | `public.customers` | Customers |
| `datalake.qb_vendors` | `stg_qbo_vendors` | `public.supplier` | Vendors / Suppliers |
| `datalake.qb_items` | `stg_qbo_items` | `public.item_master` | Items |
| `datalake.qb_accounts` | `stg_qbo_accounts` | `public.account` | Chart of Accounts |

These are end-to-end: QuickBooks → Airbyte → DBT → Fabriq table → UI.

---

## 3. What is not connected (does not show in Fabriq)

| Airbyte table | In datalake? | Connected to Fabriq table? | Result in app |
|---------------|--------------|----------------------------|---------------|
| `datalake.qb_invoices` | Yes | **No** | Invoices empty |
| `datalake.qb_bills` | Yes | **No** | Bills / purchase invoices empty |
| `datalake.qb_purchase_orders` | Yes | **No** | POs empty |
| `datalake.qb_tax_codes` / `qb_tax_rates` | Yes (often 0 rows) | **No** | Tax masters empty |

### Why invoices don’t show

Invoices **are extracted** into `datalake.qb_invoices`, but they are **not mapped** into Fabriq’s `public.invoice` table.

So:

- Airbyte side = OK  
- Fabriq table connection = **missing**  
- App invoice screens = empty  

---

## 4. What to do to connect invoices to the Fabriq table

Goal:

```
datalake.qb_invoices  →  public.invoice  →  Invoice UI
```

Follow the same pattern as Zoho (`stg_zoho_invoices` → `invoice`) and existing QB customers.

### Step A — Declare the source

**File to edit:**

`backend/integrations/quickbooks/dbt/models/sources/datalake.yml`

**What to add:** a `qb_invoices` table entry under `sources → datalake → tables` (same style as `qb_customers` / `qb_items`).

---

### Step B — Create staging model

**New file:**

`backend/integrations/quickbooks/dbt/models/staging/stg_qbo_invoices.sql`

**What it does:**

- Read from `{{ source('datalake', 'qb_invoices') }}`
- Map QBO columns to snake_case, for example:
  - `"Id"` → `invoice_id`
  - `"DocNumber"` → `invoice_number`
  - `"TxnDate"` / `"DueDate"` → dates
  - `"TotalAmt"` / `"Balance"` → totals
  - `"CustomerRef"->>'value'` → `customer_id` (QBO id)
  - `"MetaData"` create/update times
  - keep `_airbyte_generation_id` for lineage

**Reference:** `backend/integrations/quickbooks/dbt/models/staging/stg_qbo_customers.sql`

---

### Step C — Add invoice batch to sync lineage

**File to edit:**

`backend/integrations/quickbooks/dbt/models/integrations/sync_batch.sql`

**What to add:**

- New CTE `invoices_batch` (copy `customers_batch` pattern)
- `stream_name = 'invoices'`
- `destination_table = 'qb_invoices'`
- Source from `{{ ref('stg_qbo_invoices') }}`
- Union it into `all_batches`

Without this, the normalized model cannot attach `ingest_batch_id`.

---

### Step D — Create normalized model (connect to Fabriq table)

**New file:**

`backend/integrations/quickbooks/dbt/models/normalized/invoice.sql`

**What it does:**

- Merge into `public.invoice`
- Unique key: `[source_record_id, source_system_id, org_id]` (same as other QB normalized models)
- Map fields, for example:
  - `source_record_id` = QBO invoice `Id`
  - `invoice_number` = `DocNumber`
  - `invoice_date` / due date
  - `invoice_total` = `TotalAmt`
  - `balance_amount` = `Balance`
  - `invoice_type` = `'SALES'`
  - `org_id` = `var('org_id')`
  - `source_system_id` / `ingest_batch_id` from `source_system` + `sync_batch`
  - `customer_id` = join `public.customers` where `customers.source_record_id` = QBO `CustomerRef.value`

**References:**

- QB pattern: `backend/integrations/quickbooks/dbt/models/normalized/customers.sql`
- Zoho invoice: `backend/integrations/zoho_books/dbt/models/normalized/invoice.sql`
- Xero invoice: `backend/integrations/xero/dbt/models/normalized/invoice.sql`

---

### Step E — Run transform (load into Fabriq)

Invoices are already in the datalake, so a full Airbyte re-extract is usually **not** required.

Option 1 — Fabriq UI: Sync with **`transform_only`** or **`full_sync`**

Option 2 — CLI:

```bash
cd backend/integrations/quickbooks
export org_id=org_indian_demo
FORCE_PROCESS_ALL=true python run_dbt.py
```

---

### Step F — Verify

```sql
-- Raw (Airbyte)
SELECT COUNT(*) FROM datalake.qb_invoices;

-- Fabriq table (should become > 0 after fix)
SELECT COUNT(*)
FROM public.invoice
WHERE org_id = 'org_indian_demo'
  AND source_system_id IS NOT NULL
  AND source_record_id IS NOT NULL;
```

Then open **Invoices** in the Fabriq UI.

---

## 5. File checklist (where to add code)

| # | Action | Path |
|---|--------|------|
| 1 | Edit | `backend/integrations/quickbooks/dbt/models/sources/datalake.yml` |
| 2 | Create | `backend/integrations/quickbooks/dbt/models/staging/stg_qbo_invoices.sql` |
| 3 | Edit | `backend/integrations/quickbooks/dbt/models/integrations/sync_batch.sql` |
| 4 | Create | `backend/integrations/quickbooks/dbt/models/normalized/invoice.sql` |
| 5 | Run | `backend/integrations/quickbooks/run_dbt.py` (or Sync in UI) |
| 6 | Optional later | invoice line items → `public.invoice_line_item` from QBO `Line` JSON |

**Do not change for this fix:** Airbyte connection itself (extract already works), or Fabriq invoice views (they already exist; they just need data in `public.invoice`).

---

## 6. Later (same approach)

| Stream | Staging file to add | Fabriq table |
|--------|---------------------|--------------|
| `qb_bills` | `stg_qbo_bills.sql` | `public.invoice` (`invoice_type = 'PURCHASE'`) |
| `qb_purchase_orders` | `stg_qbo_purchase_orders.sql` | `public.purchase_order` |
| Tax codes / rates | TBD | tax-related tables |

---

## 7. One-line summary

**Customers / vendors / items / accounts are connected to Fabriq tables. Invoices are in `datalake.qb_invoices` but not connected yet — add DBT staging + sync_batch + normalized `invoice.sql`, then run transform so rows land in `public.invoice`.**
