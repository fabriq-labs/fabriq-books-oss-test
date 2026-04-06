-- Staging model for Zoho Books sales orders
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
    salesorder_id as zoho_salesorder_id,
    
    -- Include all other columns as-is
    *
    
from {{ source('datalake', 'zb_sales_orders') }}

