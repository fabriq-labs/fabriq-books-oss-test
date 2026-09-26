-- Staging model for QuickBooks Online invoices
-- Extract from direct columns and JSONB columns, convert QuickBooks fields to snake_case
-- Columns match Airbyte-landed datalake.qb_invoices (no HomeBalance in this stream)

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
    "Id" as invoice_id,

    -- Core identifiers / amounts (direct columns)
    "DocNumber" as invoice_number,
    "TxnDate" as txn_date,
    "DueDate" as due_date,
    "TotalAmt" as total_amt,
    "Balance" as balance,
    "HomeTotalAmt" as home_total_amt,
    "ExchangeRate" as exchange_rate,
    "PrivateNote" as private_note,
    "PrintStatus" as print_status,
    "EmailStatus" as email_status,

    -- Customer reference (JSONB)
    "CustomerRef"->>'value' as customer_id,
    "CustomerRef"->>'name' as customer_name,

    -- Currency / terms (JSONB)
    "CurrencyRef"->>'value' as currency_code,
    "CurrencyRef"->>'name' as currency_name,
    "SalesTermRef"->>'value' as sales_term_id,
    "SalesTermRef"->>'name' as sales_term_name,

    -- Memos (JSONB / text)
    "CustomerMemo"->>'value' as customer_memo,

    -- Billing address (JSONB)
    "BillAddr"->>'Line1' as billing_address_line1,
    "BillAddr"->>'Line2' as billing_address_line2,
    "BillAddr"->>'City' as billing_city,
    "BillAddr"->>'CountrySubDivisionCode' as billing_state,
    "BillAddr"->>'PostalCode' as billing_postal_code,
    "BillAddr"->>'Country' as billing_country,

    -- Shipping address (JSONB)
    "ShipAddr"->>'Line1' as shipping_address_line1,
    "ShipAddr"->>'Line2' as shipping_address_line2,
    "ShipAddr"->>'City' as shipping_city,
    "ShipAddr"->>'CountrySubDivisionCode' as shipping_state,
    "ShipAddr"->>'PostalCode' as shipping_postal_code,
    "ShipAddr"->>'Country' as shipping_country,

    -- Tax detail (JSONB) — TotalTax + TaxPercent from QBO TaxLine (no amount math)
    nullif("TxnTaxDetail"->>'TotalTax', '')::double precision as tax_total,
    "TxnTaxDetail"->'TxnTaxCodeRef'->>'value' as txn_tax_code_id,
    -- QBO TaxPercent values (stacked rates summed only for display as one %)
    (
        select coalesce(sum(nullif(tl->'TaxLineDetail'->>'TaxPercent', '')::double precision), 0)
        from jsonb_array_elements(coalesce("TxnTaxDetail"->'TaxLine', '[]'::jsonb)) tl
        where coalesce((tl->'TaxLineDetail'->>'PercentBased')::boolean, true) = true
    ) as tax_percent,
    "TxnTaxDetail" as txn_tax_detail,

    -- Line items kept for invoice_line_item model
    "Line" as line_items,

    -- Timestamps (QuickBooks uses MetaData.* — JSONB column)
    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time

from {{ source('datalake', 'qb_invoices') }}
