-- QBO Payment.Line LinkedTxn → public.payment_receipt_application (signed)
-- depends_on: {{ ref('payment_receipt') }}
-- depends_on: {{ ref('invoice') }}
-- depends_on: {{ ref('credit_note') }}

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key=['source_record_id', 'source_system_id', 'org_id'],
    on_schema_change='ignore',
    full_refresh=false,
    post_hook=[
      """
      update public.payment_receipt pr
      set invoice_id = single_inv.invoice_id
      from (
        select
          pra.payment_receipt_id,
          min(pra.invoice_id) as invoice_id
        from public.payment_receipt_application pra
        where pra.org_id = '{{ var(\"org_id\") }}'
          and pra.target_type = 'invoice'
          and pra.invoice_id is not null
        group by pra.payment_receipt_id
        having count(*) = 1
      ) single_inv
      where pr.id = single_inv.payment_receipt_id
        and pr.org_id = '{{ var(\"org_id\") }}'
        and (pr.invoice_id is distinct from single_inv.invoice_id)
      """,
      """
      update public.payment_receipt pr
      set invoice_id = null
      where pr.org_id = '{{ var(\"org_id\") }}'
        and pr.invoice_id is not null
        and (
          select count(*)
          from public.payment_receipt_application pra
          where pra.payment_receipt_id = pr.id
            and pra.target_type = 'invoice'
            and pra.invoice_id is not null
        ) <> 1
      """
    ]
  )
}}

with agged as (
    select
        pl.payment_id,
        pl.linked_txn_id,
        pl.linked_txn_type,
        pl.txn_date,
        pl._airbyte_generation_id,
        pl._airbyte_extracted_at,
        max(pl.application_source_record_id) as application_source_record_id,
        sum(pl.amount) as amount
    from {{ ref('stg_qbo_payment_lines') }} pl
    group by 1, 2, 3, 4, 5, 6
)

select
    pr.id as payment_receipt_id,
    case
        when lower(coalesce(a.linked_txn_type, '')) in ('invoice') then 'invoice'::settlement_target_type
        when lower(coalesce(a.linked_txn_type, '')) in ('creditmemo', 'credit_memo') then 'credit_note'::settlement_target_type
        when lower(coalesce(a.linked_txn_type, '')) = 'payment' then 'payment_receipt'::settlement_target_type
        when lower(coalesce(a.linked_txn_type, '')) = 'journalentry' then 'journal_entry'::settlement_target_type
        when lower(coalesce(a.linked_txn_type, '')) in ('expense', 'check', 'creditcardcredit') then 'refund'::settlement_target_type
        else 'other'::settlement_target_type
    end as target_type,
    inv.id as invoice_id,
    cn.id as credit_note_id,
    a.linked_txn_id::text as target_source_record_id,
    case
        when lower(coalesce(a.linked_txn_type, '')) in ('creditmemo', 'credit_memo')
        then (-1 * abs(coalesce(a.amount, 0)))::numeric(19, 4)
        else abs(coalesce(a.amount, 0))::numeric(19, 4)
    end as amount_applied,
    a.txn_date::timestamp as applied_date,

    null as created_by,
    now() as created_at,
    null as modified_by,
    now() as modified_at,
    '{{ var("org_id") }}' as org_id,

    ss.id as source_system_id,
    a.application_source_record_id as source_record_id,
    a._airbyte_extracted_at::timestamp as source_updated_at,
    sb.id as ingest_batch_id

from agged a
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = a._airbyte_generation_id::text
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
inner join public.payment_receipt pr
    on pr.source_record_id = a.payment_id::text
    and pr.source_system_id = ss.id
    and pr.org_id = '{{ var("org_id") }}'
left join public.invoice inv
    on inv.source_record_id = a.linked_txn_id::text
    and inv.source_system_id = ss.id
    and inv.org_id = '{{ var("org_id") }}'
    and lower(coalesce(a.linked_txn_type, '')) = 'invoice'
left join public.credit_note cn
    on cn.source_record_id = a.linked_txn_id::text
    and cn.source_system_id = ss.id
    and cn.org_id = '{{ var("org_id") }}'
    and lower(coalesce(a.linked_txn_type, '')) in ('creditmemo', 'credit_memo')

where sb.id is not null
  and pr.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or a._airbyte_extracted_at::timestamp > (select max(source_updated_at) from {{ this }})
)
{% endif %}
