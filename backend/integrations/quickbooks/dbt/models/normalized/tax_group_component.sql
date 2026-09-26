-- Normalized tax_group_component: link TaxCode → TaxRate (tax_group → tax_master)
-- Deterministic id for merge (no lineage columns on this table)
-- depends_on: {{ ref('tax_group') }}
-- depends_on: {{ ref('tax_master') }}

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key=['id'],
    on_schema_change='ignore',
    full_refresh=false
  )
}}

select
    ('txgc_' || md5(concat(
        '{{ var("org_id") }}',
        '_qb_',
        stg.tax_code_id::text,
        '_',
        stg.tax_rate_id::text
    )))::varchar(50) as id,

    tg.id as tax_group_id,
    tm.id as tax_master_id,
    coalesce(stg.tax_order, 1) as sequence,
    '{{ var("org_id") }}' as org_id,
    null as created_by,
    coalesce({{ parse_qbo_date('stg.create_time') }}, now()) as created_at,
    null as modified_by,
    coalesce({{ parse_qbo_date('stg.last_updated_time') }}, now()) as modified_at,
    null as assigned_to

from {{ ref('stg_qbo_tax_code_rates') }} stg
inner join public.tax_group tg
    on tg.code = ('qbo_code_' || stg.tax_code_id::text)
    and tg.org_id = '{{ var("org_id") }}'
inner join public.tax_master tm
    on tm.tax_code = ('qbo_rate_' || stg.tax_rate_id::text)
    and tm.org_id = '{{ var("org_id") }}'

where stg.tax_rate_id is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(modified_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(modified_at) from {{ this }})
)
{% endif %}
