-- Explode CreditMemo lines (SalesItem / Discount / nested Group). Skip SubTotal.

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

with base as (
    select * from {{ ref('stg_qbo_credit_memos') }}
),
raw_lines as (
    select
        b.credit_memo_id,
        b._airbyte_extracted_at,
        b._airbyte_generation_id,
        line_ord.ordinality as line_number,
        line_ord.value as line_json,
        line_ord.value->>'Id' as line_id,
        line_ord.value->>'DetailType' as detail_type,
        coalesce(nullif(line_ord.value->>'Amount', '')::numeric, 0) as amount,
        line_ord.value->>'Description' as description
    from base b
    cross join lateral jsonb_array_elements(coalesce(b.line_items, '[]'::jsonb))
        with ordinality as line_ord(value, ordinality)
),
sales_item as (
    select
        credit_memo_id,
        _airbyte_extracted_at,
        _airbyte_generation_id,
        line_number,
        line_id,
        detail_type,
        amount,
        description,
        line_json->'SalesItemLineDetail'->>'ItemRef' as item_ref_json,
        line_json->'SalesItemLineDetail'->'ItemRef'->>'value' as item_id,
        line_json->'SalesItemLineDetail'->'ItemAccountRef'->>'value' as item_account_id,
        line_json->'SalesItemLineDetail'->'TaxCodeRef'->>'value' as tax_code_id,
        coalesce(nullif(line_json->'SalesItemLineDetail'->>'Qty', '')::numeric, 1) as quantity,
        coalesce(nullif(line_json->'SalesItemLineDetail'->>'UnitPrice', '')::numeric, 0) as unit_price
    from raw_lines
    where detail_type = 'SalesItemLineDetail'
),
discount as (
    select
        r.credit_memo_id,
        r._airbyte_extracted_at,
        r._airbyte_generation_id,
        r.line_number,
        r.line_id,
        r.detail_type,
        -- Discount reduces credit total; keep signed amount from QBO (often negative).
        r.amount,
        r.description,
        null::text as item_id,
        r.line_json->'DiscountLineDetail'->'DiscountAccountRef'->>'value' as item_account_id,
        null::text as tax_code_id,
        1::numeric as quantity,
        r.amount as unit_price
    from raw_lines r
    where r.detail_type = 'DiscountLineDetail'
),
-- Flatten nested GroupLineDetail.Line → same shape as SalesItem
group_sales as (
    select
        r.credit_memo_id,
        r._airbyte_extracted_at,
        r._airbyte_generation_id,
        r.line_number,
        child.value->>'Id' as line_id,
        child.value->>'DetailType' as detail_type,
        coalesce(nullif(child.value->>'Amount', '')::numeric, 0) as amount,
        child.value->>'Description' as description,
        child.value->'SalesItemLineDetail'->'ItemRef'->>'value' as item_id,
        child.value->'SalesItemLineDetail'->'ItemAccountRef'->>'value' as item_account_id,
        child.value->'SalesItemLineDetail'->'TaxCodeRef'->>'value' as tax_code_id,
        coalesce(nullif(child.value->'SalesItemLineDetail'->>'Qty', '')::numeric, 1) as quantity,
        coalesce(nullif(child.value->'SalesItemLineDetail'->>'UnitPrice', '')::numeric, 0) as unit_price
    from raw_lines r
    cross join lateral jsonb_array_elements(
        coalesce(r.line_json->'GroupLineDetail'->'Line', '[]'::jsonb)
    ) as child(value)
    where r.detail_type = 'GroupLineDetail'
      and child.value->>'DetailType' = 'SalesItemLineDetail'
)

select
    credit_memo_id,
    _airbyte_extracted_at,
    _airbyte_generation_id,
    line_number,
    coalesce(line_id, line_number::text) as line_id,
    detail_type,
    amount,
    description,
    item_id,
    item_account_id,
    tax_code_id,
    quantity,
    unit_price,
    credit_memo_id || ':' || coalesce(line_id, line_number::text) as line_source_record_id
from sales_item
union all
select
    credit_memo_id,
    _airbyte_extracted_at,
    _airbyte_generation_id,
    line_number,
    coalesce(line_id, line_number::text) as line_id,
    detail_type,
    amount,
    description,
    item_id,
    item_account_id,
    tax_code_id,
    quantity,
    unit_price,
    credit_memo_id || ':' || coalesce(line_id, line_number::text) as line_source_record_id
from discount
union all
select
    credit_memo_id,
    _airbyte_extracted_at,
    _airbyte_generation_id,
    line_number,
    coalesce(line_id, line_number::text) as line_id,
    detail_type,
    amount,
    description,
    item_id,
    item_account_id,
    tax_code_id,
    quantity,
    unit_price,
    credit_memo_id || ':' || coalesce(line_id, line_number::text) as line_source_record_id
from group_sales
