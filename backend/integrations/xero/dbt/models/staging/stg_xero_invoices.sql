-- Staging model for Xero invoices
-- Extract from JSONB data column, convert PascalCase to snake_case
-- No transformations, calculations, or filtering

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
    
    -- Primary identifier (extract from JSONB data column)
    data->>'InvoiceID' as invoice_id,
    
    -- Core fields (extract from JSONB, PascalCase -> snake_case)
    data->>'InvoiceNumber' as invoice_number,
    data->>'Type' as type,
    data->>'Status' as status,
    (data->>'Total')::numeric as total,
    (data->>'SubTotal')::numeric as sub_total,
    (data->>'TotalTax')::numeric as total_tax,
    (data->>'AmountDue')::numeric as amount_due,
    (data->>'AmountPaid')::numeric as amount_paid,
    (data->>'AmountCredited')::numeric as amount_credited,
    
    -- Dates (handle .NET JSON format: /Date(1234567890000+0000)/)
    {{ parse_xero_date("data->>'Date'") }} as date,
    {{ parse_xero_date("data->>'DueDate'") }} as due_date,
    {{ parse_xero_date("data->>'UpdatedDateUTC'") }} as updated_date_utc,
    
    -- Reference and currency
    data->>'Reference' as reference,
    data->>'CurrencyCode' as currency_code,
    (data->>'CurrencyRate')::numeric as currency_rate,
    
    -- Contact (nested object)
    data->'Contact' as contact,
    data->'Contact'->>'ContactID' as contact_id,
    data->'Contact'->>'Name' as contact_name,
    
    -- Line items (array)
    data->'LineItems' as line_items,
    
    -- Raw data for reference
    data
    
from {{ source('datalake', 'xero_invoices') }}

