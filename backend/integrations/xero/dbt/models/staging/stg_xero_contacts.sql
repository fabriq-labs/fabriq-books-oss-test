-- Staging model for Xero contacts
-- Extract from JSONB data column, convert PascalCase to snake_case
-- Includes both customers and suppliers (differentiated by IsCustomer, IsSupplier)

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
    data->>'ContactID' as contact_id,
    
    -- Core fields (extract from JSONB, PascalCase -> snake_case)
    data->>'Name' as name,
    data->>'FirstName' as first_name,
    data->>'LastName' as last_name,
    data->>'EmailAddress' as email_address,
    data->>'Website' as website,
    data->>'ContactStatus' as contact_status,
    
    -- Customer/Supplier flags (key for dual-role handling)
    coalesce((data->>'IsCustomer')::boolean, false) as is_customer,
    coalesce((data->>'IsSupplier')::boolean, false) as is_supplier,
    
    -- Timestamps (handle .NET JSON format: /Date(1234567890000+0000)/)
    {{ parse_xero_date("data->>'UpdatedDateUTC'") }} as updated_date_utc,
    
    -- Phone extraction (JSONB array)
    data->'Phones' as phones,
    coalesce(
        (select p->>'PhoneNumber' from jsonb_array_elements(data->'Phones') p 
         where p->>'PhoneType' = 'DEFAULT' limit 1),
        (data->'Phones'->0->>'PhoneNumber')
    ) as primary_phone,
    (select p->>'PhoneNumber' from jsonb_array_elements(data->'Phones') p 
     where p->>'PhoneType' = 'MOBILE' limit 1) as mobile_phone,
    
    -- Address extraction (JSONB array) - prefer STREET, fallback to first
    data->'Addresses' as addresses,
    coalesce(
        (select a->>'AddressLine1' from jsonb_array_elements(data->'Addresses') a 
         where a->>'AddressType' = 'STREET' limit 1),
        (data->'Addresses'->0->>'AddressLine1')
    ) as address_line1,
    coalesce(
        (select a->>'City' from jsonb_array_elements(data->'Addresses') a 
         where a->>'AddressType' = 'STREET' limit 1),
        (data->'Addresses'->0->>'City')
    ) as city,
    coalesce(
        (select a->>'Region' from jsonb_array_elements(data->'Addresses') a 
         where a->>'AddressType' = 'STREET' limit 1),
        (data->'Addresses'->0->>'Region')
    ) as region,
    coalesce(
        (select a->>'Country' from jsonb_array_elements(data->'Addresses') a 
         where a->>'AddressType' = 'STREET' limit 1),
        (data->'Addresses'->0->>'Country')
    ) as country,
    coalesce(
        (select a->>'PostalCode' from jsonb_array_elements(data->'Addresses') a 
         where a->>'AddressType' = 'STREET' limit 1),
        (data->'Addresses'->0->>'PostalCode')
    ) as postal_code,
    
    -- Raw data for reference
    data
    
from {{ source('datalake', 'xero_contacts') }}
