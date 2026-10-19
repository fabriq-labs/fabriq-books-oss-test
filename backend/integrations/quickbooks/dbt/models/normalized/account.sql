-- Normalized account for QuickBooks Online → public.account (books Chart of Accounts)

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
    stg.account_name as name,
    null as code,
    null as account_number,
    ARRAY[stg.account_type]::text[] as account_types,
    stg.account_sub_type as sub_type,
    case
        when stg.classification = 'Asset' then 'Assets'::account_classification
        when stg.classification = 'Liability' then 'Liabilities'::account_classification
        when stg.classification = 'Revenue' then 'Income'::account_classification
        when stg.classification = 'Expense' then 'Expense'::account_classification
        when stg.classification = 'Equity' then 'Equity'::account_classification
        else null
    end as classification,
    stg.current_balance::numeric(19, 4) as balance,
    case when coalesce(stg.active, true) then true else false end as is_active,
    -- QBO parent ids are source ids, not Prisma account.id; resolve in a later pass.
    null as parent_account_id,

    {{ parse_qbo_date('stg.create_time') }} as created_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,

    '{{ var("org_id") }}' as org_id,
    ss.id as source_system_id,
    stg.account_id::text as source_record_id,
    sb.id as ingest_batch_id,

    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as frequency,
    null::timestamp as last_sync_at,
    null as import_id,
    null as entity_id,
    null as currency_id

from {{ ref('stg_qbo_accounts') }} stg
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'accounts'
    order by id, created_at desc
    limit 1
) sb on true
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
      and org_id = '{{ var("org_id") }}'
    order by id, created_at desc
    limit 1
) ss on true

where sb.id is not null
  and coalesce(stg.active, true) = true

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
