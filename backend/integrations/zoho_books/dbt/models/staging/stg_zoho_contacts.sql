-- Staging model for Zoho Books contacts
-- Copy-only: select all fields from Airbyte-landed table
-- No transformations, calculations, or filtering
-- Contacts include both customers (contact_type = 'customer') and vendors (contact_type = 'vendor')

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
    contact_id as zoho_contact_id,

    -- Include all other columns as-is
    *

from {{ source('datalake', 'zb_contacts') }}

