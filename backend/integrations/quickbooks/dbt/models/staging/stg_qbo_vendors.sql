-- Staging model for QuickBooks Online vendors
-- Extract from direct columns and JSONB columns, convert QuickBooks fields to snake_case

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
    "Id" as vendor_id,
    
    -- Core fields (direct columns)
    "DisplayName" as display_name,
    "CompanyName" as company_name,
    "Title" as title,
    "GivenName" as given_name,
    "MiddleName" as middle_name,
    "FamilyName" as family_name,
    "Suffix" as suffix,
    "Active" as active,
    
    -- Contact information (JSONB columns)
    "PrimaryEmailAddr"->>'Address' as primary_email,
    "PrimaryPhone"->>'FreeFormNumber' as primary_phone,
    "Mobile"->>'FreeFormNumber' as mobile_phone,
    "Fax"->>'FreeFormNumber' as fax,
    "WebAddr"->>'URI' as website,
    
    -- Addresses (JSONB columns)
    "BillAddr"->>'Line1' as billing_address_line1,
    "BillAddr"->>'Line2' as billing_address_line2,
    "BillAddr"->>'City' as billing_city,
    "BillAddr"->>'CountrySubDivisionCode' as billing_state,
    "BillAddr"->>'PostalCode' as billing_postal_code,
    "BillAddr"->>'Country' as billing_country,
    
    -- Balance information (direct columns)
    "Balance" as balance,
    null as credit_limit,  -- CreditLimit not available in vendors table
    
    -- Payment terms (JSONB columns)
    null as payment_method_id,  -- PaymentMethodRef not available in vendors table
    "TermRef"->>'value' as payment_term_id,
    
    -- Tax information (direct columns and JSONB)
    null as taxable,  -- Taxable not available in vendors table
    null as tax_exemption_reason_id,  -- TaxExemptionReasonId not available
    null as default_tax_code_id,  -- DefaultTaxCodeRef not available in vendors table
    
    -- 1099 information (direct columns)
    "Vendor1099" as vendor_1099,
    "AcctNum" as account_number,
    
    -- Timestamps (QuickBooks uses MetaData.LastUpdatedTime - JSONB column)
    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time
    
from {{ source('datalake', 'qb_vendors') }}
