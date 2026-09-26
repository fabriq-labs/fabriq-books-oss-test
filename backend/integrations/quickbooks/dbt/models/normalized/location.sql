-- Normalized location from QuickBooks invoice BillAddr
-- No lineage columns on location — use deterministic id for merge
-- depends_on: {{ ref('customers') }}

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
    ('loca_' || md5(concat(
        '{{ var("org_id") }}',
        '_qb_',
        coalesce(stg.customer_id, 'nocust'),
        '_',
        coalesce(stg.billing_address_line1, ''),
        '_',
        coalesce(stg.billing_city, ''),
        '_',
        coalesce(stg.billing_postal_code, '')
    )))::varchar(50) as id,

    coalesce(
        nullif(trim(stg.billing_city), ''),
        nullif(trim(stg.billing_address_line1), ''),
        nullif(trim(stg.customer_name), ''),
        'QBO Location'
    ) as location,
    coalesce(
        nullif(trim(stg.customer_name), ''),
        nullif(trim(stg.billing_city), ''),
        'QBO Location'
    ) as name,

    coalesce(le.id, '{{ var("org_id") }}') as legal_entity_id,
    c.id as customer_id,

    coalesce(nullif(trim(stg.billing_address_line1), ''), '') as address,
    coalesce(nullif(trim(stg.billing_city), ''), '') as city,
    coalesce(nullif(trim(stg.billing_state), ''), '') as state,
    coalesce(
        nullif(trim(stg.billing_country), ''),
        'United States'
    ) as country,
    coalesce(nullif(trim(stg.billing_postal_code), ''), '') as zip_code,
    null as website,
    nullif(
        trim(concat_ws(', ',
            nullif(stg.billing_address_line1, ''),
            nullif(stg.billing_city, ''),
            nullif(stg.billing_state, ''),
            nullif(stg.billing_postal_code, ''),
            coalesce(nullif(stg.billing_country, ''), 'United States')
        )),
        ''
    ) as full_address,

    null as created_by,
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    null as modified_by,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    '{{ var("org_id") }}' as org_id,
    null as assigned_to

from {{ ref('stg_qbo_invoice_locations') }} stg
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true
left join public.customers c
    on c.source_record_id = stg.customer_id
    and c.source_system_id = ss.id
    and c.org_id = '{{ var("org_id") }}'
left join lateral (
    select e.id
    from public.entity e
    where e.org_id = '{{ var("org_id") }}'
      and lower(trim(coalesce(e.is_it_headquartres::text, ''))) in ('yes', 'true', '1')
    order by e.id
    limit 1
) le on true

{% if is_incremental() and not var('force_process_all', false) %}
where (
    (select max(modified_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(modified_at) from {{ this }})
)
{% endif %}
