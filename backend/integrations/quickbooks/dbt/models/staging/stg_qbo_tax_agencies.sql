-- Staging: QuickBooks Online Tax Agencies
-- qb_tax_agencies is not synced in this Airbyte connection — empty stub so tax_master can still run.
-- Enable Airbyte stream TaxAgencies, then replace this stub with a real select from the source.

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

select
    null::varchar as airbyte_raw_id,
    null::timestamptz as _airbyte_extracted_at,
    null::bigint as _airbyte_generation_id,
    null::jsonb as _airbyte_meta,
    null::text as agency_id,
    null::text as agency_name,
    null::boolean as tax_tracked_on_purchases,
    null::boolean as tax_tracked_on_sales,
    true as active,
    null::text as last_updated_time,
    null::text as create_time
where false
