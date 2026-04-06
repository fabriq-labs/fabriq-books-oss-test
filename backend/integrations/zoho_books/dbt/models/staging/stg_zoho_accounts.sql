-- Staging model for Zoho Books chart of accounts
-- Extract fields from JSONB data column (similar to Xero pattern)

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

select
    -- Airbyte metadata
    _airbyte_raw_id as airbyte_raw_id,
    _airbyte_extracted_at,
    _airbyte_generation_id,
    _airbyte_meta,
    
    -- Extract account fields from JSONB data column
    data->>'account_id' as zoho_account_id,
    data->>'account_name' as account_name,
    data->>'account_type' as account_type,
    data->>'account_code' as account_code,
    data->>'description' as description,
    (data->>'is_system_account')::boolean as is_system_account,
    (data->>'is_active')::boolean as is_active,
    data->>'parent_account_id' as parent_account_id,
    data->>'created_time' as created_time,
    data->>'last_modified_time' as last_modified_time

from {{ source('datalake', 'zb_accounts') }}

