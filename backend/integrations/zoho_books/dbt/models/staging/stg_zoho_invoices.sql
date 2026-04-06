-- Staging model for Zoho Books invoices
-- Copy-only: select all fields from Airbyte-landed table
-- No transformations, calculations, or filtering

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

-- Simple staging: select all columns with minimal renaming for clarity
select
    -- Rename key identifiers to avoid confusion
    _airbyte_raw_id as airbyte_raw_id,
    invoice_id as zoho_invoice_id,

    -- Include all other columns as-is
    *

from {{ source('datalake', 'zb_invoices') }}
