-- Explode Payment.Line × LinkedTxn for settlement applications.
-- Keep $0 lines that still have a LinkedTxn (credit apply via $0 payment).

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

with base as (
    select * from {{ ref('stg_qbo_payments') }}
),
lines as (
    select
        b.payment_id,
        b.txn_date,
        b._airbyte_extracted_at,
        b._airbyte_generation_id,
        line_ord.ordinality as line_number,
        line_ord.value as line_json,
        coalesce(nullif(line_ord.value->>'Amount', '')::numeric, 0) as line_amount
    from base b
    cross join lateral jsonb_array_elements(coalesce(b.line_items, '[]'::jsonb))
        with ordinality as line_ord(value, ordinality)
),
linked as (
    select
        l.payment_id,
        l.txn_date,
        l._airbyte_extracted_at,
        l._airbyte_generation_id,
        l.line_number,
        l.line_amount,
        lt.ordinality as linked_ord,
        lt.value->>'TxnId' as linked_txn_id,
        lt.value->>'TxnType' as linked_txn_type
    from lines l
    cross join lateral jsonb_array_elements(coalesce(l.line_json->'LinkedTxn', '[]'::jsonb))
        with ordinality as lt(value, ordinality)
)

select
    payment_id,
    txn_date,
    _airbyte_extracted_at,
    _airbyte_generation_id,
    line_number,
    linked_txn_id,
    linked_txn_type,
    -- Aggregate duplicate {TxnType,TxnId} within one payment later in normalized model.
    line_amount as amount,
    payment_id || ':' || coalesce(linked_txn_type, 'other') || ':' || coalesce(linked_txn_id, 'unknown')
        as application_source_record_id
from linked
where linked_txn_id is not null
  and trim(linked_txn_id) != ''
