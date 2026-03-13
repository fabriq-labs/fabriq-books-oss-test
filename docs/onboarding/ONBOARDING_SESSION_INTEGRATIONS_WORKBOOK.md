# Session: ERP Integrations — Forward Sync with Zoho Books

**Duration**: 3 hours
**Objective**: Understand the Fabriq integration architecture, set up a Python/DBT environment, and run the Zoho Books forward sync pipeline end-to-end.

**Prerequisites**: Sessions 1–3 completed (development environment running, core concepts understood)

**📖 Learning Material**: [docs/INTEGRATIONS.md](../INTEGRATIONS.md)

---

## Part 1: Integration Architecture Overview (30 min)

### 1.1 Read Before You Start

Read [docs/INTEGRATIONS.md](../INTEGRATIONS.md) sections:
- **Overview** — Forward vs Reverse sync
- **System Architecture** — The full data flow diagram
- **Forward Sync (ELT Pipeline)** — Components 1–4

Take note of the two distinct sync directions:

| Direction | Purpose | Technology | Location |
|-----------|---------|-----------|----------|
| **Forward Sync** | ERP → Fabriq | Python + Airbyte + DBT | `backend/integrations/` |
| **Reverse Sync** | Fabriq → ERP | Node.js (workflow side-effects) | `backend/src/lib/integrations/` |

This session focuses entirely on **Forward Sync**.

### 1.2 The Forward Sync Data Flow

```
Zoho Books API
  ↓  (Airbyte extracts OR direct Python API client)
datalake.zb_* tables  (raw data)
  ↓  (DBT staging — copy-only views)
datalake.stg_zoho_* views
  ↓  (DBT normalized — field mapping + lineage)
public.* tables  (Fabriq application data)
```

Three layers, each with a clear responsibility:

1. **Extraction** — Get raw data from the ERP into `datalake` schema
2. **Staging** — DBT views that select from raw tables (no transforms)
3. **Normalization** — DBT incremental models that map source fields to Fabriq's universal schema

### 1.3 Exercise: Explore the Directory Structure

Open Cursor's file explorer and navigate through the integration directories:

```
backend/integrations/
├── shared/                    # Shared utilities (encryption, DB config)
│   ├── db_config_loader.py    # Loads OAuth creds from database
│   └── encryption.py          # AES-256-CBC encrypt/decrypt
├── zoho_books/                # Zoho Books integration
│   ├── sync_and_transform.py  # Main pipeline orchestrator
│   ├── zoho_accounts_sync.py  # Direct API extraction (Chart of Accounts)
│   ├── run_dbt.py             # DBT pipeline runner
│   ├── requirements.txt       # Python dependencies
│   ├── env.example            # Environment variable template
│   └── dbt/                   # DBT project
│       ├── dbt_project.yml    # DBT project config
│       ├── profiles.yml       # Database connection config
│       ├── models/
│       │   ├── sources/       # Source definitions (datalake.yml)
│       │   ├── staging/       # stg_zoho_* views
│       │   ├── integrations/  # sync_batch metadata
│       │   └── normalized/    # public.* table models
│       └── macros/            # Custom DBT macros
├── xero/                      # Xero integration (same pattern)
└── quickbooks/                # QuickBooks integration (same pattern)
```

**Questions to answer** (check by opening files):
- [ ] What Python packages does the Zoho integration need? → Open `zoho_books/requirements.txt`
- [ ] Where does DBT get its database connection? → Open `zoho_books/dbt/profiles.yml`
- [ ] What raw tables does DBT expect? → Open `zoho_books/dbt/models/sources/datalake.yml`
- [ ] How does the `item_master` normalization work? → Open `zoho_books/dbt/models/normalized/item_master.sql`

---

## Part 2: Python Environment Setup (30 min)

### 2.1 Create a Virtual Environment

The integration scripts run in their own Python environment, separate from the Node.js backend.

```bash
cd backend/integrations/zoho_books

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate    # macOS/Linux
# venv\Scripts\activate     # Windows

# Verify Python is from the venv
which python3
# Should show: .../backend/integrations/zoho_books/venv/bin/python3
```

### 2.2 Install Dependencies

```bash
pip install -r requirements.txt
```

This installs:

| Package | Purpose |
|---------|---------|
| `psycopg2-binary` | PostgreSQL driver for Python |
| `dbt-postgres` | DBT with PostgreSQL adapter |
| `requests` | HTTP client for Zoho Books API |
| `cryptography` | AES-256-CBC decryption for stored OAuth credentials |

### 2.3 Verify Installation

```bash
# Check DBT is installed
dbt --version

# Check Python packages
pip list | grep -E "dbt|psycopg2|requests|cryptography"
```

**Expected**: `dbt-core` 1.8+, `dbt-postgres` 1.8+, `psycopg2-binary` 2.9+

- [ ] Virtual environment created and activated
- [ ] All dependencies installed without errors
- [ ] `dbt --version` works

---

## Part 3: Environment Configuration (30 min)

### 3.1 Create the `.env` File

```bash
cd backend/integrations/zoho_books
cp env.example .env
```

Open `.env` in Cursor and configure the sections below.

### 3.2 Database Credentials

The integration scripts use individual database variables (not a `DATABASE_URL` connection string). Parse the values from your `backend/.env`:

If your `backend/.env` has:
```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
```

Then in `backend/integrations/zoho_books/.env`, set:
```bash
DB_HOST=<HOST>
DB_PORT=<PORT>
DB_USER=<USER>
DB_PASSWORD=<PASSWORD>
DB_NAME=<DBNAME>
```

### 3.3 Encryption Key

Copy `ERP_CONFIG_ENCRYPTION_KEY` from `backend/.env` into your integration `.env`:

```bash
ERP_CONFIG_ENCRYPTION_KEY=<same value as in backend/.env>
```

This key is used to decrypt OAuth credentials stored in the `public.source_system` table.

### 3.4 Organization ID

Every integration run is scoped to one Fabriq tenant. Find your org ID:

```bash
# From the backend directory (adjust the DATABASE_URL)
psql "$DATABASE_URL" -c "SELECT id, name FROM public.org;"
```

Then set it:

```bash
org_id=org_indian_demo   # Replace with your actual org ID
```

### 3.5 Pipeline Control Variables

For your first run, use these settings:

```bash
FORCE_FULL_REFRESH=true      # Bypass date filter on extraction
SKIP_EXTRACTION=false
SKIP_DBT=false
FORCE_PROCESS_ALL=true       # Tell DBT to process ALL records (not just incremental)
ZOHO_START_DATE=2024-01-01T00:00:00Z
```

> **Why `FORCE_PROCESS_ALL=true`?**
> The `public.*` tables may already have demo data with recent `source_updated_at` timestamps. DBT's incremental logic would skip Zoho records whose `last_modified_time` is older than the demo data. Setting this flag bypasses the incremental filter.

### 3.6 Verify Zoho Credentials Exist

The sync script loads OAuth credentials from the database first (encrypted in `public.source_system`). Verify a connection exists:

```bash
psql "$DATABASE_URL" -c \
  "SELECT id, org_id, system_type, is_active FROM public.source_system WHERE system_type = 'zoho_books';"
```

**If a row exists**: You're good — credentials are stored in the database.

**If no row exists**: You need to either configure via the Fabriq frontend, or add fallback env vars:

```bash
ZOHO_CLIENT_ID=<from Zoho API Console>
ZOHO_CLIENT_SECRET=<from Zoho API Console>
ZOHO_REFRESH_TOKEN=<from Zoho API Console>
ZOHO_ORGANIZATION_ID=<from Zoho Books Settings>
ZOHO_API_DOMAIN=www.zohoapis.com
ZOHO_ACCOUNTS_DOMAIN=https://accounts.zoho.com
```

### 3.7 Ensure Database Schemas Exist

The `datalake` schema must exist before DBT can create views in it:

```bash
psql "$DATABASE_URL" -f dbt/setup_schemas.sql
```

- [ ] `.env` created from `env.example`
- [ ] Database credentials configured
- [ ] `ERP_CONFIG_ENCRYPTION_KEY` set
- [ ] `org_id` set
- [ ] `FORCE_PROCESS_ALL=true` for first run
- [ ] Zoho credentials verified (DB or env fallback)
- [ ] `datalake` schema created

---

## Part 4: Run the Forward Sync Pipeline (30 min)

### 4.1 Run the Full Pipeline

With the venv activated:

```bash
cd backend/integrations/zoho_books
source venv/bin/activate
python sync_and_transform.py
```

This orchestrator does two things in sequence:
1. **Extraction** — Calls Zoho Books API, loads Chart of Accounts into `datalake.zb_accounts`
2. **DBT Transform** — Runs staging → integration metadata → normalized models

Watch the output for:
- `✅ Loaded OAuth credentials from database` — Credentials decrypted successfully
- `✅ Successfully refreshed access token` — OAuth token obtained
- `Fetched X accounts from Zoho` — API extraction worked
- `✅ Zoho extraction completed` — Step 1 done
- `DBT Pipeline Cron Job Started` — Step 2 starting
- `PASS=N` in the final DBT output — Models ran successfully

### 4.2 Run Stages Independently

You can run extraction or DBT separately:

```bash
# Extraction only (skip DBT)
SKIP_DBT=true python sync_and_transform.py

# DBT only (skip extraction — useful when Airbyte has already loaded data)
SKIP_EXTRACTION=true python sync_and_transform.py

# Run just the DBT pipeline
python run_dbt.py

# Run DBT for a specific model directly
cd dbt
dbt run --select normalized.item_master \
  --vars '{"force_process_all": true, "org_id": "org_indian_demo"}' \
  --profiles-dir .
```

### 4.3 Verify Results

Check that data flowed through all three layers:

```bash
# Raw extraction (datalake)
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM datalake.zb_accounts;"

# Staging view
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM datalake.stg_zoho_accounts;"

# Sync batch metadata
psql "$DATABASE_URL" -c "SELECT stream_name, row_count FROM datalake.sync_batch;"

# Normalized data
psql "$DATABASE_URL" -c \
  "SELECT id, source_record_id, source_system_id FROM public.account WHERE source_record_id IS NOT NULL LIMIT 5;"
```

- [ ] Pipeline ran without errors
- [ ] Raw data exists in `datalake.zb_*`
- [ ] Staging views resolve
- [ ] `sync_batch` has entries
- [ ] Normalized `public.*` tables have records with `source_record_id` populated

---

## Part 5: Understanding What Happened (20 min)

### 5.1 Trace a Single Record

Pick an account from the raw table and trace it through all layers:

```sql
-- 1. Raw data (what Zoho API returned)
SELECT data->>'account_id' as zoho_id, data->>'account_name' as name
FROM datalake.zb_accounts LIMIT 1;

-- 2. Staging view (copy-only, renamed columns)
SELECT zoho_account_id, account_name
FROM datalake.stg_zoho_accounts LIMIT 1;

-- 3. Normalized table (mapped to Fabriq schema with lineage)
SELECT id, source_record_id, source_system_id, ingest_batch_id
FROM public.account
WHERE source_record_id = '<zoho_account_id from step 1>';
```

### 5.2 Understand the Lineage Fields

Every normalized record carries four lineage fields:

| Field | Purpose | Source |
|-------|---------|--------|
| `source_system_id` | Which ERP this came from | FK → `public.source_system` |
| `source_record_id` | Original ID in the ERP | e.g., Zoho's `account_id` |
| `source_updated_at` | When the ERP last modified it | Zoho's `last_modified_time` |
| `ingest_batch_id` | Which sync batch brought it in | FK → `datalake.sync_batch` |

### 5.3 Understand Incremental Processing

Open `dbt/models/normalized/item_master.sql` and find the incremental filter at the bottom:

```sql
{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or (
        stg.last_modified_time is not null
        and stg.last_modified_time::timestamp > (select max(source_updated_at) from {{ this }})
    )
)
{% endif %}
```

This means on subsequent runs, DBT only processes records whose `last_modified_time` is newer than the latest `source_updated_at` already in the target table. This is why `FORCE_PROCESS_ALL=true` was needed on first run — pre-existing demo data had recent timestamps that blocked older Zoho records.

> **Important rule**: Never use `dbt run --full-refresh`. It drops and recreates tables, which conflicts with Prisma-managed schemas. Always use `FORCE_PROCESS_ALL=true` instead.

---

## Part 6: Understanding the Extraction Methods (20 min)

Fabriq uses two extraction methods depending on the ERP:

### 6.1 Airbyte Cloud (Zoho Books, QuickBooks)

Airbyte is a managed ELT platform that extracts data from ERP APIs and loads it into PostgreSQL.

- **Managed by**: PSO (Professional Services) team
- **Streams synced**: invoices, contacts, bills, sales orders, payments, items
- **Output**: Flat tables in `datalake` schema (e.g., `datalake.zb_invoices`)
- **Metadata columns**: `_airbyte_raw_id`, `_airbyte_extracted_at`, `_airbyte_generation_id`, `_airbyte_meta`

The direct API script (`zoho_accounts_sync.py`) supplements Airbyte for the Chart of Accounts stream, which Airbyte's Zoho connector doesn't support.

### 6.2 Direct API Client (Xero)

For Xero, a Python script calls the API directly (instead of Airbyte) due to a connector bug.

- **Script**: `backend/integrations/xero/xero_api_sync.py`
- **Output**: Same pattern — raw tables in `datalake.xero_*`

### 6.3 Credential Storage

OAuth credentials are stored encrypted in `public.source_system`:

```
connection_config (JSONB) → AES-256-CBC encrypted → "iv:ciphertext" format
```

Both Python (forward sync) and Node.js (reverse sync) can decrypt using the same `ERP_CONFIG_ENCRYPTION_KEY`.

---

## Part 7: Common Issues & Troubleshooting (10 min)

### "Filtered to 0 records modified after..."

The extraction's date filter excluded all records. Their `last_modified_time` is older than `ZOHO_START_DATE`.

**Fix**: Set `FORCE_FULL_REFRESH=true` or use an earlier `ZOHO_START_DATE`.

### "relation datalake.zb_invoices does not exist"

DBT staging views reference raw tables that Airbyte hasn't populated yet. The direct API script only creates `zb_accounts`.

**Fix**: Either run Airbyte to populate the other streams, or run DBT on specific models only:
```bash
dbt run --select staging.stg_zoho_accounts normalized.account --profiles-dir .
```

### Items exist in datalake but not in public schema

The incremental filter is blocking records because existing demo data has newer `source_updated_at` timestamps.

**Fix**: Set `FORCE_PROCESS_ALL=true` and re-run DBT.

### "ERP_CONFIG_ENCRYPTION_KEY environment variable not set"

The encryption key is missing from your `.env`.

**Fix**: Copy `ERP_CONFIG_ENCRYPTION_KEY` from `backend/.env`.

### "No active ERP connection found"

No `source_system` row exists for your org/system_type combo.

**Fix**: Configure via the Fabriq frontend, or add `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` to `.env` as fallback.

---

## Part 8: Completion Checklist

### Environment
- [ ] Python 3.9+ virtual environment created in `backend/integrations/zoho_books/`
- [ ] All pip dependencies installed
- [ ] `dbt --version` returns 1.8+
- [ ] `.env` file configured with DB credentials, encryption key, and org_id

### Pipeline Execution
- [ ] `sync_and_transform.py` runs end-to-end without errors
- [ ] Raw data visible in `datalake.zb_*` tables
- [ ] Staging views resolve (e.g., `SELECT * FROM datalake.stg_zoho_accounts LIMIT 1`)
- [ ] `datalake.sync_batch` has entries for synced streams
- [ ] Normalized data in `public.*` has `source_record_id` populated

### Understanding
- [ ] Can explain the three DBT layers (staging → integration → normalized)
- [ ] Can trace a record from raw → staging → normalized
- [ ] Understand why `FORCE_PROCESS_ALL` is needed on first run
- [ ] Understand the difference between Airbyte extraction and direct API extraction
- [ ] Know where OAuth credentials are stored and how they're decrypted

---

## Self-Reading Resources

Complete these at your own pace after the session.

### Airbyte (Data Extraction)
- [Airbyte Docs — Getting Started](https://docs.airbyte.com/using-airbyte/getting-started/) — Core concepts: Sources, Destinations, Connections, Syncs
- [Airbyte Docs — Zoho Books Source](https://docs.airbyte.com/integrations/sources/zoho-books) — How the Zoho Books connector works
- [Airbyte Docs — Incremental Sync](https://docs.airbyte.com/understanding-airbyte/connections/incremental-append/) — How incremental syncs track state

### DBT (Data Transformation)
- [DBT Docs — Quickstart](https://docs.getdbt.com/quickstarts) — Models, materializations, refs, sources
- [DBT Docs — Incremental Models](https://docs.getdbt.com/docs/build/incremental-models) — Merge strategy, unique keys, `is_incremental()` macro
- [DBT Docs — Jinja & Macros](https://docs.getdbt.com/docs/build/jinja-macros) — Templating in SQL models
- **Project-specific**: `backend/integrations/zoho_books/dbt/README.md` — Commands, workflows, Railway deployment

### Zoho Books (Source ERP)
- [Zoho Books API Docs](https://www.zoho.com/books/api/v3/) — REST API reference
- [Zoho OAuth 2.0](https://www.zoho.com/accounts/protocol/oauth.html) — OAuth flow, refresh tokens, scopes
- [Zoho API Console](https://api-console.zoho.com/) — Where to create/manage API credentials
- **Project-specific**: `backend/integrations/zoho_books/ZOHO_BOOKS_STRATEGY.md` — Design decisions for the Zoho integration

### Integration Architecture
- **Full reference**: [docs/INTEGRATIONS.md](../INTEGRATIONS.md) — End-to-end architecture, credential management, adding new ERPs
- **Reverse sync**: [ONBOARDING_SESSION_INTEGRATIONS_REVERSE_WORKBOOK.md](ONBOARDING_SESSION_INTEGRATIONS_REVERSE_WORKBOOK.md) — Hands-on session for PO → Zoho Books sync via workflow; or read the "Reverse Sync" section in INTEGRATIONS.md and explore `backend/src/lib/integrations/` for the connector factory pattern

---

**End of Integration Session Workbook**
