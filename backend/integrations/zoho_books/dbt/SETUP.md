# Zoho Books DBT Setup Guide

## Quick Start

This guide will help you set up and run the DBT pipeline for Zoho Books integration.

## Prerequisites

- Python 3.9+ installed
- PostgreSQL database with `datalake` and `public` schemas
- DBT installed (`pip install dbt-postgres==1.8.2`)
- Airbyte has synced data to `datalake.zb_*` tables

## Step 1: Configure Database Credentials

### Option A: Using `env` file (Recommended for Local Development)

1. **Navigate to the DBT directory:**
   ```bash
   cd integrations/zoho_books/dbt
   ```

2. **Create `env` file from example:**
   ```bash
   cp env.example env
   ```

3. **Edit `env` file with your database credentials:**
   ```bash
   # Open in your editor
   nano env
   # or
   code env
   ```

4. **Fill in your database values:**
   ```bash
   # Database Connection
   DB_HOST=your_database_host          # e.g., localhost or containers-us-west-1.railway.app
   DB_PORT=5432                        # PostgreSQL port
   DB_USER=your_database_user          # e.g., postgres
   DB_PASSWORD=your_database_password  # Your database password
   DB_NAME=your_database_name          # e.g., fabriq_db or railway
   DB_SCHEMA=public                    # Default schema (usually 'public')

   # DBT Variables
   DBT_SOURCE_TABLE_PREFIX=zb_         # Prefix for Zoho Books tables (default: zb_)
   ```

### Option B: Using Environment Variables (For Production/Railway)

Set these environment variables directly (they take precedence over `env` file):

```bash
export DB_HOST=your_database_host
export DB_PORT=5432
export DB_USER=your_database_user
export DB_PASSWORD=your_database_password
export DB_NAME=your_database_name
export DB_SCHEMA=public
export DBT_SOURCE_TABLE_PREFIX=zb_
```

**Note:** The `run_dbt.py` script automatically loads from `env` or `.env` file if it exists, but environment variables take precedence (useful for Railway/production).

## Step 2: Verify Database Connection

Test your database connection:

```bash
cd integrations/zoho_books/dbt

# Load environment variables
export $(grep -v '^#' env | xargs)

# Test DBT connection
dbt debug --profiles-dir .
```

You should see:
```
✅ Connection test: [OK connection ok]
✅ Profile: [OK found]
✅ Dependencies: [OK found]
```

## Step 3: Set Up Database Schemas (First Time Only)

If this is your first time running DBT on an empty database:

### 3.1 Create Schemas

```bash
# Load environment variables
export $(grep -v '^#' env | xargs)

# Create datalake and public schemas
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -f setup_schemas.sql
```

### 3.2 Integration Metadata Table

The `public.source_system` table is managed by Prisma and must exist before running DBT.

**Note:** The `source_system` table is created by Prisma migrations and populated via API from the frontend. No manual SQL setup is needed.

### 3.3 Verify Airbyte Data Exists

```bash
# Check that Airbyte has landed data
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM datalake.zb_invoices;"
```

You should see a count > 0. If not, run Airbyte sync first.

## Step 4: Run DBT Pipeline

### Option A: Using `run_dbt.py` Script (Recommended)

The Python script automatically loads environment variables from `env` file:

```bash
cd integrations/zoho_books/dbt
python3 run_dbt.py
```

This will:
- Automatically load environment from `env` or `.env` file
- Run all stages: staging → integrations → normalized
- Use incremental processing (only changed records)

### Option B: Using `run_pipeline.sh` Script

```bash
cd integrations/zoho_books/dbt

# Make script executable (first time only)
chmod +x run_pipeline.sh

# Run all models
./run_pipeline.sh all

# Or run specific stages
./run_pipeline.sh staging        # Staging only
./run_pipeline.sh integrations   # Integration metadata only
./run_pipeline.sh normalized      # Normalized models only

# Full refresh (after Airbyte full refresh)
./run_pipeline.sh full-refresh
```

### Option C: Using DBT Commands Directly

```bash
cd integrations/zoho_books/dbt

# Load environment variables first
export $(grep -v '^#' env | xargs)

# Run all models
dbt run --select staging integrations normalized --profiles-dir .

# Or run specific stages
dbt run --select staging.* --profiles-dir .
dbt run --select integrations.* --profiles-dir .
dbt run --select normalized.* --profiles-dir .

# Force process all records (after Airbyte full refresh)
dbt run --select normalized.* --vars '{"force_process_all": true}' --profiles-dir .
```

## Step 5: Verify Results

Check that data was transformed correctly:

```bash
# Load environment variables
export $(grep -v '^#' env | xargs)

# Check staging view
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM datalake.stg_zoho_invoices;"

# Check integration metadata
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT * FROM datalake.source_system;"

# Check normalized invoices
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT invoice_number, invoice_total, source_record_id FROM public.invoice LIMIT 5;"
```

## Common Workflows

### After Airbyte Full Refresh

When Airbyte does a full refresh, you need to force DBT to process all records:

```bash
cd integrations/zoho_books/dbt

# Option 1: Using run_dbt.py
FORCE_PROCESS_ALL=true python3 run_dbt.py

# Option 2: Using run_pipeline.sh
./run_pipeline.sh full-refresh

# Option 3: Using DBT directly
export $(grep -v '^#' env | xargs)
dbt run --select normalized.* --vars '{"force_process_all": true}' --profiles-dir .
```

### Normal Incremental Sync

For regular incremental updates (only changed records):

```bash
cd integrations/zoho_books/dbt
python3 run_dbt.py
```

### Run Specific Model

```bash
cd integrations/zoho_books/dbt
export $(grep -v '^#' env | xargs)

# Run single model
dbt run --select normalized.invoice --profiles-dir .
dbt run --select normalized.customers --profiles-dir .
```

## Troubleshooting

### Error: "env file not found"

**Solution:** Create `env` file from example:
```bash
cd integrations/zoho_books/dbt
cp env.example env
# Then edit env with your credentials
```

### Error: "relation does not exist"

**Possible causes:**
1. **Schemas not created:** Run `setup_schemas.sql`
2. **Source system table missing:** Ensure Prisma migrations have run and ERP connection is configured via API
3. **Airbyte data not synced:** Check `datalake.zb_invoices` exists

**Solution:**
```bash
# Run schema setup (if needed)
export $(grep -v '^#' env | xargs)
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f setup_schemas.sql

# Note: source_system table is managed by Prisma, populated via API
```

### Error: "Connection refused" or "Authentication failed"

**Solution:** Verify database credentials in `env` file:
- Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Test connection manually:
  ```bash
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;"
  ```

### No records inserted in normalized tables

**Possible causes:**
1. **Incremental filter too strict:** All records already processed
2. **Airbyte data not synced:** Check `datalake.zb_invoices` has data

**Solution:**
```bash
# Force process all records
FORCE_PROCESS_ALL=true python3 run_dbt.py
```

### Models created in wrong schema

**Solution:** This should not happen with the `generate_schema_name` macro. If it does:
1. Check `macros/generate_schema_name.sql` exists
2. Verify `dbt_project.yml` uses `+custom_schema` not `+schema`
3. Run `dbt debug --profiles-dir .` to verify configuration

## Configuration Files Summary

| File | Purpose | Location |
|------|---------|----------|
| `env` | Database credentials (create from `env.example`) | `integrations/zoho_books/dbt/env` |
| `profiles.yml` | DBT profile configuration (reads from env vars) | `integrations/zoho_books/dbt/profiles.yml` |
| `dbt_project.yml` | DBT project configuration | `integrations/zoho_books/dbt/dbt_project.yml` |
| `setup_schemas.sql` | Creates `datalake` and `public` schemas | `integrations/zoho_books/dbt/setup_schemas.sql` |
| `setup_datalake_tables.sql` | Legacy script (source_system now managed by Prisma) | `integrations/zoho_books/dbt/setup_datalake_tables.sql` |

## Next Steps

- See [README.md](./README.md) for detailed DBT commands and architecture
- See [ADDING_NEW_STREAMS.md](./ADDING_NEW_STREAMS.md) for adding new data streams
- See [../ZOHO_BOOKS_STRATEGY.md](../ZOHO_BOOKS_STRATEGY.md) for design decisions

