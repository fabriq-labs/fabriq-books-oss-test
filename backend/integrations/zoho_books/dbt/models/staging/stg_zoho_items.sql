-- Staging model for Zoho Books items
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
    item_id as zoho_item_id,
    -- Extract account_id from Zoho items (maps to sales_account_id in Fabriq)
    account_id as zoho_account_id,
    -- Extract purchase_account_id from Zoho items (maps to purchase_account_id in Fabriq)
    purchase_account_id as zoho_purchase_account_id,

    -- Include all other columns as-is
    *

from {{ source('datalake', 'zb_items') }}

