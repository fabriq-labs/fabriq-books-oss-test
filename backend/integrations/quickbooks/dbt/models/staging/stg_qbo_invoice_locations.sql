-- Staging: distinct billing locations from QuickBooks invoices (BillAddr)
-- Sales invoice form requires location_id; bill-to is derived from that location

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

select distinct on (
    customer_id,
    billing_address_line1,
    billing_city,
    billing_postal_code
)
    invoice_id,
    customer_id,
    customer_name,
    billing_address_line1,
    billing_address_line2,
    billing_city,
    billing_state,
    billing_postal_code,
    billing_country,
    last_updated_time,
    create_time,
    _airbyte_generation_id
from {{ ref('stg_qbo_invoices') }}
where coalesce(billing_address_line1, '') != ''
   or coalesce(billing_city, '') != ''
order by
    customer_id,
    billing_address_line1,
    billing_city,
    billing_postal_code,
    last_updated_time desc nulls last
