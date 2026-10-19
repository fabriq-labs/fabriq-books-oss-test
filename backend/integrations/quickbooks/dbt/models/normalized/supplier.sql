-- Normalized supplier for QuickBooks Online vendors → public.supplier (thin universal model)

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
    coalesce(stg.display_name, stg.company_name, 'Unknown') as name,
    coalesce(stg.company_name, stg.display_name) as legal_name,

    nullif(
        trim(concat_ws(', ',
            nullif(stg.billing_address_line1, ''),
            nullif(stg.billing_address_line2, '')
        )),
        ''
    ) as address,
    nullif(stg.billing_city, '') as city,
    nullif(stg.billing_state, '') as state,
    nullif(stg.billing_country, '') as country,
    nullif(stg.billing_postal_code, '') as postal_code,

    nullif(stg.primary_email, '') as email,
    nullif(stg.primary_phone, '') as phone,
    nullif(stg.website, '') as website,

    coalesce(stg.active, true) as is_active,

    {{ parse_qbo_date('stg.create_time') }} as created_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,

    '{{ var("org_id") }}' as org_id,
    ss.id as source_system_id,
    stg.vendor_id::text as source_record_id,
    sb.id as ingest_batch_id,

    null as created_by,
    null as modified_by,
    null as entity_id,
    null as payable_account_id,
    null as tax_treatment,
    null as default_tax_region_id,
    pt.id as payment_terms_id,
    cur.id as currency_id

from {{ ref('stg_qbo_vendors') }} stg
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'vendors'
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
left join public.currency cur
    on upper(cur.code) = upper(coalesce(stg.currency_code, ''))
left join lateral (
    select p.id
    from public.payment_terms p
    where p.org_id = '{{ var("org_id") }}'
      and stg.payment_term_name is not null
      and trim(stg.payment_term_name) != ''
      and lower(trim(p.name)) = lower(trim(stg.payment_term_name))
    order by p.id
    limit 1
) pt on true

where sb.id is not null
  and coalesce(stg.active, true) = true

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
