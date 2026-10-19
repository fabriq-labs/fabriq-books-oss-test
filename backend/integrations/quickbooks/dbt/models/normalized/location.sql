-- Normalized location from QBO invoice BillAddr → public.location (with lineage)
-- depends_on: {{ ref('customer') }}

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
    coalesce(
        nullif(trim(stg.billing_city), ''),
        nullif(trim(stg.billing_address_line1), ''),
        nullif(trim(stg.customer_name), ''),
        'QBO Location'
    ) as name,
    null as code,

    le.id as entity_id,
    c.id as customer_id,

    nullif(trim(stg.billing_address_line1), '') as address,
    nullif(trim(stg.billing_city), '') as city,
    nullif(trim(stg.billing_state), '') as state,
    coalesce(nullif(trim(stg.billing_country), ''), 'United States') as country,
    nullif(trim(stg.billing_postal_code), '') as postal_code,
    true as is_active,

    null as created_by,
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    null as modified_by,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    '{{ var("org_id") }}' as org_id,

    ss.id as source_system_id,
    md5(concat(
        coalesce(stg.customer_id::text, 'nocust'),
        '_',
        coalesce(stg.billing_address_line1, ''),
        '_',
        coalesce(stg.billing_city, ''),
        '_',
        coalesce(stg.billing_postal_code, '')
    )) as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    null as ingest_batch_id

from {{ ref('stg_qbo_invoice_locations') }} stg
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
      and org_id = '{{ var("org_id") }}'
    order by id, created_at desc
    limit 1
) ss on true
left join public.customer c
    on c.source_record_id = stg.customer_id::text
    and c.source_system_id = ss.id
    and c.org_id = '{{ var("org_id") }}'
left join lateral (
    select e.id
    from public.entity e
    where e.org_id = '{{ var("org_id") }}'
      and e.is_headquarters = true
    order by e.id
    limit 1
) le on true

where ss.id is not null
  and (
    nullif(trim(stg.billing_address_line1), '') is not null
    or nullif(trim(stg.billing_city), '') is not null
  )

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
