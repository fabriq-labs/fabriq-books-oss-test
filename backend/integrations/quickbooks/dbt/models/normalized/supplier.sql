-- Normalized supplier model for QuickBooks Online
-- Maps QuickBooks vendors to public.supplier

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
    -- Core supplier fields. Prisma generates id on insert; merge matches lineage keys.
    coalesce(stg.display_name, stg.company_name, 'Unknown') as supplier_name,
    coalesce(stg.billing_address_line1, '') as supplier_address,
    coalesce(stg.billing_city, '') as city,
    coalesce(stg.billing_state, '') as state,
    coalesce(stg.billing_country, '') as country,
    coalesce(stg.billing_postal_code, '') as zip_code,
    coalesce(stg.primary_phone, '') as primary_phone,
    null as alternative_phone,
    coalesce(stg.primary_email, '') as primary_email,
    null as secondary_email,
    null as po_email,
    case when coalesce(stg.active, true) then 'Active' else 'Inactive' end as status,
    'Not Specified' as industry,
    stg.website,
    null::integer as employee_count,
    coalesce(stg.company_name, stg.display_name) as legal_name,
    null as legal_registration_number,
    'Not Specified' as business_classification,
    'No' as buyer_review_added,
    {{ parse_qbo_date('stg.create_time') }} as onboarded_date,
    
    -- Timestamps
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- Lineage fields
    ss.id as source_system_id,
    stg.vendor_id as source_record_id,
    sb.id as ingest_batch_id,
    
    -- Optional fields (leave null for Phase 1)
    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as supplier_id,
    null as payment_term_id,
    null as shipping_term_id,
    null as shipping_method_id,
    null as preferred_currency_id

from {{ ref('stg_qbo_vendors') }} stg
-- Join to sync_batch (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'vendors'
    order by id, created_at desc
    limit 1
) sb on true
-- Join to source_system (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true

-- Only process records that have a corresponding batch and are active
where sb.id is not null
  and coalesce(stg.active, true) = true

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}


