-- QBO Payment → public.payment_receipt
-- depends_on: {{ ref('customer') }}
-- depends_on: {{ ref('account') }}

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key=['source_record_id', 'source_system_id', 'org_id'],
    on_schema_change='ignore',
    full_refresh=false
  )
}}

select
    case
        when stg.doc_number is not null and trim(stg.doc_number::text) != ''
        then trim(stg.doc_number::text)
        else 'PMT-' || stg.payment_id::text
    end as number,

    coalesce(stg.txn_date::timestamp, now()) as receipt_date,
    c.id as customer_id,
    null::text as invoice_id,
    dep.id as account_id,
    ar.id as receivable_account_id,
    coalesce(stg.total_amt, 0)::numeric(19, 4) as amount,
    coalesce(stg.unapplied_amt, 0)::numeric(19, 4) as unapplied_amount,
    cur.id as currency_id,
    coalesce(stg.exchange_rate, 1)::numeric(19, 6) as exchange_rate,
    round(coalesce(stg.total_amt, 0) * coalesce(stg.exchange_rate, 1), 4)::numeric(19, 4) as base_amount,
    stg.payment_method_name as payment_method,
    stg.payment_ref_num as payment_reference,
    case
        when coalesce(stg.total_amt, 0) > 0
         and not exists (
            select 1 from {{ ref('stg_qbo_payment_lines') }} pl
            where pl.payment_id = stg.payment_id
         )
        then 'advance'::payment_type
        else null
    end as payment_type,
    case
        when stg.private_note is not null
         and lower(left(trim(stg.private_note), 6)) = 'voided'
        then 'void'::sales_document_status
        else 'posted'::sales_document_status
    end as status,
    stg.private_note as notes,
    le.id as entity_id,
    case
        when stg.private_note is not null
         and lower(left(trim(stg.private_note), 6)) = 'voided'
        then {{ parse_qbo_date('stg.last_updated_time') }}
        else null
    end as voided_at,
    case
        when stg.private_note is not null
         and lower(left(trim(stg.private_note), 6)) = 'voided'
        then 'source_voided'
        else null
    end as void_reason,
    'pending'::ledger_status as ledger_status,
    null::text as ledger_error,
    null::timestamp as ledger_posted_at,

    null as created_by,
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    null as modified_by,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    '{{ var("org_id") }}' as org_id,

    ss.id as source_system_id,
    stg.payment_id::text as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id

from {{ ref('stg_qbo_payments') }} stg
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'payments'
    order by id, created_at desc
    limit 1
) sb on true
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
      and org_id = '{{ var("org_id") }}'
    order by id, created_at desc
    limit 1
) ss on true
left join lateral (
    select e.id
    from public.entity e
    where e.org_id = '{{ var("org_id") }}'
      and e.is_headquarters = true
    order by e.id
    limit 1
) le on true
left join public.customer c
    on c.source_record_id = stg.customer_id::text
    and c.source_system_id = ss.id
    and c.org_id = '{{ var("org_id") }}'
left join public.account dep
    on dep.source_record_id = stg.deposit_account_id::text
    and dep.source_system_id = ss.id
    and dep.org_id = '{{ var("org_id") }}'
left join public.account ar
    on ar.source_record_id = stg.ar_account_id::text
    and ar.source_system_id = ss.id
    and ar.org_id = '{{ var("org_id") }}'
left join public.currency cur
    on upper(cur.code) = upper(coalesce(stg.currency_code, ''))

where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
