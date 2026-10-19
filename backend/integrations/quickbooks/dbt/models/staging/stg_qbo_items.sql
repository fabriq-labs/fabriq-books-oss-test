-- Staging model for QuickBooks Online items
-- NOTE: Airbyte qb_items currently has no Sku / PrefVendorRef / SalesTaxCodeRef / ParentRef.
-- Until Airbyte lands those columns, they stay null here.
--
-- Fix (run once, then Refresh schema + sync Items in Airbyte):
--   ALTER TABLE datalake.qb_items
--     ADD COLUMN IF NOT EXISTS "Sku" text,
--     ADD COLUMN IF NOT EXISTS "PrefVendorRef" jsonb,
--     ADD COLUMN IF NOT EXISTS "SalesTaxCodeRef" jsonb,
--     ADD COLUMN IF NOT EXISTS "ParentRef" jsonb;
-- Then change the null:: lines below back to "Sku" / "PrefVendorRef" etc. and re-run dbt.

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

select
    _airbyte_raw_id as airbyte_raw_id,
    _airbyte_extracted_at,
    _airbyte_generation_id,
    _airbyte_meta,

    "Id" as item_id,
    "Name" as name,
    "Type" as item_type,
    null::text as sku,
    "Description" as description,
    "Active" as active,
    "FullyQualifiedName" as fully_qualified_name,

    null::text as parent_item_id,
    null::text as parent_item_name,

    "UnitPrice" as unit_price,
    "PurchaseCost" as purchase_cost,
    "PurchaseDesc" as purchase_description,

    "IncomeAccountRef"->>'value' as income_account_id,
    "IncomeAccountRef"->>'name' as income_account_name,
    "ExpenseAccountRef"->>'value' as expense_account_id,
    "ExpenseAccountRef"->>'name' as expense_account_name,
    "AssetAccountRef"->>'value' as asset_account_id,
    "AssetAccountRef"->>'name' as asset_account_name,

    null::text as preferred_vendor_id,
    null::text as preferred_vendor_name,

    null::text as sales_tax_code_id,
    null::text as sales_tax_code_name,

    "TrackQtyOnHand" as track_qty_on_hand,
    "QtyOnHand" as qty_on_hand,
    "InvStartDate" as inv_start_date,
    "Taxable" as taxable,

    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time

from {{ source('datalake', 'qb_items') }}
