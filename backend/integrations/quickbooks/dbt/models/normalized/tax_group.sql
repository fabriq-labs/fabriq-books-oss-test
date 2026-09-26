-- Normalized tax_group from QuickBooks TaxCodes (combined / tax groups)
-- Existing Fabriq columns only — merge on code + org_id
-- Skip bare TAX/NON system codes with no SalesTaxRateList components
-- depends_on: {{ ref('tax_master') }}

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key=['code', 'org_id'],
    on_schema_change='ignore',
    full_refresh=false
  )
}}

select
    coalesce(nullif(trim(stg.tax_code_name), ''), 'QBO Tax Code') as name,
    ('qbo_code_' || stg.tax_code_id::text) as code,
    'US' as country_code,
    case when coalesce(stg.active, true) then 'Active' else 'Inactive' end as status,
    '{{ var("org_id") }}' as org_id,
    null as created_by,
    coalesce({{ parse_qbo_date('stg.create_time') }}, now()) as created_at,
    null as modified_by,
    coalesce({{ parse_qbo_date('stg.last_updated_time') }}, now()) as modified_at,
    null as assigned_to

from {{ ref('stg_qbo_tax_codes') }} stg
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'tax_codes'
    order by id, created_at desc
    limit 1
) sb on true
-- Only tax codes that have at least one sales tax rate component
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
    (select max(modified_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(modified_at) from {{ this }})
)
{% endif %}
