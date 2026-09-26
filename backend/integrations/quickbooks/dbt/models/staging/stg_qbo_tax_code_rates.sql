-- Staging: explode TaxCode SalesTaxRateList into one row per component rate
-- Used to build tax_group_component links

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

select
    tc.airbyte_raw_id,
    tc._airbyte_extracted_at,
    tc._airbyte_generation_id,
    tc.tax_code_id,
    tc.tax_code_name,
    tc.last_updated_time,
    tc.create_time,
    tc.active as tax_code_active,

    detail->'TaxRateRef'->>'value' as tax_rate_id,
    detail->'TaxRateRef'->>'name' as tax_rate_name,
    nullif(detail->>'TaxOrder', '')::integer as tax_order,
    detail->>'TaxTypeApplicable' as tax_type_applicable

from {{ ref('stg_qbo_tax_codes') }} tc
cross join lateral jsonb_array_elements(
    coalesce(
        tc.sales_tax_rate_list->'TaxRateDetail',
        tc.sales_tax_rate_list,
        '[]'::jsonb
    )
) as detail
where detail->'TaxRateRef'->>'value' is not null
  and trim(detail->'TaxRateRef'->>'value') != ''
