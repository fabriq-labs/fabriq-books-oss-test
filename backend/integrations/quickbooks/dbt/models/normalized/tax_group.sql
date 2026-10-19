-- Normalized tax_group from QuickBooks TaxCodes → public.tax_group
-- depends_on: {{ ref('tax_master') }}

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
    coalesce(nullif(trim(stg.tax_code_name), ''), 'QBO Tax Code') as name,
    ('qbo_code_' || stg.tax_code_id::text) as code,
    'US' as country_code,
    coalesce(stg.active, true) as is_active,

    '{{ var("org_id") }}' as org_id,
    ss.id as source_system_id,
    stg.tax_code_id::text as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id,

    null as created_by,
    coalesce({{ parse_qbo_date('stg.create_time') }}, now()) as created_at,
    null as modified_by,
    coalesce({{ parse_qbo_date('stg.last_updated_time') }}, now()) as modified_at

from {{ ref('stg_qbo_tax_codes') }} stg
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'tax_codes'
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
  and stg.tax_code_id is not null
  and exists (
      select 1
      from {{ ref('stg_qbo_tax_code_rates') }} r
      where r.tax_code_id = stg.tax_code_id
  )

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
