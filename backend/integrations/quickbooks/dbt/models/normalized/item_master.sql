-- Normalized item_master model for QuickBooks Online
-- Maps QuickBooks items to public.item_master

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key=['source_record_id', 'source_system_id', 'org_id'],
    on_schema_change='ignore',
    full_refresh=false
  )
}}

select
    -- Core item fields - mapped from QuickBooks to Prisma.
    -- Prisma generates id on insert; merge matches lineage keys.
    -- Do not select item_code: QBO has no item code, and Airbyte qb_items has no Sku.
    -- Prisma item_code is optional (String?); leave it unset on insert.
    coalesce(stg.name, '') as item_name,  -- Required field
    coalesce(stg.name, '') as name,  -- Optional name field
    null as item_shortname,  -- Not in QuickBooks items stream
    coalesce(stg.description, coalesce(stg.name, '')) as item_description,  -- Required field
    coalesce(stg.item_type, 'Service') as item_type,  -- Service, Inventory, NonInventory - default to 'Service'
    coalesce(stg.unit_price, 0)::double precision as unit_price,  -- Required field, default to 0
    case 
        when stg.item_type = 'Inventory' and coalesce(stg.track_qty_on_hand, false) then 'Y'
        else 'N'
    end as stockable,  -- Use 'Y'/'N' to match Zoho Books format
    case 
        when coalesce(stg.active, true) then 'active'
        else 'inactive'
    end as item_status,  -- Use lowercase to match Zoho Books format
    
    -- Account references (will need FK population in Phase 2)
    null as sales_account_id,  -- stg.income_account_id
    null as purchase_account_id,  -- stg.expense_account_id
    
    -- Timestamps
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- Lineage fields
    ss.id as source_system_id,
    stg.item_id as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id,
    
    -- Optional fields (leave null for Phase 1)
    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as supplier_id,
    null as preferred_supplier,
    null as uom_id,
    null::double precision as lead_time,  -- Float type
    null::timestamp as expiry_date,  -- DateTime type
    null as search_keywords,
    null as product_id,
    null as item_category_id,
    null as tax_master_id,
    null as tax_rate_intra_id

from {{ ref('stg_qbo_items') }} stg
-- Join to sync_batch (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'items'
    order by id, created_at desc
    limit 1
) sb on true
-- Join to source_system (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true

-- Only process records that have a corresponding batch and are active
where sb.id is not null
  and coalesce(stg.active, true) = true

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}

