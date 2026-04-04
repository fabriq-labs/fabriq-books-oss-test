-- Normalized customers model for Xero
-- Maps Xero contacts (IsCustomer = true) to public.customers
-- NOTE: Same contact may appear in supplier table if IsSupplier is also true

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key='source_record_id',
    on_schema_change='append_new_columns'
  )
}}

select
    -- Generate ID
    md5(concat(stg.contact_id, '_', sb.id)) as id,

    -- Core customer fields
    stg.name as customer_name,
    coalesce(stg.address_line1, '') as customer_address,
    coalesce(stg.city, '') as city,
    coalesce(stg.region, '') as state,
    coalesce(stg.country, '') as country,
    coalesce(stg.postal_code, '') as zip_code,
    coalesce(stg.primary_phone, stg.mobile_phone, '') as primary_phone,
    coalesce(stg.email_address, '') as primary_email,
    'Not Specified' as industry,  -- Xero doesn't have industry field
    stg.website,
    
    -- Timestamps (already parsed in staging view)
    now() as created_at,
    stg.updated_date_utc as modified_at,
    
    -- Lineage fields
    ss.id as source_system_id,
    stg.contact_id as source_record_id,
    stg.updated_date_utc as source_updated_at,
    sb.id as ingest_batch_id,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- Optional fields (leave null for Phase 1)
    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as payment_term_id,
    null as preferred_currency_id

from {{ ref('stg_xero_contacts') }} stg
-- Join to sync_batch
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'contacts'
    order by id, created_at desc
    limit 1
) sb on true
-- Join to source_system
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'xero'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true

-- Filter: Only contacts where IsCustomer = true
-- NOTE: This contact may also be a supplier (dual-role)
where stg.is_customer = true
  and stg.contact_status = 'ACTIVE'
  and sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic
and (
    (select max(source_updated_at) from {{ this }}) is null
    or stg.updated_date_utc > (select max(source_updated_at) from {{ this }})
)
{% endif %}

