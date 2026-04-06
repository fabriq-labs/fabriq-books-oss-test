-- Staging model for Zoho Books customer payments
-- Copy-only: select all fields from Airbyte-landed table

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

-- Simple staging: select all columns with minimal renaming
select
    -- Rename key identifiers
    _airbyte_raw_id as airbyte_raw_id,
    payment_id as zoho_payment_id,
    
    -- Include all other columns as-is
    *
    
from {{ source('datalake', 'zb_customer_payments') }}

