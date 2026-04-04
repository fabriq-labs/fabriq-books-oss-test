-- Normalized account model
-- Maps Zoho Books chart of accounts to public.account
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
    -- Generate ID based on Zoho account_id and batch
    md5(concat(stg.zoho_account_id, '_', sb.id)) as id,

    -- Core account fields - mapped from Zoho to Prisma
    coalesce(stg.account_code, '') as code,  -- Account code (nullable in Prisma)
    -- account_number is optional in Prisma (Int type)
    -- Try to extract from account_code, or use a hash of account_id as fallback
    case 
        when stg.account_code ~ '^[0-9]+$' and (stg.account_code)::integer between 1 and 2147483647 then (stg.account_code)::integer
        else abs(hashtext(coalesce(stg.zoho_account_id, '')))::integer % 2147483647  -- Use hash as fallback (hashtext is built-in PostgreSQL function)
    end as account_number,
    coalesce(stg.account_name, '') as name,  -- Account name (nullable in Prisma)
    -- type is String[] (array) in Prisma - convert account_type to array
    case 
        when stg.account_type is not null and stg.account_type != ''
        then array[stg.account_type]
        else null
    end as type,
    null as legal_entity_id,  -- FK lookup needed in Phase 2
    case 
        when stg.is_active = true then 'active'
        else 'inactive'
    end as status,  -- Map is_active to status
    -- Map account_type to classification enum if possible
    -- account_classification enum: Assets, Liabilities, Income, Expense, Equity
    case 
        when lower(stg.account_type) like '%asset%' then 'Assets'::account_classification
        when lower(stg.account_type) like '%liability%' then 'Liabilities'::account_classification
        when lower(stg.account_type) like '%income%' or lower(stg.account_type) like '%revenue%' then 'Income'::account_classification
        when lower(stg.account_type) like '%expense%' or lower(stg.account_type) like '%cost%' then 'Expense'::account_classification
        when lower(stg.account_type) like '%equity%' then 'Equity'::account_classification
        else null
    end as classification,
    -- Map parent_account_id if available (will need FK lookup in Phase 2)
    null as parent_account_id,  -- TODO: Map from stg.parent_account_id via account lookup
    
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
    stg.zoho_account_id as source_record_id,
    case 
        when stg.last_modified_time is not null and stg.last_modified_time != '' 
        then stg.last_modified_time::timestamp
        else now()
    end as source_updated_at,
    sb.id as ingest_batch_id,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- Required fields (leave defaults for Phase 1)
    'system' as created_by,  -- Required field, use 'system' for synced records
    null::text as modified_by,
    null::text as assigned_to,
    null::text as sub_type,
    null::text as frequency,
    null::numeric(19, 4) as balance,
    null::text as currency,
    true as is_active,  -- Default to active
    null::timestamp as last_sync_at,
    null::text as inst_id,
    null::text as import_id

from {{ ref('stg_zoho_accounts') }} stg
-- Use DISTINCT ON to prevent duplicate batches from causing duplicate account records
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'accounts'
    order by id, created_at desc
    limit 1
) sb on true
-- Use DISTINCT ON to prevent duplicate source systems from causing duplicate account records
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'zoho_books'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true

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
