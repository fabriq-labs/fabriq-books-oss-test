-- Normalized invoice model for Xero
-- Maps Xero invoices to public.invoice
-- Includes both ACCREC (sales) and ACCPAY (purchase/bills)

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
    md5(concat(stg.invoice_id, '_', sb.id)) as id,

    -- Core invoice fields
    stg.status as invoice_status,
    stg.total as invoice_total,
    null::double precision as shipping_cost,  -- Xero doesn't have shipping_charge
    stg.amount_due as balance_amount,
    
    -- Invoice type mapping: ACCREC -> SALES, ACCPAY -> PURCHASE
    case 
        when stg.type = 'ACCREC' then 'SALES'
        when stg.type = 'ACCPAY' then 'PURCHASE'
        else stg.type
    end as invoice_type,
    null as transaction_type,  -- Xero doesn't have transaction_type like Zoho

    -- Invoice identifiers
    case 
        when stg.invoice_number is not null and stg.invoice_number != ''
        then stg.invoice_number
        else 'XERO-' || stg.invoice_id
    end as invoice_number,
    stg.invoice_id as source_record_id,

    -- Timestamps (already parsed in staging view)
    coalesce(stg.date, now()) as invoice_date,
    stg.updated_date_utc as source_updated_at,
    stg.updated_date_utc as modified_at,
    now() as created_at,

    -- Lineage fields
    ss.id as source_system_id,
    sb.id as ingest_batch_id,

    -- Foreign keys - populate customer_id for sales invoices
    null as deliver_to,
    null as location_id,
    case 
        when stg.type = 'ACCREC' then c.id  -- Customer for sales invoices
        else null
    end as customer_id,
    null as wf_instance_id,
    null as purchase_order_id,
    null as sales_order_id,

    -- Other invoice fields
    1::integer as invoice_version,
    case 
        when stg.type = 'ACCPAY' then stg.contact_name  -- Supplier for purchase bills
        else null
    end as supplier_name,
    null as attach,
    null as supplier_remarks,
    null as shipping_terms,
    null as shipping_method,
    null as payment_terms,
    null as remit_to,
    null as bill_to,
    null as requester_name,
    null as requester_email,
    null as ap_comment,
    stg.reference as po_number,
    null as coa,
    null::double precision as additional_tax,
    null::double precision as tax_on_shipping,
    null::double precision as handling_cost,
    null::double precision as tax_on_handling,
    null::double precision as misc_cost,
    null::double precision as tax_on_misc,
    stg.sub_total::double precision as invoice_net_total,
    null::double precision as shipping_handling_misc_total,
    stg.total_tax::double precision as tax_total,
    null as name,
    stg.status as status,
    null as terms_and_conditions

from {{ ref('stg_xero_invoices') }} stg
-- Join to sync_batch (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'invoices'
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
-- Join to customers for FK population (sales invoices only)
left join public.customers c
    on c.source_record_id = stg.contact_id
    and c.source_system_id = ss.id

-- Only process records that have a corresponding batch
where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
and (
    (select max(source_updated_at) from {{ this }}) is null
    or stg.updated_date_utc > (select max(source_updated_at) from {{ this }})
)
{% endif %}

