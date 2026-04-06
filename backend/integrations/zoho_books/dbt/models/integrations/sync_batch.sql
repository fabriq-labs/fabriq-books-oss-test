-- Integration metadata: sync batch summary
-- Summarizes Airbyte sync operations for audit and lineage tracking
-- Handles multiple streams: invoices, sales_orders, payments

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
        'zoho_books' as source_system_type,
        'invoices' as stream_name,
        'datalake' as namespace,
        'zb_invoices' as destination_table,
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
    from {{ ref('stg_zoho_invoices') }}
    group by _airbyte_generation_id
),
sales_orders_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_sales_orders')) as id,
        'zoho_books' as source_system_type,
        'sales_orders' as stream_name,
        'datalake' as namespace,
        'zb_sales_orders' as destination_table,
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
    from {{ ref('stg_zoho_sales_orders') }}
    group by _airbyte_generation_id
),
payments_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_payments')) as id,
        'zoho_books' as source_system_type,
        'payments' as stream_name,
        'datalake' as namespace,
        'zb_customer_payments' as destination_table,
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
    from {{ ref('stg_zoho_payments') }}
    group by _airbyte_generation_id
),
contacts_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_contacts')) as id,
        'zoho_books' as source_system_type,
        'contacts' as stream_name,
        'datalake' as namespace,
        'zb_contacts' as destination_table,
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
    from {{ ref('stg_zoho_contacts') }}
    group by _airbyte_generation_id
),
bills_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_bills')) as id,
        'zoho_books' as source_system_type,
        'bills' as stream_name,
        'datalake' as namespace,
        'zb_bills' as destination_table,
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
    from {{ ref('stg_zoho_bills') }}
    group by _airbyte_generation_id
),
items_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_items')) as id,
        'zoho_books' as source_system_type,
        'items' as stream_name,
        'datalake' as namespace,
        'zb_items' as destination_table,
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
    from {{ ref('stg_zoho_items') }}
    group by _airbyte_generation_id
),
accounts_batch as (
    select
        md5(concat(_airbyte_generation_id::text, '_', min(_airbyte_extracted_at)::text, '_accounts')) as id,
        'zoho_books' as source_system_type,
        'accounts' as stream_name,
        'datalake' as namespace,
        'zb_accounts' as destination_table,
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
    from {{ ref('stg_zoho_accounts') }}
    group by _airbyte_generation_id
),
all_batches as (
    select * from invoices_batch
    union all
    select * from sales_orders_batch
    union all
    select * from payments_batch
    union all
    select * from contacts_batch
    union all
    select * from bills_batch
    union all
    select * from items_batch
    union all
    select * from accounts_batch
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
-- Use NOT EXISTS for better performance and to handle NULLs correctly
where not exists (
    select 1 from {{ this }} existing
    where existing.id = ab.id
)
{% endif %}
