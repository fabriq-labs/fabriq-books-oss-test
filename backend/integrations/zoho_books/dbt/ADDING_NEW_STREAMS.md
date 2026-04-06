# Adding New Zoho Books Streams to DBT Pipeline

This guide provides step-by-step instructions for adding new streams to the Zoho Books integration pipeline.

**For design patterns and strategies**, see [ZOHO_BOOKS_STRATEGY.md](../ZOHO_BOOKS_STRATEGY.md), which covers:
- Standard join patterns
- Foreign key population patterns (customer_id, supplier_id, location_id)
- Incremental processing patterns
- Sync batch update patterns

## Prerequisites

1. **Airbyte must be configured** to sync the new stream (e.g., `credit_notes`, `estimates`)
2. **Target table exists** in `datalake` schema (e.g., `datalake.zb_credit_notes`)
3. **Target model exists** in Prisma schema (e.g., `public.credit_note`)

## Step-by-Step Process

### Step 1: Add Source Definition

Edit `models/sources/datalake.yml` to add the new source table:

```yaml
sources:
  - name: datalake
    description: "Airbyte-landed data from ERP systems"
    schema: datalake
    tables:
      # ... existing zb_invoices ...
      
      - name: "zb_sales_orders"  # Match Airbyte table name
        description: "Raw sales order data from Zoho Books via Airbyte"
        columns:
          - name: _airbyte_raw_id
            description: "Airbyte raw record ID"
          - name: salesorder_id
            description: "Zoho sales order ID"
          - name: salesorder_number
            description: "Sales order number"
          - name: status
            description: "Sales order status"
          # ... add other key columns ...
          - name: _airbyte_extracted_at
          - name: _airbyte_generation_id
          - name: _airbyte_meta
```

**Note:** Check Airbyte docs or inspect the actual table structure:
```sql
\d datalake.zb_sales_orders
```

### Step 2: Create Staging Model

Create `models/staging/stg_zoho_sales_orders.sql`:

```sql
-- Staging model for Zoho Books sales orders
-- Copy-only: select all fields from Airbyte-landed table

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

-- Simple staging: select all columns with minimal renaming
select
    -- Rename key identifiers
    _airbyte_raw_id as airbyte_raw_id,
    salesorder_id as zoho_salesorder_id,
    
    -- Include all other columns as-is
    *
    
from {{ source('datalake', 'zb_sales_orders') }}
```

**Pattern:**
- Rename `<entity>_id` to `zoho_<entity>_id` for clarity
- Select all columns with `*` to preserve unmapped fields

### Step 3: Create Normalized Model

Create `models/normalized/<model_name>.sql` following the standard pattern:

```sql
-- Normalized <model> model
-- Maps Zoho Books <stream> to public.<model>

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key='source_record_id',
    on_schema_change='append_new_columns'
  )
}}

select
    -- Generate ID
    md5(concat(stg.zoho_<entity>_id, '_', sb.id)) as id,

    -- Core fields (map Zoho to Prisma)
    stg.<zoho_field> as <prisma_field>,
    
    -- Identifiers
    stg.zoho_<entity>_id as source_record_id,
    
    -- Timestamps
    stg.updated_time::timestamp as source_updated_at,
    stg.updated_time::timestamp as modified_at,
    case 
        when stg.created_time is not null and stg.created_time != '' 
        then stg.created_time::timestamp
        else now()
    end as created_at,
    
    -- Lineage fields (REQUIRED)
    ss.id as source_system_id,
    sb.id as ingest_batch_id,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- Foreign keys - populate using join pattern
    c.id as customer_id,  -- If applicable (see FK population pattern below)
    null as location_id,  -- Phase 2: will be populated via address matching
    
    -- Other fields
    -- ... map available Zoho fields ...

from {{ ref('stg_zoho_<stream>') }} stg
-- Standard join pattern: sync_batch with DISTINCT ON
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = '<stream>'
    order by id, created_at desc
    limit 1
) sb on true
-- Standard join pattern: source_system with DISTINCT ON
left join lateral (
    select distinct on (id) *
    from datalake.source_system
    where system_type = 'zoho_books'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true
-- FK population: Join to customers table (if applicable)
left join public.customers c
    on c.source_record_id = stg.customer_id
    and c.source_system_id = ss.id

where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
and (
    (select max(source_updated_at) from {{ this }}) is null
    or stg.updated_time::timestamp > (select max(source_updated_at) from {{ this }})
)
{% endif %}
-- If force_process_all=true, process ALL records (no filter applied)
```

**Key Points:**
- ✅ Use standard join pattern with `DISTINCT ON` to prevent duplicates
- ✅ Include all required lineage fields (`source_record_id`, `source_system_id`, `ingest_batch_id`, `org_id`)
- ✅ Populate `customer_id` via join to `customers` table (see [FK Population Pattern](../ZOHO_BOOKS_STRATEGY.md#foreign-key-population-strategy))
- ✅ Use incremental filter with `force_process_all` support
- ✅ Map available Zoho fields following [Field Mapping Strategy](../ZOHO_BOOKS_STRATEGY.md#field-mapping-strategy)

### Step 4: Update sync_batch Model

Update `models/integrations/sync_batch.sql` to add the new stream. See [Sync Batch Update Pattern](../ZOHO_BOOKS_STRATEGY.md#5-sync-batch-update-pattern) for the standard template.

**Quick Steps:**
1. Add a new CTE `<stream>_batch` following the pattern
2. Add `union all select * from <stream>_batch` to the `all_batches` CTE

**Example:**
```sql
credit_notes_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_credit_notes')) as id,
        'zoho_books' as source_system_type,
        'credit_notes' as stream_name,
        -- ... rest of fields following pattern ...
    from {{ ref('stg_zoho_credit_notes') }}
    group by _airbyte_generation_id
),

all_batches as (
    select * from invoices_batch
    union all
    select * from sales_orders_batch
    union all
    select * from payments_batch
    union all
    select * from contacts_batch
    union all
    select * from bills_batch
    union all
    select * from credit_notes_batch  -- Add new stream here
)
```

### Step 5: Run the Pipeline

```bash
cd integrations/zoho_books/dbt/
export $(grep -v '^#' env | xargs)

# Run all models (includes new stream)
./run_pipeline.sh full-refresh

# Or run specific models
dbt run --select staging.sales_orders --profiles-dir .
dbt run --select normalized.sales_order --profiles-dir . --full-refresh
```

### Step 6: Verify Data

```sql
-- Check staging
SELECT COUNT(*) FROM datalake.stg_zoho_sales_orders;

-- Check normalized
SELECT COUNT(*) FROM public.sales_order;

-- Check lineage
SELECT 
    so_number, 
    source_record_id, 
    ingest_batch_id 
FROM public.sales_order 
LIMIT 5;
```

## Examples

### Example 1: Sales Transaction (Credit Notes)

For `credit_note` (Zoho Books credit notes):

1. **Source:** Add `zb_credit_notes` to `datalake.yml`
2. **Staging:** Create `stg_zoho_credit_notes.sql` (copy-only pattern)
3. **Normalized:** Create `credit_note.sql` with:
   - Join to `customers` table using `customer_id`
   - Map fields following [Field Mapping Strategy](../ZOHO_BOOKS_STRATEGY.md#field-mapping-strategy)
4. **Sync Batch:** Add `credit_notes_batch` CTE to `sync_batch.sql`

### Example 2: Payment Transaction (Already Implemented)

The `payment_receipt` model demonstrates:
- ✅ Customer FK population via join
- ✅ Field mapping patterns
- ✅ Incremental processing with `force_process_all` support

Reference `models/normalized/payment_receipt.sql` as a template.

## Checklist for New Stream

See [Checklist for New Stream](../ZOHO_BOOKS_STRATEGY.md#checklist-for-new-stream) in the strategy document for the complete checklist.

**Quick Checklist:**
- [ ] Airbyte syncs data to `datalake.zb_<stream>`
- [ ] Source definition added to `models/sources/datalake.yml`
- [ ] Staging model created (`stg_zoho_<stream>.sql`) - copy-only pattern
- [ ] Normalized model created with:
  - [ ] Standard join pattern (sync_batch, source_system with DISTINCT ON)
  - [ ] Required fields (source_record_id, source_system_id, ingest_batch_id, org_id)
  - [ ] Incremental filter with `force_process_all` support
  - [ ] FK joins (customer_id, supplier_id as applicable)
- [ ] Sync batch updated to include new stream CTE
- [ ] Pipeline runs successfully
- [ ] Data verified in both staging and normalized tables
- [ ] Lineage tracking verified (check `ingest_batch_id` is populated)

## Common Issues

1. **Schema mismatch:** Verify Zoho field names match what's in Airbyte table
   - Use `\d datalake.zb_<stream>` to inspect table structure
2. **Data types:** Cast timestamps and numbers appropriately
   - Use `::timestamp` for dates, `::double precision` for amounts
3. **Incremental logic:** Ensure timestamp field exists in source
   - Use `updated_time` for invoices, `last_modified_time` for bills
4. **Batch tracking:** Verify `_airbyte_generation_id` matches across all streams in same sync
5. **Duplicate records:** Always use `DISTINCT ON` in lateral joins to prevent duplicates
   - See [Standard Join Pattern](../ZOHO_BOOKS_STRATEGY.md#1-required-joins-pattern)
6. **FK not populating:** Verify join conditions match
   - `c.source_record_id = stg.customer_id` AND `c.source_system_id = ss.id`
   - Ensure `customers` table has been populated first

## Reference Documentation

- **Strategy & Patterns**: [ZOHO_BOOKS_STRATEGY.md](../ZOHO_BOOKS_STRATEGY.md)
  - Foreign Key Population Strategy
  - Field Mapping Strategy
  - Incremental Processing Strategy
  - Adding New Streams Pattern
- **DBT Project**: [README.md](./README.md)
- **Architecture**: [../../ARCHITECTURE.md](../../ARCHITECTURE.md)

