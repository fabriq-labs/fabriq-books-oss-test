# Xero Integration Strategy & Design Decisions

This document consolidates all key architectural decisions, strategies, and design patterns for the Xero integration.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [State Management](#state-management)
3. [Token Management](#token-management)
4. [Dual-Role Contacts Handling](#dual-role-contacts-handling)
5. [Invoice Type Mapping](#invoice-type-mapping)
6. [Field Mapping Strategy](#field-mapping-strategy)
7. [OAuth Setup](#oauth-setup)
8. [.NET Date Format Handling](#net-date-format-handling)
9. [Duplicate Prevention](#duplicate-prevention)

---

## Architecture Overview

### Key Difference from Zoho Books

Unlike Zoho Books which uses PSO-managed Airbyte Cloud, Xero integration uses a **Direct API Client** (`xero_api_sync.py`) for data extraction because:
1. Xero is not available in Airbyte Cloud
2. PyAirbyte Xero connector has a bug with .NET date format parsing (`/Date(...)/`)
3. Direct API client provides better control and reliability

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Railway Cron Service                             │
│                                                                      │
│  sync_and_transform.py                                              │
│  ├── 1. Direct API Client (xero_api_sync.py)                       │
│  │      - OAuth 2.0 token refresh (automatic)                       │
│  │      - Calls Xero API (incremental via If-Modified-Since)        │
│  │      - Writes to datalake.xero_* tables                         │
│  │      - State via max UpdatedDateUTC from data                   │
│  │                                                                  │
│  └── 2. DBT Pipeline (dbt/run_dbt.py)                              │
│         - Staging → Integration → Normalized                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Comparison Table

| Aspect | Zoho Books | Xero |
|--------|-----------|------|
| Extraction Tool | Airbyte Cloud (PSO) | Direct API Client (self-managed) |
| State Storage | Airbyte Cloud internal | Max `UpdatedDateUTC` from data |
| Table Prefix | `zb_` | `xero_` |
| Authentication | API Key | OAuth 2.0 refresh token |
| Token Management | N/A | Automatic via `.xero_tokens.json` |
| Railway Entry | `run_dbt.py` | `sync_and_transform.py` |

---

## State Management

### How State Works

Unlike PyAirbyte which uses a separate `_airbyte_state` table, our direct API client uses **implicit state** by querying the max `UpdatedDateUTC` from the actual data:

1. **First Run**: Uses `XERO_START_DATE` from environment (required)
2. **Subsequent Runs**: Queries max `UpdatedDateUTC` from `datalake.xero_*` tables
3. **Incremental Sync**: Sends `If-Modified-Since` header to Xero API
4. **Buffer**: Adds 1 second to timestamp to avoid Xero returning records with exact same timestamp (Xero's header is inclusive)

### State Query Logic

```sql
-- Get max UpdatedDateUTC from actual data
SELECT MAX(
    CASE 
        -- .NET JSON date format: /Date(1234567890000+0000)/
        WHEN data->>'UpdatedDateUTC' ~ '^/Date' THEN
            to_timestamp(
                (substring(data->>'UpdatedDateUTC' from '/Date\(([0-9]+)'))::bigint / 1000.0
            )
        -- ISO 8601 format
        WHEN data->>'UpdatedDateUTC' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
            (data->>'UpdatedDateUTC')::timestamp
        ELSE NULL
    END
) as max_updated_date
FROM datalake.xero_invoices
WHERE data->>'UpdatedDateUTC' IS NOT NULL;
```

### Benefits

- **Simpler**: No separate state table to manage
- **Accurate**: Uses Xero's actual update timestamps
- **Self-healing**: If data exists, we can always find the cursor
- **Per-table**: Each stream (invoices, contacts, payments) has its own cursor

### Force Full Refresh

When you need to re-sync all data:

```bash
# Set environment variable
FORCE_FULL_REFRESH=true python sync_and_transform.py
```

This ignores the last sync time and re-syncs from `XERO_START_DATE`.

---

## Token Management

### Automatic Token Refresh

Tokens are automatically managed via `.xero_tokens.json` file:

1. **Initial Setup**: Run `oauth_setup.py` once to generate tokens
2. **Token Storage**: Saved to `.xero_tokens.json` (not in `.env`)
3. **Auto-Refresh**: Tokens refresh automatically when expired (30 minutes)
4. **Persistent**: Tokens persist across runs

### Token File Structure

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI...",
  "refresh_token": "ajIPf1E9DI4sj-VeGArQ2lcH_qv_huQtu7LkULttpg4",
  "expires_in": 1800,
  "created_at": "2025-11-26T23:00:00+00:00"
}
```

### How It Works

1. **On Startup**: Loads tokens from `.xero_tokens.json` if available
2. **Before API Calls**: Checks if token is expired (older than 25 minutes)
3. **Auto-Refresh**: Refreshes token if expired or missing
4. **On 401 Errors**: Automatically refreshes and retries request
5. **Token Update**: Saves refreshed tokens back to `.xero_tokens.json`

### Environment Variables

**Required in `.env`:**
- `XERO_CLIENT_ID` - From Xero Developer Portal
- `XERO_CLIENT_SECRET` - From Xero Developer Portal
- `XERO_TENANT_ID` - Your Xero organization ID
- `XERO_START_DATE` - Start date for historical data (ISO 8601 format)

**NOT Required in `.env`:**
- `XERO_ACCESS_TOKEN` - Managed automatically
- `XERO_REFRESH_TOKEN` - Managed automatically (initial setup only)

---

## Dual-Role Contacts Handling

### Problem Statement

Unlike Zoho Books where `contact_type` is mutually exclusive ('customer' OR 'vendor'), Xero contacts can be **BOTH** customer AND supplier simultaneously.

### How Xero Classifies Contacts

- `IsCustomer = true` when a sales invoice (ACCREC) is created for the contact
- `IsSupplier = true` when a purchase bill (ACCPAY) is created for the contact
- Both flags are **transaction-driven** (not explicitly set at creation)
- New contacts with no transactions have both flags as `false`

### Handling Strategy

```sql
-- customers.sql: Include contacts where IsCustomer = true
SELECT * FROM {{ ref('stg_xero_contacts') }}
WHERE is_customer = true
  AND contact_status = 'ACTIVE'

-- supplier.sql: Include contacts where IsSupplier = true
SELECT * FROM {{ ref('stg_xero_contacts') }}
WHERE is_supplier = true
  AND contact_status = 'ACTIVE'
```

### Result

The **same Xero contact** may appear in **BOTH** `public.customers` AND `public.supplier` tables. This is valid business logic - the same company can be both a customer and supplier.

### Comparison

| Aspect | Zoho Books | Xero |
|--------|-----------|------|
| Model | Single `contacts` table | Single `contacts` table |
| Differentiation | `contact_type` = 'customer' OR 'vendor' | `IsCustomer` + `IsSupplier` booleans |
| Mutually Exclusive? | Yes | No |
| Empty contacts | Must specify type at creation | Both flags false until transactions |

---

## Invoice Type Mapping

### Xero Invoice Types

Xero uses a single `invoices` endpoint with a `Type` field:

- `Type = "ACCREC"` → Accounts Receivable → Sales Invoice → `invoice_type = 'SALES'`
- `Type = "ACCPAY"` → Accounts Payable → Purchase Bill → `invoice_type = 'PURCHASE'`

### Implementation

```sql
-- In invoice.sql
CASE 
    WHEN stg.type = 'ACCREC' THEN 'SALES'
    WHEN stg.type = 'ACCPAY' THEN 'PURCHASE'
    ELSE stg.type  -- Fallback for any other types
END AS invoice_type
```

### Comparison with Zoho Books

| Source | Zoho Books | Xero |
|--------|-----------|------|
| Sales Invoices | `zb_invoices` table | `xero_invoices` with `Type='ACCREC'` |
| Purchase Bills | `zb_bills` table | `xero_invoices` with `Type='ACCPAY'` |
| DBT Model | UNION of two CTEs | Single SELECT with CASE |

---

## Field Mapping Strategy

### PascalCase to snake_case

Xero uses PascalCase field names. We convert in the staging layer by extracting from JSONB:

```sql
-- stg_xero_invoices.sql
SELECT
    data->>'InvoiceID' AS invoice_id,
    data->>'InvoiceNumber' AS invoice_number,
    data->>'Type' AS type,
    data->>'Status' AS status,
    (data->>'Total')::numeric AS total,
    (data->>'AmountDue')::numeric AS amount_due,
    {{ parse_xero_date("data->>'UpdatedDateUTC'") }} AS updated_date_utc,
    ...
FROM {{ source('datalake', 'xero_invoices') }}
```

### JSONB Array Extraction

Xero returns nested arrays for Phones and Addresses:

```sql
-- Extract first phone number
(phones->0->>'PhoneNumber')::text AS primary_phone

-- Extract address (prefer STREET type, fallback to first)
COALESCE(
    (SELECT a->>'AddressLine1' FROM jsonb_array_elements(addresses) a 
     WHERE a->>'AddressType' = 'STREET' LIMIT 1),
    (addresses->0->>'AddressLine1')
) AS address_line1
```

### Key Field Mappings

#### Invoices

| Xero Field | Fabriq Field | Notes |
|------------|--------------|-------|
| `InvoiceID` | `source_record_id` | UUID |
| `InvoiceNumber` | `invoice_number` | |
| `Type` | `invoice_type` | ACCREC→SALES, ACCPAY→PURCHASE |
| `Status` | `invoice_status` | DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED |
| `Total` | `invoice_total` | |
| `AmountDue` | `balance_amount` | |
| `SubTotal` | `invoice_net_total` | |
| `TotalTax` | `tax_total` | |
| `Date` | `invoice_date` | |
| `UpdatedDateUTC` | `source_updated_at` | |
| `Reference` | `po_number` | |
| `Contact.ContactID` | For FK lookup | |

#### Contacts

| Xero Field | Fabriq Field | Notes |
|------------|--------------|-------|
| `ContactID` | `source_record_id` | |
| `Name` | `customer_name` / `supplier_name` | |
| `EmailAddress` | `primary_email` | |
| `Phones[0].PhoneNumber` | `primary_phone` | JSONB array |
| `Addresses[0].*` | Address fields | JSONB array |
| `Website` | `website` | |
| `IsCustomer` | Filter for customers | Boolean |
| `IsSupplier` | Filter for suppliers | Boolean |
| `UpdatedDateUTC` | `source_updated_at` | |

#### Payments

| Xero Field | Fabriq Field | Notes |
|------------|--------------|-------|
| `PaymentID` | `source_record_id` | |
| `Reference` | `receipt_number` | |
| `Date` | `receipt_date` | |
| `Amount` | `amount` | |
| `PaymentType` | `payment_type` | Map to FULL/PARTIAL/ADVANCE |
| `Status` | `status` | |
| `Invoice.InvoiceID` | For invoice FK | |
| `UpdatedDateUTC` | `source_updated_at` | |

---

## OAuth Setup

### Xero OAuth 2.0 Flow

Xero requires OAuth 2.0 with refresh tokens:

1. **Create Xero App**: https://developer.xero.com/app/manage
2. **Set Redirect URI**: `http://localhost:3000/callback` (for local setup)
3. **Get Authorization Code**: User consent flow
4. **Exchange for Tokens**: Get `access_token` and `refresh_token`
5. **Store Tokens**: Automatically saved to `.xero_tokens.json`

### Required Credentials

**In `.env` file:**
```bash
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_TENANT_ID=your_organization_id
XERO_START_DATE=2024-01-01T00:00:00Z  # ISO 8601 format, REQUIRED
```

**NOT in `.env` (managed automatically):**
- `XERO_ACCESS_TOKEN` - Stored in `.xero_tokens.json`
- `XERO_REFRESH_TOKEN` - Stored in `.xero_tokens.json`

### Initial Token Generation

Use `oauth_setup.py` to perform the initial OAuth flow:

```bash
cd integrations/xero
python oauth_setup.py
# Follow browser prompts to authorize
# Tokens automatically saved to .xero_tokens.json
```

### Token Refresh

The direct API client automatically handles token refresh:
- Checks expiration before API calls (refreshes if < 25 minutes remaining)
- Automatically refreshes on 401 errors
- Updates `.xero_tokens.json` with new tokens
- No manual intervention needed

---

## .NET Date Format Handling

### Problem

Xero uses .NET JSON date format: `/Date(1419937200000+0000)/`
- Format: `/Date(milliseconds_since_epoch+timezone_offset)/`
- Example: `/Date(1764201253197+0000)/` = `2025-11-26T23:54:13.197+00:00`

### Solution

Created `parse_xero_date()` macro in DBT to handle both formats:

```sql
{% macro parse_xero_date(field) %}
    CASE 
        -- .NET JSON date format: /Date(1234567890000+0000)/
        WHEN {{ field }} ~ '^/Date' THEN
            to_timestamp(
                (substring({{ field }} from '/Date\(([0-9]+)'))::bigint / 1000.0
            )
        -- ISO 8601 format
        WHEN {{ field }} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
            ({{ field }})::timestamp
        ELSE NULL
    END
{% endmacro %}
```

### Usage

All date fields in staging views use this macro:

```sql
{{ parse_xero_date("data->>'Date'") }} as date,
{{ parse_xero_date("data->>'UpdatedDateUTC'") }} as updated_date_utc,
```

---

## Duplicate Prevention

### Problem

Each sync run generates a new `generation_id` (timestamp-based), causing:
- Same Xero record gets different `_airbyte_raw_id` each run
- `ON CONFLICT (_airbyte_raw_id)` doesn't catch duplicates
- Multiple copies of the same record accumulate

### Solution

**1. Unique Index on Xero ID:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS xero_invoices_xero_id_idx 
ON datalake.xero_invoices ((data->>'InvoiceID'))
WHERE data->>'InvoiceID' IS NOT NULL;
```

**2. Check Before Insert:**
- Query existing record by Xero ID
- Compare `UpdatedDateUTC` - skip if unchanged
- Delete old record and insert new one if changed

**3. Skip Unchanged Records:**
```python
if existing_updated == new_updated:
    skipped_count += 1
    continue  # Skip - no changes
```

### Result

- No duplicate records created
- Only actually changed records are updated
- Efficient processing (skips unchanged records)

---

## Incremental Processing Strategy

### Two Layers of Incremental

1. **API Layer**: Uses `If-Modified-Since` header to only fetch new/updated records from Xero
2. **DBT Layer**: Only processes records with `UpdatedDateUTC` newer than max in target table

### DBT Incremental Logic

```sql
{% if is_incremental() and not var('force_process_all', false) %}
-- Only process records updated since last run
AND stg.updated_date_utc > (
    SELECT max(source_updated_at) FROM {{ this }}
)
{% endif %}
```

### Force Full Refresh

```bash
# Environment variable
FORCE_PROCESS_ALL=true python run_dbt.py

# Or via DBT
dbt run --select normalized.* --full-refresh --profiles-dir .
```

---

## Summary

### Key Design Decisions

1. ✅ **Direct API Client**: Self-managed with automatic token refresh
2. ✅ **State Management**: Implicit via max `UpdatedDateUTC` from data
3. ✅ **Token Management**: Automatic via `.xero_tokens.json` (not in `.env`)
4. ✅ **Dual-Role Contacts**: Same contact can be in both customers AND supplier tables
5. ✅ **Invoice Type Mapping**: Single table with Type field (ACCREC→SALES, ACCPAY→PURCHASE)
6. ✅ **PascalCase Conversion**: Handle in staging layer
7. ✅ **JSONB Extraction**: For nested arrays (Phones, Addresses)
8. ✅ **.NET Date Format**: Custom macro to parse `/Date(...)/` format
9. ✅ **Duplicate Prevention**: Unique index + UpdatedDateUTC comparison

### Current Implementation Status

- ✅ Direct API client (`xero_api_sync.py`)
- ✅ Automatic token refresh
- ✅ State management via UpdatedDateUTC
- ✅ DBT staging models
- ✅ DBT normalized models
- ✅ OAuth setup helper
- ✅ Railway deployment config
- ✅ Duplicate prevention
- ✅ .NET date format handling
