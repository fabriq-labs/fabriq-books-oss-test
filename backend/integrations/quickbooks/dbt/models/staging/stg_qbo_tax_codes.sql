-- Staging: QuickBooks Online Tax Codes (combined / TAX / NON)
-- Maps to public.tax_group

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

    "Id" as tax_code_id,
    "Name" as tax_code_name,
    "Description" as description,
    coalesce("Active", true) as active,
    "Taxable" as taxable,
    "TaxGroup" as tax_group,

    -- Rate lists kept as JSONB for unnest in stg_qbo_tax_code_rates
    "SalesTaxRateList" as sales_tax_rate_list,
    "PurchaseTaxRateList" as purchase_tax_rate_list,

    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time

from {{ source('datalake', 'qb_tax_codes') }}
