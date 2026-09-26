-- Staging: QuickBooks Online Tax Rates
-- Individual / component rates → public.tax_master

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

    "Id" as tax_rate_id,
    "Name" as tax_rate_name,
    "Description" as description,
    "RateValue" as rate_value,
    coalesce("Active", true) as active,
    "SpecialTaxType" as special_tax_type,
    "DisplayType" as display_type,

    "AgencyRef"->>'value' as agency_id,
    "AgencyRef"->>'name' as agency_name,

    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time

from {{ source('datalake', 'qb_tax_rates') }}
