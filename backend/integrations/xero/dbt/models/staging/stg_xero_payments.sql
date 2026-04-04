-- Staging model for Xero payments
-- Extract from JSONB data column, convert PascalCase to snake_case

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
    data->>'PaymentID' as payment_id,
    
    -- Core fields (extract from JSONB, PascalCase -> snake_case)
    {{ parse_xero_date("data->>'Date'") }} as date,
    (data->>'Amount')::numeric as amount,
    data->>'Reference' as reference,
    data->>'PaymentType' as payment_type,
    data->>'Status' as status,
    (data->>'CurrencyRate')::numeric as currency_rate,
    
    -- Timestamps (handle .NET JSON format: /Date(1234567890000+0000)/)
    {{ parse_xero_date("data->>'UpdatedDateUTC'") }} as updated_date_utc,
    
    -- Invoice (nested object)
    data->'Invoice' as invoice,
    data->'Invoice'->>'InvoiceID' as invoice_id,
    data->'Invoice'->>'InvoiceNumber' as invoice_number,
    
    -- Account (nested object)
    data->'Account' as account,
    data->'Account'->>'AccountID' as account_id,
    data->'Account'->>'Name' as account_name,
    
    -- Raw data for reference
    data
    
from {{ source('datalake', 'xero_payments') }}
