-- Normalized item_master model
-- Maps Zoho Books items to public.item_master
-- Includes lineage tracking fields

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key='source_record_id',
    on_schema_change='append_new_columns'
  )
}}

select
    -- Generate ID based on Zoho item_id and batch
    md5(concat(stg.zoho_item_id, '_', sb.id)) as id,

    -- Core item fields - mapped from Zoho to Prisma
    -- item_code is unique but nullable - use SKU if available, otherwise null
    -- If SKU is empty/null, leave item_code as null to avoid unique constraint violations
    case 
        when stg.sku is not null and stg.sku != '' and trim(stg.sku) != ''
        then stg.sku
        else null
    end as item_code,  -- SKU maps to item_code (unique constraint, nullable)
    coalesce(stg.name, '') as item_name,  -- Required field
    coalesce(stg.name, '') as name,  -- Optional name field
    null as item_shortname,  -- Not in Zoho items stream
    coalesce(stg.description, '') as item_description,  -- Required field
    coalesce(stg.item_type, 'goods') as item_type,  -- Default to 'goods' if not specified
    coalesce(stg.rate, 0)::double precision as unit_price,  -- Required field, default to 0
    null as uom_id,  -- UOM is stored as string in Zoho, FK lookup needed in Phase 2
    case 
        when stg.stock_on_hand is not null then 'Y'
        else 'N'
    end as stockable,  -- If stock_on_hand exists, item is stockable
    coalesce(stg.status, 'active') as item_status,  -- Map status field
    null::double precision as lead_time,  -- Not in Zoho items stream (Float type)
    null::timestamp as expiry_date,  -- Not in Zoho items stream (DateTime type)
    null as supplier_id,  -- FK lookup needed in Phase 2
    null as preferred_supplier,  -- Not in Zoho items stream
    null as search_keywords,  -- Not in Zoho items stream
    
    -- Sales Account: Map Zoho account_id to Fabriq sales_account_id (account.id)
    -- Join through stg_zoho_accounts to establish the connection, then map to account.id
    sales_account.id as sales_account_id,
    
    -- Purchase Account: Map Zoho purchase_account_id to Fabriq purchase_account_id (account.id)
    -- Join through stg_zoho_accounts to establish the connection, then map to account.id
    purchase_account.id as purchase_account_id,
    
    -- Timestamps
    case 
        when stg.created_time is not null and stg.created_time != '' 
        then stg.created_time::timestamp
        else now()
    end as created_at,
    case 
        when stg.last_modified_time is not null and stg.last_modified_time != '' 
        then stg.last_modified_time::timestamp
        else now()
    end as modified_at,
    
    -- Lineage fields
    ss.id as source_system_id,
    stg.zoho_item_id as source_record_id,
    case 
        when stg.last_modified_time is not null and stg.last_modified_time != '' 
        then stg.last_modified_time::timestamp
        else now()
    end as source_updated_at,
    sb.id as ingest_batch_id,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- Optional fields (leave null for Phase 1)
    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as product_id,
    null as item_category_id,
    null as tax_master_id,
    null as tax_rate_intra_id,
    null as currency_master_id

from {{ ref('stg_zoho_items') }} stg
-- Use DISTINCT ON to prevent duplicate batches from causing duplicate item records
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'items'
    order by id, created_at desc
    limit 1
) sb on true
-- Use DISTINCT ON to prevent duplicate source systems from causing duplicate item records
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'zoho_books'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true
-- Join with stg_zoho_accounts to establish the connection between items and sales accounts
left join {{ ref('stg_zoho_accounts') }} stg_sales_accounts
    on stg.zoho_account_id = stg_sales_accounts.zoho_account_id
-- Join with account to map Zoho account_id to Fabriq sales_account_id (account.id)
-- Match by source_record_id (Zoho's account_id) and source_system_id
-- Use ref() to ensure DBT runs account before item_master
left join {{ ref('account') }} sales_account
    on sales_account.source_record_id = stg_sales_accounts.zoho_account_id
    and sales_account.source_system_id = ss.id
    and sales_account.org_id = '{{ var("org_id") }}'
-- Join with stg_zoho_accounts to establish the connection between items and purchase accounts
left join {{ ref('stg_zoho_accounts') }} stg_purchase_accounts
    on stg.zoho_purchase_account_id = stg_purchase_accounts.zoho_account_id
-- Join with account to map Zoho purchase_account_id to Fabriq purchase_account_id (account.id)
-- Match by source_record_id (Zoho's purchase_account_id) and source_system_id
left join {{ ref('account') }} purchase_account
    on purchase_account.source_record_id = stg_purchase_accounts.zoho_account_id
    and purchase_account.source_system_id = ss.id
    and purchase_account.org_id = '{{ var("org_id") }}'

-- Only process records that have a corresponding batch
where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
-- Skip this filter if force_process_all=true (process all records)
and (
    (select max(source_updated_at) from {{ this }}) is null
    or (
        stg.last_modified_time is not null 
        and stg.last_modified_time != ''
        and stg.last_modified_time::timestamp > (select max(source_updated_at) from {{ this }})
    )
)
{% endif %}
-- If force_process_all=true, process ALL records (no filter applied)

