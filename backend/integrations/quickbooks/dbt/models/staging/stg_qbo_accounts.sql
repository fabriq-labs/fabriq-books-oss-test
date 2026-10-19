-- Staging model for QuickBooks Online accounts
-- Extract from direct columns and JSONB columns, convert QuickBooks fields to snake_case
-- Accounts represent Chart of Accounts entries

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
    
    -- Primary identifier (direct column)
    "Id" as account_id,
    
    -- Core fields (direct columns)
    "Name" as account_name,
    "AccountType" as account_type,
    "AccountSubType" as account_sub_type,
    "FullyQualifiedName" as fully_qualified_name,
    "Active" as active,
    
    -- Balance information (direct columns)
    "CurrentBalance" as current_balance,
    "CurrentBalanceWithSubAccounts" as current_balance_with_sub_accounts,
    
    -- Classification (direct column)
    "Classification" as classification,
    
    -- Currency (JSONB column)
    "CurrencyRef"->>'value' as currency_code,
    "CurrencyRef"->>'name' as currency_name,
    
    -- Timestamps (QuickBooks uses MetaData.LastUpdatedTime - JSONB column)
    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time,
    
    -- Parent account reference (JSONB column)
    "ParentRef"->>'value' as parent_account_id,
    "ParentRef"->>'name' as parent_account_name
    
from {{ source('datalake', 'qb_accounts') }}
