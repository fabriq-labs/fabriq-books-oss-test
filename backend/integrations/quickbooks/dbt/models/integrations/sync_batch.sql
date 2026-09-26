-- Integration metadata: sync batch summary
-- Summarizes Airbyte sync operations for audit and lineage tracking

{{
  config(
    materialized='incremental',
    unique_key='id',
    schema='datalake'
  )
}}

with accounts_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_accounts')) as id,
        'quickbooks' as source_system_type,
        'accounts' as stream_name,
        'datalake' as namespace,
        'qb_accounts' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_qbo_accounts') }}
    group by _airbyte_generation_id
),
customers_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_customers')) as id,
        'quickbooks' as source_system_type,
        'customers' as stream_name,
        'datalake' as namespace,
        'qb_customers' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_qbo_customers') }}
    group by _airbyte_generation_id
),
vendors_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_vendors')) as id,
        'quickbooks' as source_system_type,
        'vendors' as stream_name,
        'datalake' as namespace,
        'qb_vendors' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_qbo_vendors') }}
    group by _airbyte_generation_id
),
items_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_items')) as id,
        'quickbooks' as source_system_type,
        'items' as stream_name,
        'datalake' as namespace,
        'qb_items' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_qbo_items') }}
    group by _airbyte_generation_id
),
invoices_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_invoices')) as id,
        'quickbooks' as source_system_type,
        'invoices' as stream_name,
        'datalake' as namespace,
        'qb_invoices' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_qbo_invoices') }}
    group by _airbyte_generation_id
),
tax_rates_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_tax_rates')) as id,
        'quickbooks' as source_system_type,
        'tax_rates' as stream_name,
        'datalake' as namespace,
        'qb_tax_rates' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_qbo_tax_rates') }}
    group by _airbyte_generation_id
),
tax_codes_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_tax_codes')) as id,
        'quickbooks' as source_system_type,
        'tax_codes' as stream_name,
        'datalake' as namespace,
        'qb_tax_codes' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_qbo_tax_codes') }}
    group by _airbyte_generation_id
),
tax_agencies_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_tax_agencies')) as id,
        'quickbooks' as source_system_type,
        'tax_agencies' as stream_name,
        'datalake' as namespace,
        'qb_tax_agencies' as destination_table,
        'incremental' as load_type,
        'completed' as status,
        count(*) as row_count,
        min(_airbyte_extracted_at) as raw_min_emitted_at,
        max(_airbyte_extracted_at) as raw_max_emitted_at,
        min(_airbyte_extracted_at)::timestamp as started_at,
        max(_airbyte_extracted_at)::timestamp as completed_at,
        _airbyte_generation_id::text as airbyte_job_id,
        null as airbyte_connection_id,
        '{{ invocation_id }}' as dbt_run_id,
        json_build_object(
            'airbyte_generation_id', _airbyte_generation_id,
            'dbt_run_at', '{{ run_started_at }}',
            'record_count', count(*)
        ) as notes
    from {{ ref('stg_qbo_tax_agencies') }}
    group by _airbyte_generation_id
),
all_batches as (
    select * from accounts_batch
    union all
    select * from customers_batch
    union all
    select * from vendors_batch
    union all
    select * from items_batch
    union all
    select * from invoices_batch
    union all
    select * from tax_rates_batch
    union all
    select * from tax_codes_batch
    union all
    select * from tax_agencies_batch
)

select
    ab.id,
    ss.id as source_system_id,
    ab.stream_name,
    ab.namespace,
    ab.destination_table,
    ab.load_type,
    ab.status,
    ab.row_count,
    ab.raw_min_emitted_at,
    ab.raw_max_emitted_at,
    ab.started_at,
    ab.completed_at,
    ab.airbyte_connection_id,
    ab.airbyte_job_id,
    ab.dbt_run_id,
    ab.notes,
    now() as created_at,
    now() as modified_at
from all_batches ab
join public.source_system ss
    on ss.system_type = ab.source_system_type
    and ss.is_active = true

{% if is_incremental() %}
-- Only insert new batches not already processed
where not exists (
    select 1 from {{ this }} existing
    where existing.id = ab.id
)
{% endif %}


