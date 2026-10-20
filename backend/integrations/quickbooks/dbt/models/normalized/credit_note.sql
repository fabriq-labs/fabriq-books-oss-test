-- QBO CreditMemo → public.credit_note
-- depends_on: {{ ref('customer') }}
-- depends_on: {{ ref('location') }}

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
        else 'CM-' || stg.credit_memo_id::text
    end as number,

    coalesce(stg.txn_date::timestamp, now()) as credit_note_date,
    case
        when stg.private_note is not null
         and lower(left(trim(stg.private_note), 6)) = 'voided'
        then 'void'::sales_document_status
        else 'posted'::sales_document_status
    end as status,
    c.id as customer_id,
    null::text as invoice_id,
    le.id as entity_id,
    loc.id as location_id,
    cur.id as currency_id,
    coalesce(stg.exchange_rate, 1)::numeric(19, 6) as exchange_rate,

    case
        when stg.tax_total is not null
        then (coalesce(stg.total_amt, 0) - coalesce(stg.tax_total, 0))::numeric(19, 4)
        else stg.total_amt::numeric(19, 4)
    end as net_amount,
    coalesce(stg.tax_total, 0)::numeric(19, 4) as tax_amount,
    stg.total_amt::numeric(19, 4) as total_amount,
    coalesce(stg.remaining_credit, stg.balance, stg.total_amt)::numeric(19, 4) as balance_amount,

    null as reason,
    stg.private_note as notes,
    null as account_id,

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
    stg.credit_memo_id::text as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id

from {{ ref('stg_qbo_credit_memos') }} stg
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'credit_memos'
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
left join public.location loc
    on loc.source_record_id = md5(concat(
        coalesce(stg.customer_id::text, 'nocust'),
        '_',
        coalesce(stg.billing_address_line1, ''),
        '_',
        coalesce(stg.billing_city, ''),
        '_',
        coalesce(stg.billing_postal_code, '')
    ))
    and loc.source_system_id = ss.id
    and loc.org_id = '{{ var("org_id") }}'
left join public.currency cur
    on upper(cur.code) = upper(coalesce(stg.currency_code, ''))

where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
