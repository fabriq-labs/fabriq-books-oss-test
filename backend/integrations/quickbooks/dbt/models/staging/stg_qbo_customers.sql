-- Staging model for QuickBooks Online customers
-- Maps to Fabriq customers (existing columns only — no Fabriq schema changes)
-- Columns absent from current Airbyte qb_customers schema are null

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

    -- Primary identifier
    "Id" as customer_id,

    -- Name and contact (QBO Customer form)
    "DisplayName" as display_name,
    "CompanyName" as company_name,
    "PrintOnCheckName" as print_on_check_name,
    null::text as title,  -- not in Airbyte schema for this realm
    "GivenName" as given_name,
    "MiddleName" as middle_name,
    "FamilyName" as family_name,
    null::text as suffix,  -- not in Airbyte schema for this realm
    "FullyQualifiedName" as fully_qualified_name,
    "Active" as active,

    -- Contact (JSONB)
    "PrimaryEmailAddr"->>'Address' as primary_email,
    "PrimaryPhone"->>'FreeFormNumber' as primary_phone,
    "Mobile"->>'FreeFormNumber' as mobile_phone,
    "Fax"->>'FreeFormNumber' as fax,
    "WebAddr"->>'URI' as website,
    null::text as other_phone,  -- AlternatePhone not in Airbyte schema

    -- Billing address
    "BillAddr"->>'Line1' as billing_address_line1,
    "BillAddr"->>'Line2' as billing_address_line2,
    "BillAddr"->>'City' as billing_city,
    "BillAddr"->>'CountrySubDivisionCode' as billing_state,
    "BillAddr"->>'PostalCode' as billing_postal_code,
    "BillAddr"->>'Country' as billing_country,

    -- Shipping address (not stored on Fabriq customers today)
    "ShipAddr"->>'Line1' as shipping_address_line1,
    "ShipAddr"->>'Line2' as shipping_address_line2,
    "ShipAddr"->>'City' as shipping_city,
    "ShipAddr"->>'CountrySubDivisionCode' as shipping_state,
    "ShipAddr"->>'PostalCode' as shipping_postal_code,
    "ShipAddr"->>'Country' as shipping_country,

    null::text as notes,  -- Notes not in Airbyte schema for this realm

    -- Balance
    "Balance" as balance,
    "BalanceWithJobs" as balance_with_jobs,

    -- Payments section
    "PaymentMethodRef"->>'value' as payment_method_id,
    "PaymentMethodRef"->>'name' as payment_method_name,
    "SalesTermRef"->>'value' as payment_term_ref_id,
    "SalesTermRef"->>'name' as sales_term_name,
    "CurrencyRef"->>'value' as currency_code,
    "CurrencyRef"->>'name' as currency_name,

    -- Additional info / tax
    "Taxable" as taxable,
    null::text as tax_exemption_reason_id,  -- not in Airbyte schema
    "DefaultTaxCodeRef"->>'value' as default_tax_code_id,
    "DefaultTaxCodeRef"->>'name' as default_tax_code_name,
    "ResaleNum" as resale_number,

    -- Timestamps
    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time

from {{ source('datalake', 'qb_customers') }}
