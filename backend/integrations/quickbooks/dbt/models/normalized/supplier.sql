-- Normalized supplier model for QuickBooks Online
-- Maps QuickBooks vendors → public.supplier (existing Fabriq columns only)
-- QBO Vendor UI → Fabriq Purchases → Suppliers

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
    -- Name and contact
    coalesce(stg.display_name, stg.company_name, 'Unknown') as supplier_name,
    coalesce(stg.company_name, stg.display_name) as legal_name,
    coalesce(nullif(trim(stg.print_on_check_name), ''), null) as name,

    -- Address (street 1 + street 2 when present)
    coalesce(
        nullif(
            trim(concat_ws(', ',
                nullif(stg.billing_address_line1, ''),
                nullif(stg.billing_address_line2, '')
            )),
            ''
        ),
        ''
    ) as supplier_address,
    coalesce(stg.billing_city, '') as city,
    coalesce(stg.billing_state, '') as state,
    coalesce(stg.billing_country, '') as country,
    coalesce(stg.billing_postal_code, '') as zip_code,

    -- Phones / email / web
    coalesce(stg.primary_phone, '') as primary_phone,
    coalesce(stg.mobile_phone, stg.other_phone) as alternative_phone,
    coalesce(stg.primary_email, '') as primary_email,
    null as secondary_email,
    null as po_email,
    stg.website,

    -- Status / classification defaults
    case when coalesce(stg.active, true) then 'Active' else 'Inactive' end as status,
    'Not Specified' as industry,
    null::integer as employee_count,
    -- Tax ID (Business ID / SSN) → legal_registration_number
    nullif(trim(coalesce(stg.tax_identifier, '')), '') as legal_registration_number,
    'Not Specified' as business_classification,
    'No' as buyer_review_added,
    {{ parse_qbo_date('stg.create_time') }} as onboarded_date,

    -- Payment terms (Terms dropdown) — match Fabriq payment_terms by name
    pt.id as payment_term_id,
    -- Currency
    cur.id as preferred_currency_id,

    -- Timestamps
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,

    -- Multi-tenancy / lineage
    '{{ var("org_id") }}' as org_id,
    ss.id as source_system_id,
    stg.vendor_id as source_record_id,
    sb.id as ingest_batch_id,

    -- Optional
    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as supplier_id,
    null as shipping_term_id,
    null as shipping_method_id

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
      and lower(trim(p.payment_terms)) = lower(trim(stg.payment_term_name))
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
