-- Staging: explode QuickBooks invoice Line JSON into one row per sales line
-- Skips SubTotalLineDetail and other non-item detail types
-- Pass-through of QBO line fields only (no tax/amount recalculation)

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

select
    inv.airbyte_raw_id,
    inv._airbyte_extracted_at,
    inv._airbyte_generation_id,
    inv.invoice_id,
    inv.invoice_number,
    inv.last_updated_time,
    inv.create_time,
    inv.tax_total as invoice_tax_total,
    inv.tax_percent as invoice_tax_percent,
    inv.txn_tax_code_id,

    line_elem->>'Id' as line_id,
    nullif(line_elem->>'LineNum', '')::integer as line_num,
    line_elem->>'DetailType' as detail_type,
    line_elem->>'Description' as description,
    nullif(line_elem->>'Amount', '')::double precision as amount,
    line_elem->'SalesItemLineDetail'->'ItemRef'->>'value' as item_id,
    line_elem->'SalesItemLineDetail'->'ItemRef'->>'name' as item_name,
    nullif(line_elem->'SalesItemLineDetail'->>'Qty', '')::double precision as qty,
    nullif(line_elem->'SalesItemLineDetail'->>'UnitPrice', '')::double precision as unit_price,
    line_elem->'SalesItemLineDetail'->'TaxCodeRef'->>'value' as tax_code,
    line_elem->'SalesItemLineDetail'->'ItemAccountRef'->>'value' as item_account_id,
    line_elem->'SalesItemLineDetail'->'ItemAccountRef'->>'name' as item_account_name

from {{ ref('stg_qbo_invoices') }} inv
cross join lateral jsonb_array_elements(coalesce(inv.line_items, '[]'::jsonb)) as line_elem
where line_elem->>'DetailType' = 'SalesItemLineDetail'
