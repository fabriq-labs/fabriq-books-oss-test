-- Normalized tax_master from QuickBooks TaxRates → public.tax_master
-- rate is Decimal percent (QBO RateValue, e.g. 8.25)
-- depends_on: {{ ref('stg_qbo_tax_agencies') }}

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
    coalesce(nullif(trim(stg.tax_rate_name), ''), 'QBO Tax Rate') as name,
    ('qbo_rate_' || stg.tax_rate_id::text) as code,
    coalesce(stg.rate_value::numeric(9, 6), 0) as rate,
    coalesce({{ parse_qbo_date('stg.create_time') }}, now()) as effective_from,
    null::timestamp as effective_to,
    'sales_tax' as component_type,
    true as is_recoverable,
    coalesce(stg.active, true) as is_active,
    null as liability_account_id,

    '{{ var("org_id") }}' as org_id,
    ss.id as source_system_id,
    stg.tax_rate_id::text as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id,

    null as created_by,
    coalesce({{ parse_qbo_date('stg.create_time') }}, now()) as created_at,
    null as modified_by,
    coalesce({{ parse_qbo_date('stg.last_updated_time') }}, now()) as modified_at

from {{ ref('stg_qbo_tax_rates') }} stg
left join {{ ref('stg_qbo_tax_agencies') }} ag
    on ag.agency_id = stg.agency_id
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'tax_rates'
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
  and stg.tax_rate_id is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
