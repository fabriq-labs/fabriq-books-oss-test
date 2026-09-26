-- Normalized tax_master from QuickBooks TaxRates
-- Existing Fabriq columns only (no Prisma schema changes)
-- Merge key: tax_code + org_id  (tax_code = 'qbo_rate_' || QBO Id)
-- Note: tax_rate is Int in Prisma — RateValue is rounded (9.10 → 9)
-- depends_on: {{ ref('stg_qbo_tax_agencies') }}

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key=['tax_code', 'org_id'],
    on_schema_change='ignore',
    full_refresh=false
  )
}}

select
    coalesce(nullif(trim(stg.tax_rate_name), ''), 'QBO Tax Rate') as tax_name,
    coalesce(nullif(trim(stg.tax_rate_name), ''), 'QBO Tax Rate') as name,
    -- Stable business key for merge (no source_record_id on tax_master)
    ('qbo_rate_' || stg.tax_rate_id::text) as tax_code,
    -- Prisma tax_rate is Int — round decimal QBO rates
    round(coalesce(stg.rate_value::numeric, 0))::integer as tax_rate,
    coalesce(
        {{ parse_qbo_date('stg.create_time') }},
        now()
    ) as effective_from,
    null::timestamp as expires_on,
    coalesce(
        nullif(trim(stg.agency_name), ''),
        nullif(trim(ag.agency_name), ''),
        'United States'
    ) as geo,
    case when coalesce(stg.active, true) then 'Active' else 'Inactive' end as status,
    'sales_tax' as component_type,
    true as is_recoverable,

    '{{ var("org_id") }}' as org_id,
    null as created_by,
    coalesce({{ parse_qbo_date('stg.create_time') }}, now()) as created_at,
    null as modified_by,
    coalesce({{ parse_qbo_date('stg.last_updated_time') }}, now()) as modified_at,
    null as assigned_to

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

where sb.id is not null
  and coalesce(stg.active, true) = true
  and stg.tax_rate_id is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(modified_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(modified_at) from {{ this }})
)
{% endif %}
