-- Normalized payment receipt model for Xero
-- Maps Xero payments to public.payment_receipt

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
    md5(concat(stg.payment_id, '_', sb.id)) as id,

    -- Core payment fields (dates already parsed in staging view)
    stg.reference as receipt_number,
    stg.date as receipt_date,
    stg.amount,
    stg.payment_type as payment_method,
    null as notes,
    stg.status,
    
    -- Payment type enum mapping
    case 
        when upper(stg.payment_type) = 'ACCRECPAYMENT' then 'FULL'::payment_type
        when upper(stg.payment_type) = 'ACCPAYPAYMENT' then 'FULL'::payment_type
        when upper(stg.payment_type) = 'AROVERPAYMENT' then 'ADVANCE'::payment_type
        when upper(stg.payment_type) = 'ARPREPAYMENT' then 'ADVANCE'::payment_type
        else 'PARTIAL'::payment_type
    end as payment_type,
    
    -- Currency fields
    null as currency_id,
    coalesce(stg.currency_rate, 1.00) as exchange_rate,
    stg.amount as base_amount,
    
    -- Identifiers
    stg.payment_id as source_record_id,
    
    -- Timestamps (already parsed in staging view)
    stg.updated_date_utc as source_updated_at,
    stg.updated_date_utc as modified_at,
    now() as created_at,
    
    -- Lineage fields
    ss.id as source_system_id,
    sb.id as ingest_batch_id,
    
    -- Foreign keys (leave null for Phase 1)
    null as customer_id,
    null as account_id,
    null as payment_reference,
    
    -- Other fields
    null as created_by,
    null as modified_by,
    '{{ var("org_id") }}' as org_id,
    null as assigned_to

from {{ ref('stg_xero_payments') }} stg
-- Join to sync_batch
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'payments'
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

-- Only process records that have a corresponding batch
where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic
and (
    (select max(source_updated_at) from {{ this }}) is null
    or stg.updated_date_utc > (select max(source_updated_at) from {{ this }})
)
{% endif %}

