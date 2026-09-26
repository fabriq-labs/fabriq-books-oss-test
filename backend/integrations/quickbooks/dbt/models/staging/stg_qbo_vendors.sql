-- Staging model for QuickBooks Online vendors
-- Columns absent from current Airbyte qb_vendors schema are null

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
    "Id" as vendor_id,

    -- Name and contact
    "DisplayName" as display_name,
    "CompanyName" as company_name,
    "PrintOnCheckName" as print_on_check_name,
    "Title" as title,
    "GivenName" as given_name,
    "MiddleName" as middle_name,
    "FamilyName" as family_name,
    "Suffix" as suffix,
    "Active" as active,

    -- Contact (JSONB)
    "PrimaryEmailAddr"->>'Address' as primary_email,
    "PrimaryPhone"->>'FreeFormNumber' as primary_phone,
    "Mobile"->>'FreeFormNumber' as mobile_phone,
    "Fax"->>'FreeFormNumber' as fax,
    "WebAddr"->>'URI' as website,
    null::text as other_phone,  -- AlternatePhone not in Airbyte schema

    -- Address / BillAddr
    "BillAddr"->>'Line1' as billing_address_line1,
    "BillAddr"->>'Line2' as billing_address_line2,
    "BillAddr"->>'City' as billing_city,
    "BillAddr"->>'CountrySubDivisionCode' as billing_state,
    "BillAddr"->>'PostalCode' as billing_postal_code,
    "BillAddr"->>'Country' as billing_country,

    null::text as notes,  -- Notes not in Airbyte schema

    "Balance" as balance,

    -- Payment terms / currency
    "TermRef"->>'value' as payment_term_ref_id,
    "TermRef"->>'name' as payment_term_name,
    "CurrencyRef"->>'value' as currency_code,
    "CurrencyRef"->>'name' as currency_name,

    -- Tax / 1099 / account number
    "TaxIdentifier" as tax_identifier,
    "Vendor1099" as vendor_1099,
    "AcctNum" as account_number,

    -- ExpenseAccountRef not in Airbyte schema
    null::text as expense_account_id,
    null::text as expense_account_name,

    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time

from {{ source('datalake', 'qb_vendors') }}
