-- Normalized invoice model
-- Maps both Zoho Books invoices (SALES) and bills (PURCHASE) to public.invoice
-- Includes lineage tracking fields

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key='source_record_id',
    on_schema_change='append_new_columns'
  )
}}

-- CTE for sales invoices (zb_invoices)
with sales_invoices as (
select
    -- Generate simple ID for Phase 1 (can be improved later)
    md5(concat(stg.zoho_invoice_id, '_', sb.id)) as id,

    -- Core invoice fields (copy-only mapping)
    stg.status as invoice_status,
    stg.total as invoice_total,
    stg.shipping_charge as shipping_cost,
    stg.unprocessed_payment_amount as balance_amount,
    'SALES' as invoice_type,  -- Always 'SALES' for zb_invoices (business classification)
    coalesce(stg.transaction_type, stg.type) as transaction_type,  -- Zoho's transaction type (renewal, invoice, etc.)

    -- Invoice identifiers
    -- Handle empty strings and placeholder values: generate unique value to avoid constraint violations
    case 
        when stg.invoice_number is not null 
         and stg.invoice_number != '' 
         and stg.invoice_number != 'NA'
         and upper(trim(stg.invoice_number)) != 'NULL'
        then stg.invoice_number
        else 'INV-' || stg.zoho_invoice_id::text  -- Generate unique invoice_number for invoices without valid one
    end as invoice_number,
    stg.zoho_invoice_id as source_record_id,

    -- Timestamps
    case 
        when stg.date is not null and stg.date != '' 
        then stg.date::timestamp
        else now()
    end as invoice_date,
    stg.updated_time::timestamp as source_updated_at,
    stg.updated_time::timestamp as modified_at,
    case 
        when stg.created_time is not null and stg.created_time != '' 
        then stg.created_time::timestamp
        else now()
    end as created_at,

    -- Lineage fields
    ss.id as source_system_id,
    sb.id as ingest_batch_id,

    -- Foreign keys - populate customer_id from customers table
    case 
        when stg.shipping_address is not null 
             and stg.shipping_address->>'address' is not null 
             and trim(stg.shipping_address->>'address') != ''
        then trim(stg.shipping_address->>'address')
        else null
    end as deliver_to,
    null as location_id,
    c.id as customer_id,  -- Join to customers table using source_record_id
    null as wf_instance_id,
    null as purchase_order_id,
    null as sales_order_id,

    -- Other invoice fields - map available Zoho fields
    1::integer as invoice_version,  -- Default to version 1
    null as supplier_name,  -- Zoho invoices are for customers, not suppliers
    case 
        when stg.has_attachment = true then stg.documents
        else null
    end as attach,
    null as supplier_remarks,
    null as shipping_terms,  -- May be in custom_fields, needs investigation
    null as shipping_method,  -- May be in custom_fields, needs investigation
    null as payment_terms,  -- May be in customer record or custom_fields
    null as remit_to,
    case 
        when stg.billing_address is not null 
             and stg.billing_address->>'address' is not null 
             and trim(stg.billing_address->>'address') != ''
        then trim(stg.billing_address->>'address')
        else null
    end as bill_to,
    null as requester_name,
    case 
        when stg.email is not null and stg.email != '' 
        then stg.email
        else null
    end as requester_email,
    null as ap_comment,
    case 
        when stg.reference_number is not null and stg.reference_number != '' 
        then stg.reference_number
        else null
    end as po_number,
    null::double precision as additional_tax,  -- May be in line items or custom_fields
    null::double precision as tax_on_shipping,  -- May be calculated from line items
    null::double precision as handling_cost,  -- Not in Zoho invoices
    null::double precision as tax_on_handling,  -- Not in Zoho invoices
    null::double precision as misc_cost,  -- Not in Zoho invoices
    null::double precision as tax_on_misc,  -- Not in Zoho invoices
    -- Calculate invoice_net_total if possible (total - adjustments - write_off)
    case 
        when stg.total is not null 
        then stg.total - coalesce(stg.adjustment, 0) - coalesce(stg.write_off_amount, 0)
        else null
    end::double precision as invoice_net_total,
    -- Shipping handling misc total (just shipping for now)
    coalesce(stg.shipping_charge, 0)::double precision as shipping_handling_misc_total,
    -- Tax total: calculate from adjustment if it represents tax
    null::double precision as tax_total,  -- Tax may be in line items, needs investigation
    null as name,
    stg.status as status,  -- Map status field
    null as terms_and_conditions  -- May be in template or custom_fields

from {{ ref('stg_zoho_invoices') }} stg
-- Use DISTINCT ON to prevent duplicate batches from causing duplicate invoice records
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'invoices'
    order by id, created_at desc
    limit 1
) sb on true
-- Use DISTINCT ON to prevent duplicate source systems from causing duplicate invoice records
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
    or stg.updated_time::timestamp > (select max(source_updated_at) from {{ this }})
)
{% endif %}
-- If force_process_all=true, process ALL records (no filter applied)
),
-- CTE for purchase invoices/bills (zb_bills)
purchase_bills as (
select
    -- Generate ID
    md5(concat(stg.zoho_bill_id, '_', sb.id)) as id,

    -- Core invoice fields - mapped from Zoho bills
    stg.status as invoice_status,
    stg.total as invoice_total,
    null::double precision as shipping_cost,  -- Bills may not have shipping_charge (match type with sales_invoices)
    stg.unprocessed_payment_amount as balance_amount,
    'PURCHASE' as invoice_type,  -- Always 'PURCHASE' for zb_bills (business classification)
    null as transaction_type,  -- Bills don't have transaction_type in Zoho (only invoices do)

    -- Invoice identifiers
    -- Handle empty strings and placeholder values: generate unique value to avoid constraint violations
    case 
        when stg.bill_number is not null 
         and stg.bill_number != '' 
         and stg.bill_number != 'NA'
         and upper(trim(stg.bill_number)) != 'NULL'
        then stg.bill_number
        else 'BILL-' || stg.zoho_bill_id::text  -- Generate unique invoice_number for bills without valid one
    end as invoice_number,
    stg.zoho_bill_id as source_record_id,

    -- Timestamps
    case 
        when stg.date is not null and stg.date != '' 
        then stg.date::timestamp
        else now()
    end as invoice_date,
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

    -- Foreign keys - bills don't have customers
    null::text as deliver_to,  -- Match type with sales_invoices
    null as location_id,
    null as customer_id,  -- Bills don't have customers
    null as wf_instance_id,
    null as purchase_order_id,
    null as sales_order_id,

    -- Other invoice fields - map available Zoho bill fields
    1::integer as invoice_version,  -- Default to version 1
    stg.vendor_name as supplier_name,  -- Map vendor_name to supplier_name
    case 
        when stg.has_attachment = true then stg.attachment_name
        else null
    end as attach,
    null as supplier_remarks,
    null as shipping_terms,  -- May be in custom_fields, needs investigation
    null as shipping_method,  -- May be in custom_fields, needs investigation
    null as payment_terms,  -- May be in vendor record or custom_fields
    null as remit_to,
    null as bill_to,  -- Bills may have billing address, needs investigation
    null as requester_name,
    null as requester_email,
    null as ap_comment,
    case 
        when stg.reference_number is not null and stg.reference_number != '' 
        then stg.reference_number
        else null
    end as po_number,
    null::double precision as additional_tax,  -- May be in line items or custom_fields
    null::double precision as tax_on_shipping,  -- May be calculated from line items
    null::double precision as handling_cost,  -- Not in Zoho bills
    null::double precision as tax_on_handling,  -- Not in Zoho bills
    null::double precision as misc_cost,  -- Not in Zoho bills
    null::double precision as tax_on_misc,  -- Not in Zoho bills
    -- Calculate invoice_net_total if possible (total - tds_total)
    case 
        when stg.total is not null 
        then stg.total - coalesce(stg.tds_total, 0)
        else null
    end::double precision as invoice_net_total,
    null::double precision as shipping_handling_misc_total,  -- Bills may not have shipping
    -- Tax total: tds_total may be part of tax
    coalesce(stg.tds_total, 0)::double precision as tax_total,  -- TDS is a form of tax
    null as name,
    stg.status as status,  -- Map status field
    null as terms_and_conditions  -- May be in template or custom_fields

from {{ ref('stg_zoho_bills') }} stg
-- Use DISTINCT ON to prevent duplicate batches from causing duplicate bill records
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'bills'
    order by id, created_at desc
    limit 1
) sb on true
-- Use DISTINCT ON to prevent duplicate source systems from causing duplicate bill records
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'zoho_books'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true
-- TODO: Join to supplier table to populate supplier_id FK (similar to customer_id for invoices)
-- left join public.supplier s
--     on s.source_record_id = stg.vendor_id
--     and s.source_system_id = ss.id

-- Only process records that have a corresponding batch
where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
-- Skip this filter if force_process_all=true (process all records)
and (
    (select max(source_updated_at) from {{ this }}) is null
    or (
        stg.last_modified_time is not null and stg.last_modified_time != '' 
        and stg.last_modified_time::timestamp > (select max(source_updated_at) from {{ this }})
    )
)
{% endif %}
-- If force_process_all=true, process ALL records (no filter applied)
)
-- Union both sources into single invoice table
select * from sales_invoices
union all
select * from purchase_bills
