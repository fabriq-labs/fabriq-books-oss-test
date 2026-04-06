-- Normalized payment receipt model
-- Maps Zoho Books customer payments to public.payment_receipt
-- Field mapping based on Prisma payment_receipt model

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
    md5(concat(stg.zoho_payment_id, '_', sb.id)) as id,

    -- Core fields - mapped from Zoho to Prisma (based on actual schema)
    stg.payment_number as receipt_number,
    case 
        when stg.date is not null and stg.date != '' 
        then stg.date::timestamp
        else now()
    end as receipt_date,
    stg.amount,
    stg.payment_mode as payment_method,
    case 
        when stg.description is not null and stg.description != '' 
        then stg.description
        else null
    end as notes,  -- Using description field instead of notes
    stg.payment_status as status,  -- Using payment_status instead of status
    
    -- Payment type mapping (Zoho has payment_type field - map to enum)
    -- Note: payment_type is an enum in Prisma (FULL, PARTIAL, ADVANCE)
    case 
        when upper(stg.payment_type) = 'ADVANCE' then 'ADVANCE'::payment_type
        when upper(stg.payment_type) = 'FULL' or upper(stg.payment_type) = 'FULLPAYMENT' then 'FULL'::payment_type
        else 'PARTIAL'::payment_type  -- Default to PARTIAL for other types
    end as payment_type,
    
    -- Currency fields (not available in zb_customer_payments)
    null as currency_id,
    1.00 as exchange_rate,  -- Default to 1.00 (base currency)
    stg.amount as base_amount,  -- Same as amount if no exchange rate
    
    -- Identifiers
    stg.zoho_payment_id as source_record_id,
    
    -- Timestamps
    case 
        when stg.last_modified_time is not null and stg.last_modified_time != '' 
        then stg.last_modified_time::timestamp
        else now()
    end as source_updated_at,
    case 
        when stg.last_modified_time is not null and stg.last_modified_time != '' 
        then stg.last_modified_time::timestamp
        else now()
    end as modified_at,
    case 
        when stg.created_time is not null and stg.created_time != '' 
        then stg.created_time::timestamp
        else now()
    end as created_at,
    
    -- Lineage fields
    ss.id as source_system_id,
    sb.id as ingest_batch_id,
    
    -- Foreign keys - populate customer_id from customers table
    c.id as customer_id,  -- Join to customers table using source_record_id
    null as account_id,  -- May be available in account_id field, needs investigation
    
    -- Other fields - map available Zoho fields
    case 
        when stg.reference_number is not null and stg.reference_number != '' 
        then stg.reference_number
        else null
    end as payment_reference,
    null as created_by,
    null as modified_by,
    '{{ var("org_id") }}' as org_id,
    null as assigned_to

from {{ ref('stg_zoho_payments') }} stg
-- Use DISTINCT ON to prevent duplicate batches from causing duplicate payment records
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'payments'
    order by id, created_at desc
    limit 1
) sb on true
-- Use DISTINCT ON to prevent duplicate source systems from causing duplicate payment records
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'zoho_books'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true
-- Join to customers table to populate customer_id FK
-- Match on Zoho customer_id (source_record_id) and source_system_id
left join public.customers c
    on c.source_record_id = stg.customer_id
    and c.source_system_id = ss.id

-- Only process records that have a corresponding batch
where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
-- Skip this filter if force_process_all=true (process all records)
and (
    (select max(source_updated_at) from {{ this }}) is null
    or stg.last_modified_time::timestamp > (select max(source_updated_at) from {{ this }})
)
{% endif %}
-- If force_process_all=true, process ALL records (no filter applied)

