-- Staging model for QuickBooks Online items
-- Extract from direct columns and JSONB columns, convert QuickBooks fields to snake_case
-- Items can be Service, Inventory, or NonInventory

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
    "Id" as item_id,
    
    -- Core fields (direct columns)
    "Name" as name,
    "Type" as item_type,  -- Service, Inventory, NonInventory
    "Description" as description,
    "Active" as active,
    "FullyQualifiedName" as fully_qualified_name,
    
    -- Pricing (direct columns)
    "UnitPrice" as unit_price,
    "PurchaseCost" as purchase_cost,
    
    -- Account references (JSONB columns)
    "IncomeAccountRef"->>'value' as income_account_id,
    "IncomeAccountRef"->>'name' as income_account_name,
    
    "ExpenseAccountRef"->>'value' as expense_account_id,
    "ExpenseAccountRef"->>'name' as expense_account_name,
    
    "AssetAccountRef"->>'value' as asset_account_id,
    "AssetAccountRef"->>'name' as asset_account_name,
    
    -- Inventory information (direct columns - for Inventory type items)
    "TrackQtyOnHand" as track_qty_on_hand,
    "QtyOnHand" as qty_on_hand,
    "InvStartDate" as inv_start_date,
    
    -- Tax information (direct columns and JSONB)
    "Taxable" as taxable,
    
    -- Timestamps (QuickBooks uses MetaData.LastUpdatedTime - JSONB column)
    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time
    
from {{ source('datalake', 'qb_items') }}
