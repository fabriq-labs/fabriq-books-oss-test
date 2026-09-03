-- Normalized customers model
-- Maps Zoho Books contacts (contact_type = 'customer') to public.customers
-- Includes lineage tracking fields

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key='source_record_id',
    on_schema_change='append_new_columns'
  )
}}

select
    -- Generate ID based on Zoho contact_id and batch
    md5(concat(stg.zoho_contact_id, '_', sb.id)) as id,

    -- Core customer fields - mapped from Zoho to Prisma
    coalesce(stg.customer_name, stg.contact_name, stg.company_name) as customer_name,
    '' as customer_address,  -- Address not in contacts stream, use empty string
    '' as city,  -- Address not in contacts stream, use empty string
    '' as state,  -- Address not in contacts stream, use empty string
    '' as country,  -- Address not in contacts stream, use empty string
    '' as zip_code,  -- Address not in contacts stream, use empty string
    coalesce(stg.phone, stg.mobile, '') as primary_phone,  -- NOT NULL in Prisma; Zoho contacts often omit phone
    coalesce(stg.email, '') as primary_email,
    'Not Specified' as industry,  -- Industry not in contacts stream, use default
    stg.website,
    
    -- Timestamps
    case 
        when stg.created_time is not null and stg.created_time != '' 
        then stg.created_time::timestamp
        else now()
    end as created_at,
    case 
        when stg.last_modified_time is not null and stg.last_modified_time != '' 
        then stg.last_modified_time::timestamp
        else now()
    end as modified_at,
    
    -- Lineage fields
    ss.id as source_system_id,
    stg.zoho_contact_id as source_record_id,
    case 
        when stg.last_modified_time is not null and stg.last_modified_time != '' 
        then stg.last_modified_time::timestamp
        else now()
    end as source_updated_at,
    sb.id as ingest_batch_id,
    
    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,
    
    -- Optional fields (leave null for Phase 2)
    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as payment_term_id,
    null as preferred_currency_id

from {{ ref('stg_zoho_contacts') }} stg
-- Use DISTINCT ON to prevent duplicate batches from causing duplicate customer records
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'contacts'
    order by id, created_at desc
    limit 1
) sb on true
-- Use DISTINCT ON to prevent duplicate source systems from causing duplicate customer records
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'zoho_books'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true

-- Filter only customers (not vendors)
where stg.contact_type = 'customer'
  and sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
-- Skip this filter if force_process_all=true (process all records)
and (
    (select max(source_updated_at) from {{ this }}) is null
    or (
        stg.last_modified_time is not null 
        and stg.last_modified_time != ''
        and stg.last_modified_time::timestamp > (select max(source_updated_at) from {{ this }})
    )
)
{% endif %}
-- If force_process_all=true, process ALL records (no filter applied)

