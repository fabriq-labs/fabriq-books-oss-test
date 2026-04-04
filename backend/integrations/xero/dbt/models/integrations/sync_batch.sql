-- Integration metadata: sync batch summary
-- Summarizes PyAirbyte sync operations for audit and lineage tracking

{{
  config(
    materialized='incremental',
    unique_key='id',
    schema='datalake'
  )
}}

with invoices_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_invoices')) as id,
        'xero' as source_system_type,
        'invoices' as stream_name,
        'datalake' as namespace,
        'xero_invoices' as destination_table,
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
    from {{ ref('stg_xero_invoices') }}
    group by _airbyte_generation_id
),
contacts_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_contacts')) as id,
        'xero' as source_system_type,
        'contacts' as stream_name,
        'datalake' as namespace,
        'xero_contacts' as destination_table,
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
    from {{ ref('stg_xero_contacts') }}
    group by _airbyte_generation_id
),
payments_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_payments')) as id,
        'xero' as source_system_type,
        'payments' as stream_name,
        'datalake' as namespace,
        'xero_payments' as destination_table,
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
    from {{ ref('stg_xero_payments') }}
    group by _airbyte_generation_id
),
all_batches as (
    select * from invoices_batch
    union all
    select * from contacts_batch
    union all
    select * from payments_batch
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

