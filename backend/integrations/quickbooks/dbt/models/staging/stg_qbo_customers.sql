-- Staging model for QuickBooks Online customers
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
    "Id" as customer_id,
    
    -- Core fields (direct columns)
    "DisplayName" as display_name,
    "CompanyName" as company_name,
    null as title,  -- Title not available in customers table
    "GivenName" as given_name,
    "MiddleName" as middle_name,
    "FamilyName" as family_name,
    null as suffix,  -- Suffix not available in customers table
    "FullyQualifiedName" as fully_qualified_name,
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
    
    "ShipAddr"->>'Line1' as shipping_address_line1,
    "ShipAddr"->>'Line2' as shipping_address_line2,
    "ShipAddr"->>'City' as shipping_city,
    "ShipAddr"->>'CountrySubDivisionCode' as shipping_state,
    "ShipAddr"->>'PostalCode' as shipping_postal_code,
    "ShipAddr"->>'Country' as shipping_country,
    
    -- Balance information (direct columns)
    "Balance" as balance,
    "BalanceWithJobs" as balance_with_jobs,
    null as credit_limit,  -- CreditLimit not available in customers table
    
    -- Payment terms (JSONB columns)
    "PaymentMethodRef"->>'value' as payment_method_id,
    "SalesTermRef"->>'value' as payment_term_id,
    
    -- Tax information (direct columns and JSONB)
    "Taxable" as taxable,
    null as tax_exemption_reason_id,  -- TaxExemptionReasonId not available
    "DefaultTaxCodeRef"->>'value' as default_tax_code_id,
    
    -- Timestamps (QuickBooks uses MetaData.LastUpdatedTime - JSONB column)
    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time
    
from {{ source('datalake', 'qb_customers') }}
