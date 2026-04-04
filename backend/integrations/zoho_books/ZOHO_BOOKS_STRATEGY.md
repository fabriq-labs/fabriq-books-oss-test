# Zoho Books Integration Strategy & Design Decisions

This document consolidates all key architectural decisions, strategies, and design patterns for the Zoho Books integration.

## Table of Contents

1. [Foreign Key Population Strategy](#foreign-key-population-strategy)
2. [Invoice vs Bill Design Decision](#invoice-vs-bill-design-decision)
3. [Invoice Type & Transaction Type Strategy](#invoice-type--transaction-type-strategy)
4. [Field Mapping Strategy](#field-mapping-strategy)
5. [Incremental Processing Strategy](#incremental-processing-strategy)

---

## Foreign Key Population Strategy

### Problem Statement

Zoho Books provides **Zoho's internal IDs** (e.g., `customer_id = "2280971000001225005"`), but Fabriq needs **Fabriq's internal IDs** (e.g., `customer_id = "cust_abc123"`). These are completely different IDs from different systems.

### Why Mapping is Needed

Even though normalized models have `source_system_id` and `source_record_id` for lineage tracking, **foreign key constraints** require Fabriq IDs:

- `invoice.customer_id` has FK constraint: `@relation(fields: [customer_id], references: [id])`
- Database will reject any value that doesn't exist in `public.customers.id`
- Cannot store Zoho's ID directly in `customer_id` - must be a Fabriq ID

### Solution: Mapping Table (Phase 2)

**Recommended Approach**: Create `datalake.source_record_mapping` table to map Zoho IDs to Fabriq IDs.

```sql
CREATE TABLE datalake.source_record_mapping (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system_id VARCHAR(50) NOT NULL REFERENCES datalake.source_system(id),
    source_record_type VARCHAR(50) NOT NULL, -- 'customer', 'account', 'location', etc.
    source_record_id VARCHAR(255) NOT NULL,  -- Zoho's ID
    fabriq_record_id VARCHAR(50) NOT NULL,   -- Fabriq's ID
    source_record_name VARCHAR(255),         -- For reference
    created_at TIMESTAMP DEFAULT NOW(),
    modified_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_system_id, source_record_type, source_record_id)
);
```

### Implementation Pattern (Hybrid Approach)

Use mapping table with fallback to name-based lookup:

```sql
-- In normalized models
coalesce(
    cm.customer_id,  -- From mapping table
    (
        select id 
        from public.customers 
        where customer_name = stg.customer_name
        limit 1
    )
) as customer_id
```

### Current Status (Phase 1)

- ✅ FKs are left as `null` (by design)
- ✅ `customer_id` populated via join to `customers` table using `source_record_id`
- 🔄 Full mapping infrastructure planned for Phase 2

---

## Invoice vs Bill Design Decision

### Decision: Single Universal Invoice Model

**Rationale**: Use a single `invoice` model with `invoice_type` field to differentiate between sales invoices and purchase bills.

### Zoho Books Structure

- **`zb_invoices`**: Sales invoices (money coming in from customers)
- **`zb_bills`**: Purchase invoices/bills (money going out to suppliers/vendors)

### Fabriq Model

- **Single `invoice` table** with `invoice_type` field:
  - `invoice_type = 'SALES'` → Sales invoices (from customers)
  - `invoice_type = 'PURCHASE'` → Purchase invoices/bills (from suppliers)

### Key Benefits

1. **Unified Query Interface**: Single table for all invoices, simpler reporting
2. **Code Reusability**: Same DBT model, application code, and UI components
3. **Simpler Data Model**: One model to maintain, one set of indexes
4. **Flexible Field Usage**: Conditional population based on type
5. **Matches Application Architecture**: Application already uses `invoice_type` pattern

### Implementation

- Map `zb_invoices` → `invoice` with `invoice_type = 'SALES'`
- Map `zb_bills` → `invoice` with `invoice_type = 'PURCHASE'`
- Use `UNION ALL` in DBT model to combine both sources
- Conditionally populate fields: `customer_id` for SALES, `supplier_name` for PURCHASE

---

## Invoice Type & Transaction Type Strategy

### Problem

- **`invoice_type`** should store **'SALES'** or **'PURCHASE'** (business classification)
- Zoho's `transaction_type` contains values like "renewal", "invoice", "credit_note" (transaction classification)
- These are **different concepts** and should be stored separately

### Solution: Separate Fields

1. **`invoice_type`** → Store 'SALES' or 'PURCHASE'
   - Determined by source: `zb_invoices` = 'SALES', `zb_bills` = 'PURCHASE'
   - Used for business logic differentiation

2. **`transaction_type`** → Store Zoho's original transaction type
   - Values: "renewal", "invoice", "credit_note", etc. (for sales invoices)
   - `NULL` for purchase bills (bills don't have transaction types in Zoho)
   - Preserves source system metadata

### Field Mapping

| Source | Zoho Field | Fabriq Field | Values | Purpose |
|--------|-----------|--------------|--------|---------|
| `zb_invoices` | `transaction_type` or `type` | `transaction_type` | "renewal", "invoice", etc. | Transaction classification |
| `zb_invoices` | Source table | `invoice_type` | 'SALES' | Business classification |
| `zb_bills` | N/A | `transaction_type` | `NULL` | Bills don't have transaction types |
| `zb_bills` | Source table | `invoice_type` | 'PURCHASE' | Business classification |

### Implementation

```sql
-- For sales invoices
'SALES' as invoice_type,  -- Business classification
coalesce(stg.transaction_type, stg.type) as transaction_type,  -- Zoho's transaction type

-- For purchase bills
'PURCHASE' as invoice_type,  -- Business classification
null as transaction_type,  -- Bills don't have transaction types in Zoho
```

---

## Field Mapping Strategy

### Goal: Ensure Good Fill Rates

Target fill rates:
- **Core Business Fields**: 90%+ (invoice_number, invoice_date, invoice_total, customer_id)
- **Important Supporting Fields**: 70%+ (addresses, dates, references, status)
- **Optional Fields**: 50%+ (comments, metadata, custom fields)

### Field Mapping Categories

#### Category A: Direct Mappings (Highest Priority)
Fields that map directly with minimal transformation:
- `date` → `invoice_date` (timestamp conversion)
- `total` → `invoice_total` (direct)
- `status` → `invoice_status` (direct)
- `reference_number` → `po_number` (if not empty)

**Pattern:**
```sql
stg.date::timestamp as invoice_date,
stg.total as invoice_total,
```

#### Category B: JSONB Extractions (High Priority)
Fields extracted from JSONB objects:
- `billing_address->>'address'` → `bill_to`
- `shipping_address->>'address'` → `deliver_to`
- `custom_fields` → Various (needs inspection)

**Pattern:**
```sql
case 
    when stg.billing_address is not null 
         and stg.billing_address->>'address' is not null 
         and trim(stg.billing_address->>'address') != ''
    then trim(stg.billing_address->>'address')
    else null
end as bill_to,
```

#### Category C: Calculated Fields (Medium Priority)
Fields derived from other fields:
- `invoice_net_total` = `total - adjustment - write_off_amount` (for sales)
- `invoice_net_total` = `total - tds_total` (for bills)
- `shipping_handling_misc_total` = `shipping_charge` (for sales)

**Pattern:**
```sql
case 
    when stg.total is not null 
    then stg.total - coalesce(stg.adjustment, 0) - coalesce(stg.write_off_amount, 0)
    else null
end::double precision as invoice_net_total,
```

#### Category D: Default Values (Low Priority)
Fields that don't exist in source but can use defaults:
- `invoice_version` = `1` (default)

**Pattern:**
```sql
1::integer as invoice_version,  -- Default to version 1
```

### Best Practices

1. **Always Check for Empty Strings**: Use `trim()` and check for empty strings, not just NULL
2. **Use CASE Statements**: Handle null/empty values gracefully
3. **Document Decisions**: Add comments explaining why fields are mapped or left null
4. **Validate Data Types**: Ensure proper type conversions (timestamp, numeric, etc.)
5. **Monitor Fill Rates**: Track fill rates over time to catch data quality issues

### Fill Rate Monitoring Query

```sql
SELECT 
    column_name,
    COUNT(*) as total,
    COUNT(column_name) FILTER (
        WHERE column_name IS NOT NULL 
        AND (column_name::text != '' OR column_name IS NOT NULL)
    ) as populated,
    ROUND(100.0 * COUNT(column_name) FILTER (
        WHERE column_name IS NOT NULL 
        AND (column_name::text != '' OR column_name IS NOT NULL)
    ) / COUNT(*), 1) as fill_rate_pct
FROM public.invoice
WHERE source_system_id IS NOT NULL
GROUP BY column_name
ORDER BY fill_rate_pct;
```

---

## Incremental Processing Strategy

### Problem

- DBT `--full-refresh` with `incremental_strategy='merge'` will **DROP and RECREATE** the table
- Prisma manages table structure, so DBT should not drop tables
- Need to update ALL fields for ALL records after Airbyte full refresh, but preserve non-Zoho records

### Solution: Variable-Controlled Incremental Filter

Use DBT variable `force_process_all` to control whether to process all records or only changed ones.

### Implementation

**In `dbt_project.yml`:**
```yaml
vars:
  force_process_all: false  # Set to true to process all records
```

**In normalized models:**
```sql
{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
and (
    (select max(source_updated_at) from {{ this }}) is null
    or stg.updated_time::timestamp > (select max(source_updated_at) from {{ this }})
)
{% endif %}
-- If force_process_all=true, process ALL records (no filter applied)
```

### Usage

**Normal Incremental (Fast - Only Changed Records):**
```bash
dbt run --select normalized.* --profiles-dir .
```

**Force Process All (After Airbyte Full Refresh):**
```bash
dbt run --select normalized.* --vars '{"force_process_all": true}' --profiles-dir .
```

### How It Works

- **Normal mode**: Only processes records where `updated_time > max(source_updated_at)` (fast)
- **Force mode**: Processes ALL records, merge strategy updates existing and inserts new (slower but complete)
- **No table dropping**: Merge strategy preserves table structure (Prisma manages it)
- **Non-Zoho records preserved**: Records without matching `source_record_id` remain untouched

---

## Adding New Streams Pattern

### Overview

When adding a new Zoho Books stream (e.g., credit notes, estimates, etc.), follow this standardized pattern to ensure consistency and maintainability.

### Standard Pattern for Normalized Models

#### 1. Required Joins Pattern

All normalized models follow this join pattern:

```sql
from {{ ref('stg_zoho_<stream>') }} stg
-- Join to sync_batch (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = '<stream_name>'
    order by id, created_at desc
    limit 1
) sb on true
-- Join to source_system (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from datalake.source_system
    where system_type = 'zoho_books'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true
```

**Why DISTINCT ON?** Prevents duplicate records when multiple batch records or source system records exist.

#### 2. Foreign Key Population Pattern

**Customer ID (Implemented):**
```sql
-- Join to customers table using Zoho's customer_id
left join public.customers c
    on c.source_record_id = stg.customer_id
    and c.source_system_id = ss.id

-- Use in SELECT
c.id as customer_id,  -- Populated via join
```

**Supplier ID (For Bills/Purchase Invoices):**
```sql
-- Join to supplier table using Zoho's vendor_id
left join public.supplier s
    on s.source_record_id = stg.vendor_id
    and s.source_system_id = ss.id

-- Use in SELECT
s.id as supplier_id,  -- Populated via join
```

**Location ID (Planned for Phase 2):**
```sql
-- Option 1: If Zoho provides location_id directly
left join public.location l
    on l.source_record_id = stg.location_id
    and l.source_system_id = ss.id

-- Option 2: If matching by address (more complex)
left join public.location l
    on l.address_line1 = stg.shipping_address->>'address'
    and l.source_system_id = ss.id

-- Use in SELECT
l.id as location_id,  -- Populated via join or address matching
```

**Key Principle**: Always join using `source_record_id` (Zoho's ID) + `source_system_id` to ensure correct matching across source systems.

#### 3. Required Fields Pattern

Every normalized model must include:

```sql
select
    -- ID generation
    md5(concat(stg.zoho_<entity>_id, '_', sb.id)) as id,
    
    -- Source identifiers
    stg.zoho_<entity>_id as source_record_id,
    
    -- Timestamps
    stg.updated_time::timestamp as source_updated_at,
    stg.updated_time::timestamp as modified_at,
    stg.created_time::timestamp as created_at,
    
    -- Lineage fields (REQUIRED)
    ss.id as source_system_id,
    sb.id as ingest_batch_id,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- ... other fields ...
```

#### 4. Incremental Filter Pattern

All normalized models use this incremental filter:

```sql
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

**Note**: Use `last_modified_time` for bills instead of `updated_time` if that's what Zoho provides.

#### 5. Sync Batch Update Pattern

When adding a new stream, update `sync_batch.sql`:

```sql
-- Add new CTE for the stream
<stream>_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_<stream>')) as id,
        'zoho_books' as source_system_type,
        '<stream>' as stream_name,
        'datalake' as namespace,
        'zb_<stream>' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_zoho_<stream>') }}
    group by _airbyte_generation_id
),

-- Add to all_batches union
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
    select * from <stream>_batch  -- Add new stream here
)
```

### Checklist for New Stream

- [ ] Airbyte syncs data to `datalake.zb_<stream>`
- [ ] Source definition added to `models/sources/datalake.yml`
- [ ] Staging model created (`stg_zoho_<stream>.sql`) - copy-only pattern
- [ ] Normalized model created with:
  - [ ] Required joins (sync_batch, source_system with DISTINCT ON)
  - [ ] Required fields (source_record_id, source_system_id, ingest_batch_id, org_id)
  - [ ] Incremental filter with `force_process_all` support
  - [ ] FK joins (customer_id, supplier_id, location_id as applicable)
- [ ] Sync batch updated to include new stream CTE
- [ ] Pipeline runs successfully
- [ ] Data verified in both staging and normalized tables
- [ ] Lineage tracking verified (check `ingest_batch_id` is populated)

### Common Patterns by Stream Type

**Sales Transactions** (invoices, sales orders, estimates):
- Join to `customers` table using `customer_id`
- Set `invoice_type = 'SALES'` if applicable

**Purchase Transactions** (bills, purchase orders):
- Join to `supplier` table using `vendor_id`
- Set `invoice_type = 'PURCHASE'` if applicable

**Payment Transactions**:
- Join to `customers` table using `customer_id`
- May join to `invoice` table using `invoice_id` (if available)

**Master Data** (customers, suppliers):
- No FK joins needed (these are the source of truth)
- Filter by `contact_type` if needed (customers vs vendors)

---

## Summary

### Key Design Decisions

1. ✅ **Single Universal Invoice Model**: Use `invoice_type` to differentiate SALES vs PURCHASE
2. ✅ **Separate Fields**: `invoice_type` (business) vs `transaction_type` (transaction classification)
3. ✅ **FK Population**: Use join to `customers`/`supplier` tables via `source_record_id` (Phase 1), mapping table (Phase 2)
4. ✅ **Field Mapping**: Systematic approach with categories (direct, JSONB, calculated, defaults)
5. ✅ **Incremental Processing**: Variable-controlled filter for flexible full refresh without dropping tables
6. ✅ **Standardized Patterns**: Consistent join patterns, FK population, and incremental logic across all models

### Current Implementation Status

- ✅ All strategies implemented and tested
- ✅ Invoice model handles both sales invoices and purchase bills
- ✅ Field mappings optimized for good fill rates
- ✅ Incremental processing with force refresh capability
- ✅ Customer and supplier FK population via joins (Phase 1)
- 🔄 Location FK population planned for Phase 2
- 🔄 FK mapping infrastructure planned for Phase 2

