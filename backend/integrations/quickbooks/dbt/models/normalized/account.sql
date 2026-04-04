-- Normalized account model for QuickBooks Online
-- Maps QuickBooks accounts to public.account (Chart of Accounts)

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
    md5(concat(stg.account_id, '_', sb.id)) as id,

    -- Core account fields
    stg.account_name as name,
    ARRAY[stg.account_type]::text[] as type,  -- Convert to text array as required by Prisma schema
    stg.account_sub_type as sub_type,
    -- Map QuickBooks classification to enum (QBO: Asset/Liability/Revenue/Expense/Equity -> Enum: Assets/Liabilities/Income/Expense/Equity)
    case 
        when stg.classification = 'Asset' then 'Assets'::account_classification
        when stg.classification = 'Liability' then 'Liabilities'::account_classification
        when stg.classification = 'Revenue' then 'Income'::account_classification
        when stg.classification = 'Expense' then 'Expense'::account_classification
        when stg.classification = 'Equity' then 'Equity'::account_classification
        else null
    end as classification,
    stg.current_balance::numeric as balance,
    stg.currency_code as currency,
    case when coalesce(stg.active, true) then true else false end as is_active,
    stg.parent_account_id as parent_account_id,
    
    -- Timestamps
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- Lineage fields
    ss.id as source_system_id,
    stg.account_id as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id,
    
    -- Optional fields (leave null for Phase 1)
    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as code,
    null as frequency,
    null::timestamp as last_sync_at,
    null as inst_id,
    null as import_id

from {{ ref('stg_qbo_accounts') }} stg
-- Join to sync_batch (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'accounts'
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

