# Xero Integration DBT Project

## Overview

This DBT project handles the normalization of Xero data extracted via direct API client into the Fabriq universal data model.

**Location:** `integrations/xero/dbt/`

## Architecture

### Data Flow

```
Xero API → Direct API Client (xero_api_sync.py) → datalake.xero_* → DBT Staging → DBT Normalized → public.*
```

### Schemas

- `datalake`: Raw Xero API data, staging views (`stg_xero_*`), and integration metadata
- `public`: Normalized Fabriq business data

## Key Differences from Zoho Books

| Aspect | Zoho Books | Xero |
|--------|-----------|------|
| Extraction | Airbyte Cloud (PSO) | Direct API Client (self-managed) |
| State Storage | Airbyte Cloud | Incremental sync via `UpdatedDateUTC` |
| Table Prefix | `zb_` | `xero_` |
| Contacts | `contact_type` field | `IsCustomer` + `IsSupplier` booleans |
| Invoice/Bill | Separate tables | Single table with `Type` field |

**Note:** We use a direct Xero API client instead of PyAirbyte due to a bug in the PyAirbyte Xero connector with .NET date format parsing (`/Date(...)/`). The direct API client handles this correctly.

## Setup

### Prerequisites

- Python 3.9+ installed
- PostgreSQL database with `datalake` and `public` schemas
- Xero Developer account and OAuth app configured
- Access to the target PostgreSQL database

### Developer Setup (From Scratch)

#### 1. Navigate to Integration Directory

```bash
cd integrations/xero
```

#### 2. Create Virtual Environment

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate
```

#### 3. Install Dependencies

```bash
# Install Python packages
pip install -r requirements.txt

# Verify DBT installation
dbt --version
# Should show: dbt-core 1.2.2 and dbt-postgres 1.2.2
```

#### 4. Configure Environment Variables

```bash
# Copy example environment file
cp env.example .env

# Edit .env with your values
# Required variables:
# - Database connection (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
# - Xero OAuth credentials (XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_TENANT_ID)
# - XERO_START_DATE (ISO 8601 format, e.g., 2024-01-01T00:00:00Z)
```

**Required Environment Variables:**

```bash
# Database
DB_HOST=your_db_host
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=your_database

# Xero OAuth (from Xero Developer Portal)
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_TENANT_ID=your_organization_id

# Xero Start Date (REQUIRED for first run)
XERO_START_DATE=2024-01-01T00:00:00Z  # ISO 8601 format

# Optional
FORCE_PROCESS_ALL=false  # Set true to force full refresh
SKIP_EXTRACTION=false    # Set true to skip API sync, only run DBT
SKIP_DBT=false           # Set true to skip DBT, only run API sync
```

#### 5. Set Up Xero OAuth Tokens

```bash
# Run OAuth setup script (one-time)
python oauth_setup.py

# This will:
# 1. Open browser for Xero authorization
# 2. Generate access_token and refresh_token
# 3. Save tokens to .xero_tokens.json (automatically managed)
```

**Note:** Tokens are automatically refreshed by the API client. You don't need to manually manage them after initial setup.

#### 6. Set Up Database Schemas

```bash
# Load environment variables
export $(cat .env | xargs)

# Create schemas (if they don't exist)
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -f dbt/setup_schemas.sql
```

#### 7. Set Up Integration Metadata Tables

```bash
# Create source_system and sync_batch tables
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -f dbt/setup_datalake_tables.sql
```

#### 8. Verify DBT Configuration

```bash
cd dbt

# Test database connection
dbt debug --profiles-dir .

# Should show:
# - Connection test: [OK connection ok]
# - Profile: [OK found]
# - Dependencies: [OK found]
```

#### 9. Run Initial Data Extraction

```bash
# Go back to integration root
cd ..

# Run full pipeline (extraction + transformation)
python sync_and_transform.py

# Or run extraction only
SKIP_DBT=true python sync_and_transform.py
```

#### 10. Run DBT Transformation

```bash
cd dbt

# Run all models
python run_dbt.py

# Or run manually
dbt run --profiles-dir .
```

### Verification

After setup, verify the pipeline:

```bash
# Check raw data in datalake
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c \
  "SELECT COUNT(*) FROM datalake.xero_invoices;"

# Check staging views
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c \
  "SELECT COUNT(*) FROM datalake.stg_xero_invoices;"

# Check normalized data
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c \
  "SELECT COUNT(*) FROM public.invoice WHERE source_system_id = (SELECT id FROM datalake.source_system WHERE name = 'xero');"
```

## Models

### Staging Layer (`datalake` schema)

- `stg_xero_invoices`: Invoices (ACCREC + ACCPAY)
- `stg_xero_contacts`: Contacts (customers + suppliers)
- `stg_xero_payments`: Payments

### Integration Layer (`datalake` schema)

- `source_system`: Xero source system record
- `sync_batch`: Batch metadata and audit trail

### Normalized Layer (`public` schema)

- `invoice`: Sales invoices (ACCREC→SALES) and purchase bills (ACCPAY→PURCHASE)
- `customers`: Contacts where `IsCustomer=true`
- `supplier`: Contacts where `IsSupplier=true`
- `payment_receipt`: Payment records

## Running the Pipeline

### Full Pipeline (Extraction + Transformation)

```bash
# From integrations/xero/
python sync_and_transform.py
```

This runs:
1. Xero API extraction (`xero_api_sync.py`)
2. DBT transformation (`dbt/run_dbt.py`)

### Extraction Only

```bash
SKIP_DBT=true python sync_and_transform.py
```

### DBT Only

```bash
SKIP_EXTRACTION=true python sync_and_transform.py
```

### DBT Commands

**Normal (incremental):**
```bash
cd dbt
python run_dbt.py
# Or manually:
dbt run --profiles-dir .
```

**Force full refresh:**
```bash
cd dbt
FORCE_PROCESS_ALL=true python run_dbt.py
# Or manually:
dbt run --select normalized.* --full-refresh --profiles-dir .
```

**Run specific stage:**
```bash
cd dbt
dbt run --select staging.* --profiles-dir .
dbt run --select integrations.* --profiles-dir .
dbt run --select normalized.* --profiles-dir .
```

**Run specific model:**
```bash
cd dbt
dbt run --select stg_xero_invoices --profiles-dir .
dbt run --select invoice --profiles-dir .
```

## Dual-Role Contacts

Xero contacts can be both customers AND suppliers. The same contact may appear in:
- `public.customers` if `IsCustomer=true`
- `public.supplier` if `IsSupplier=true`

This is valid business logic - the same company can be both.

## Invoice Type Mapping

Xero uses a single `invoices` table with `Type` field:
- `Type='ACCREC'` → `invoice_type='SALES'` (sales invoice)
- `Type='ACCPAY'` → `invoice_type='PURCHASE'` (purchase bill)

## Lineage Tracking

All normalized records include:
- `source_system_id`: FK to `datalake.source_system`
- `source_record_id`: Xero UUID
- `source_updated_at`: `UpdatedDateUTC` from Xero
- `ingest_batch_id`: FK to `datalake.sync_batch`

## Testing

```bash
cd dbt
dbt test --profiles-dir .
```

## Troubleshooting

### Staging views fail

**Error:** `relation "datalake.xero_invoices" does not exist`

**Solution:**
- Ensure data extraction has run: `python sync_and_transform.py` (without `SKIP_EXTRACTION`)
- Check that `xero_api_sync.py` successfully wrote data to `datalake.xero_*` tables

### Normalized models fail

**Error:** `relation "datalake.source_system" does not exist`

**Solution:**
- Run `setup_datalake_tables.sql` to create metadata tables
- Ensure staging views exist first: `dbt run --select staging.*`

### Duplicate records

**Symptom:** Same Xero record appears multiple times in normalized tables

**Solution:**
- Check if `sync_batch` has duplicate entries
- The lateral join with `DISTINCT ON` should prevent this
- Verify unique constraints on `source_record_id`

### Token expiration errors

**Error:** `401 Unauthorized` or token-related errors

**Solution:**
- Tokens should auto-refresh, but if issues persist:
  1. Delete `.xero_tokens.json`
  2. Re-run `python oauth_setup.py`
  3. Verify `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` in `.env`

### Missing XERO_START_DATE on first run

**Error:** `XERO_START_DATE is required for first run`

**Solution:**
- Add `XERO_START_DATE=YYYY-MM-DDTHH:MM:SSZ` to `.env`
- Format: ISO 8601 (e.g., `2024-01-01T00:00:00Z`)
- This prevents accidentally fetching all historical data

### .NET date format errors

**Error:** `invalid input syntax for type timestamp: "/Date(...)/"`

**Solution:**
- This should be handled automatically by `parse_xero_date()` macro
- Verify staging views use the macro: `{{ parse_xero_date("data->>'Date'") }}`
- Check `dbt/macros/cast_utils.sql` exists

### DBT schema issues

**Error:** Models created in wrong schema (e.g., `public.datalake.stg_xero_invoices`)

**Solution:**
- Verify `generate_schema_name` macro exists: `dbt/macros/generate_schema_name.sql`
- Check `dbt_project.yml` uses `+custom_schema` not `+schema`
- Run `dbt debug --profiles-dir .` to verify configuration

## Related Documentation

- [XERO_STRATEGY.md](../XERO_STRATEGY.md) - Design decisions and architecture
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Overall integration platform architecture
