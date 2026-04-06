# Zoho Books Integration DBT Project

## Overview
This DBT project handles the normalization of Zoho Books data landed by Airbyte into the Fabriq universal data model.

**Location:** `integrations/zoho_books/dbt/`

## Documentation

- **Strategy & Design Decisions**: See [../ZOHO_BOOKS_STRATEGY.md](../ZOHO_BOOKS_STRATEGY.md) for:
  - Foreign Key Population Strategy
  - Invoice vs Bill Design Decision
  - Invoice Type & Transaction Type Strategy
  - Field Mapping Strategy
  - Incremental Processing Strategy

- **Adding New Streams**: See [ADDING_NEW_STREAMS.md](./ADDING_NEW_STREAMS.md) for detailed instructions on adding sales orders, payments, and other streams.

## Quick Reference: Common DBT Commands

### Setup

**For `run_dbt.py` script (recommended):**
```bash
cd integrations/zoho_books/dbt
python3 run_dbt.py
# ✅ Automatically loads from env/.env file - no manual setup needed!
```

**For direct DBT commands (manual runs):**
```bash
cd integrations/zoho_books/dbt
export $(grep -v '^#' env | xargs)  # Load environment variables
# Then run DBT commands
```

### Run All Models

**All layers (staging + integrations + normalized):**
```bash
dbt run --select staging.* integrations.* normalized.* --profiles-dir .
```

**Specific layer:**
```bash
# Staging only
dbt run --select staging.* --profiles-dir .

# Integration metadata only
dbt run --select integrations.* --profiles-dir .

# Normalized only
dbt run --select normalized.* --profiles-dir .
```

### Run Specific Models

**Single model:**
```bash
dbt run --select normalized.invoice --profiles-dir .
dbt run --select normalized.customers --profiles-dir .
dbt run --select normalized.supplier --profiles-dir .
```

**Multiple specific models:**
```bash
dbt run --select normalized.invoice normalized.customers --profiles-dir .
```

**Models by pattern:**
```bash
# All normalized models
dbt run --select normalized.* --profiles-dir .

# All staging models
dbt run --select staging.* --profiles-dir .
```

### Incremental vs Full Refresh

**⚠️ Important**: We use `force_process_all` variable instead of `--full-refresh` to avoid dropping tables (Prisma manages table structure).

**Normal Incremental (Fast - Only Changed Records):**
```bash
# Process only records that have changed since last run
dbt run --select normalized.* --profiles-dir .
```

**Force Process All Records (After Airbyte Full Refresh):**
```bash
# Process ALL records, updating existing and inserting new
# Use this after Airbyte does a full refresh
dbt run --select normalized.* --vars '{"force_process_all": true}' --profiles-dir .
```

**Specific model with force refresh:**
```bash
dbt run --select normalized.invoice --vars '{"force_process_all": true}' --profiles-dir .
```

### Common Workflows

**After Airbyte Full Refresh:**
```bash
# 1. Run staging models
dbt run --select staging.* --profiles-dir .

# 2. Run sync_batch to update batch tracking
dbt run --select integrations.sync_batch --profiles-dir .

# 3. Force process all normalized models
dbt run --select normalized.* --vars '{"force_process_all": true}' --profiles-dir .
```

**Normal Incremental Sync:**
```bash
# Run everything incrementally (only changed records)
dbt run --select staging.* integrations.* normalized.* --profiles-dir .
```

**Test a New Model:**
```bash
# Run just the new model
dbt run --select normalized.new_model --profiles-dir .

# Or with force refresh to test all records
dbt run --select normalized.new_model --vars '{"force_process_all": true}' --profiles-dir .
```

### Testing

```bash
# Run all tests
dbt test --profiles-dir .

# Test specific model
dbt test --select normalized.invoice --profiles-dir .
```

### Compilation & Validation

```bash
# Compile models (check for syntax errors)
dbt compile --profiles-dir .

# List models
dbt list --profiles-dir .

# Show compiled SQL for a model
dbt show --select normalized.invoice --profiles-dir .
```

### Debugging

```bash
# Run with verbose output
dbt run --select normalized.invoice --profiles-dir . --debug

# Check model dependencies
dbt list --select normalized.invoice+ --profiles-dir .  # Shows downstream models
dbt list --select +normalized.invoice --profiles-dir .  # Shows upstream models
```

### Notes

- **Never use `--full-refresh`**: It will drop and recreate tables. Use `--vars '{"force_process_all": true}'` instead.
- **`run_dbt.py` auto-loads env**: The Python script automatically loads from `env`/`.env` file - no manual setup needed.
- **Manual DBT commands**: If running DBT directly (not via script), load env vars first: `export $(grep -v '^#' env | xargs)`
- **Staging models are views**: They don't need incremental logic, just run them normally.
- **Normalized models are incremental**: They use merge strategy and only process changed records by default.

## Architecture

### Data Flow
```
Airbyte (PSO-managed) → datalake.<prefix>_invoice → DBT Staging → DBT Normalized → public.invoice
```

### Schemas
- `datalake`: Raw data from Airbyte, staging views (`stg_*`), and integration metadata (`source_system`, `sync_batch`)
- `public`: Normalized business data (Fabriq transactional tables)

## Models

### Staging Layer (`datalake` schema)
- `stg_zoho_invoices`: Copy-only view of raw Airbyte data (located in `datalake` schema)

### Integration Layer (`datalake` schema)
- `source_system`: Source system catalog (managed by DBT)
- `sync_batch`: Summarizes Airbyte sync operations for audit trail

### Normalized Layer (`public` schema)
- `invoice`: Maps Zoho fields to universal invoice schema with lineage tracking

## Table Contracts

### Source: datalake.zoho_invoice (Airbyte-landed)
| Field | Type | Description | Required |
|-------|------|-------------|----------|
| id | string | Airbyte UUID | Yes |
| invoice_id | string | Zoho invoice ID | Yes |
| status | string | Invoice status | Yes |
| total | number | Invoice total | Yes |
| shipping_charge | number | Shipping cost | No |
| unprocessed_payment_amount | number | Outstanding balance | No |
| updated_time | string | ISO timestamp | Yes |
| transaction_type | string | Transaction type | No |
| type | string | Alternative type | No |
| _airbyte_ab_id | string | Airbyte batch ID | Yes |
| _airbyte_emitted_at | timestamp | Emission timestamp | Yes |

### Target: public.invoice (Normalized)
| Field | Type | Description | Source Mapping |
|-------|------|-------------|---------------|
| id | string | Generated surrogate key | dbt_utils.generate_surrogate_key |
| source_system_id | string | FK to datalake.source_system | Set via config |
| source_record_id | string | Zoho invoice_id | invoice_id |
| source_updated_at | timestamp | Zoho updated_time | updated_time |
| ingest_batch_id | string | FK to datalake.sync_batch | From sync_batch join |
| invoice_status | string | Invoice status | status |
| invoice_total | number | Invoice total | total |
| shipping_cost | number | Shipping cost | shipping_charge |
| balance_amount | number | Outstanding balance | unprocessed_payment_amount |
| invoice_type | string | Invoice type | transaction_type or type |
| modified_at | timestamp | Last modified | updated_time |
| created_at | timestamp | Created timestamp | now() |

## Setup for Empty Database

### Prerequisites Required Before Running DBT

#### 1. Database Schemas
Create schemas manually (DBT can create them, but pre-creating is safer):

```bash
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f setup_schemas.sql
```

This creates `datalake` and `public` schemas with appropriate permissions.

#### 2. Integration Metadata Table
The `public.source_system` table is managed by Prisma and must exist before running DBT (required by `sync_batch` model).

**Note:** The `source_system` table is created by Prisma migrations and populated via API from the frontend. No manual setup is needed.

#### 3. Source Data (Airbyte)
Airbyte must have landed data in `datalake.zb_invoices` (or `<prefix>_invoices`). Verify:
```bash
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM datalake.zb_invoices;"
```

#### 4. DBT Installation
Install DBT: `pip install dbt-postgres` or via Homebrew

### What DBT Creates Automatically

When you run `dbt run`, DBT creates:

- **Staging** (`datalake` schema): `stg_zoho_invoices` (view)
- **Integration** (`datalake` schema): `sync_batch` (table), `source_system` (ensures seed record exists)
- **Normalized** (`public` schema): `invoice` (table)

**Note:** The `public.invoice` table structure should exist (via Prisma migrations). If not, DBT will create it based on SELECT columns.

### Quick Setup Checklist

For a completely empty database:

```bash
# 1. Navigate to DBT directory and load environment variables
cd integrations/zoho_books/dbt/
export $(grep -v '^#' env | xargs)

# 2. Create schemas
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f setup_schemas.sql

# 3. Ensure source_system table exists (created by Prisma migrations)
# The table is managed by Prisma and populated via API - no manual setup needed

# 4. Verify Airbyte data exists
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM datalake.zb_invoices;"

# 5. Run DBT (first time: full-refresh)
./run_pipeline.sh full-refresh
```

### DBT Schema Configuration

DBT is configured to create models directly in the specified schemas using a custom `generate_schema_name` macro (see `macros/generate_schema_name.sql`). This ensures:
- Staging and integration models go directly to `datalake` schema
- Normalized models go directly to `public` schema
- No schema prefix concatenation issues

**Note:** The `post_run_setup.sql` script is kept as a safety measure but should no longer be needed.

## Runbook

### Prerequisites
1. ✅ Schemas created (`setup_schemas.sql`)
2. ✅ Source system table exists (managed by Prisma, populated via API)
3. ✅ Airbyte sync completed to `datalake.zb_invoices`
4. ✅ Environment variables configured in `env` file
5. ✅ DBT installed

### Quick Start (Using Helper Script)

**Option 1: Run all models**
```bash
cd integrations/zoho_books/dbt/
./run_pipeline.sh all
```

**Option 2: Run specific stages**
```bash
./run_pipeline.sh staging        # Staging only
./run_pipeline.sh integrations   # Integration metadata only
./run_pipeline.sh normalized     # Normalized invoices only
```

**Option 3: Full refresh (truncate and reload)**
```bash
./run_pipeline.sh full-refresh
```

### Manual Execution Steps

**1. Load environment variables:**
```bash
cd integrations/zoho_books/dbt/
export $(grep -v '^#' env | xargs)
```

**2. Run staging models:**
```bash
dbt run --select staging --profiles-dir .
```

**3. Run integration models:**
```bash
dbt run --select integrations --profiles-dir .
```

**4. Run normalized models:**

For **first run or complete reload**, use full-refresh:
```bash
dbt run --select normalized --profiles-dir . --full-refresh
```

For **incremental updates** (after first run):
```bash
dbt run --select normalized --profiles-dir .
```

**Note:** The incremental model only inserts/updates records with `source_updated_at` newer than the max in the table. If no rows are inserted, it may be because all records already exist or the incremental filter is excluding them. Use `--full-refresh` if needed.

**6. Run tests:**
```bash
dbt test --profiles-dir .
```

### Verify Data

**Check staging:**
```bash
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM datalake.stg_zoho_invoices;"
```

**Check integration metadata:**
```bash
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT * FROM datalake.source_system; SELECT * FROM datalake.sync_batch LIMIT 1;"
```

**Check normalized invoices:**
```bash
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT invoice_number, invoice_total, source_record_id FROM public.invoice LIMIT 5;"
```

### Configuration
- `source_table_prefix`: Set via `DBT_SOURCE_TABLE_PREFIX` in `env` file (current: `zb`)
- Database connection: Configured in `profiles.yml` using `env` file variables

## Assumptions & Limitations (Phase 1)
- Copy-only transforms (no calculations)
- No FK population for customer_id, location_id, etc.
- Unmapped fields remain in staging only
- Single source system (Zoho Books) per pipeline run
- Incremental logic based on source_updated_at

## Railway Deployment

This DBT project can be deployed as a cron service in Railway for automated scheduled runs.

### Railway Service Setup

1. **Create New Service**
   - In Railway dashboard, click "New Project" or add service to existing project
   - Connect your GitHub repository
   - Set the service root directory to: `integrations/zoho_books/dbt`

2. **Environment Variables**
   Set these in Railway service settings:

   | Variable | Description | Example |
   |----------|-------------|---------|
   | `DB_HOST` | PostgreSQL host | `containers-us-west-1.railway.app` |
   | `DB_PORT` | PostgreSQL port | `5432` |
   | `DB_USER` | Database username | `postgres` |
   | `DB_PASSWORD` | Database password | `your-password` |
   | `DB_NAME` | Database name | `railway` |
   | `DB_SCHEMA` | Schema (optional) | `public` |
   | `DBT_SOURCE_TABLE_PREFIX` | Source prefix (optional) | `zb_` |

3. **Configure Cron Schedule**
   - In Railway service settings, find "Cron Schedule"
   - Set your desired schedule (crontab format):
     - `0 * * * *` = Every hour
     - `0 6 * * *` = Daily at 6 AM
     - `0 */4 * * *` = Every 4 hours

4. **Deploy and Monitor**
   - Railway will automatically build and deploy
   - Service runs only when triggered (cost-effective)
   - Check logs in Railway dashboard for execution status

### Execution Behavior

- **Cost**: You only pay for compute time during execution (not idle time)
- **Logs**: All output captured in Railway logs with timestamps
- **Errors**: Service exits with non-zero code on failures
- **Stages**: Runs staging → integrations → normalized → tests
- **Stopping**: Pipeline stops on first stage failure

### Troubleshooting

**Service won't start:**
- Check environment variables are set correctly
- Verify database connectivity from Railway
- Check Railway logs for Python/dbt installation errors
- **Python 3.12 compatibility**: If you see `ModuleNotFoundError: No module named 'distutils'`, Railway is using Python 3.12. The `requirements.txt` specifies `dbt-postgres==1.8.2` which should be compatible.

**Pipeline fails:**
- Database connection issues: verify credentials
- Missing source data: ensure Airbyte has landed data
- Schema issues: verify `setup_schemas.sql` was run

**Unexpected costs:**
- Pipeline running longer than expected: check for incremental vs full-refresh
- High frequency: reduce cron schedule frequency

### Manual Testing

To test locally before deploying:

```bash
cd integrations/zoho_books/dbt/
export $(grep -v '^#' env | xargs)  # Load env vars
python run_dbt.py
```

Or test specific stages:
```bash
python run_dbt.py --stage staging  # Not yet implemented, but could be added
```

## Future Phases
- Field mapping JSON for code generation
- Multiple source systems
- FK relationship population
- Calculation logic (taxes, balances)
- Bidirectional sync support
