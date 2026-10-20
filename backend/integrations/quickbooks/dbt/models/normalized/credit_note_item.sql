-- QBO CreditMemo lines → public.credit_note_item
-- depends_on: {{ ref('credit_note') }}
-- depends_on: {{ ref('item_master') }}
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
    cn.id as credit_note_id,
    coalesce(stg.line_number, 1)::int as line_number,
    im.id as item_master_id,
    null::text as invoice_line_item_id,
    stg.description,
    coalesce(stg.quantity, 1)::numeric(19, 4) as quantity,
    coalesce(stg.unit_price, 0)::numeric(19, 4) as unit_price,
    null::numeric(9, 6) as discount_rate,
    null::numeric(19, 4) as discount_amount,
    coalesce(stg.amount, 0)::numeric(19, 4) as amount,
    acct.id as account_id,
    tg.id as tax_group_id,
    null as classification_code,
    null as classification_scheme,

    null as created_by,
    now() as created_at,
    null as modified_by,
    now() as modified_at,
    '{{ var("org_id") }}' as org_id,

    ss.id as source_system_id,
    stg.line_source_record_id as source_record_id,
    stg._airbyte_extracted_at::timestamp as source_updated_at,
    sb.id as ingest_batch_id

from {{ ref('stg_qbo_credit_memo_lines') }} stg
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
inner join public.credit_note cn
    on cn.source_record_id = stg.credit_memo_id::text
    and cn.source_system_id = ss.id
    and cn.org_id = '{{ var("org_id") }}'
left join public.item_master im
    on im.source_record_id = stg.item_id::text
    and im.source_system_id = ss.id
    and im.org_id = '{{ var("org_id") }}'
left join public.account acct
    on acct.source_record_id = stg.item_account_id::text
    and acct.source_system_id = ss.id
    and acct.org_id = '{{ var("org_id") }}'
left join public.tax_group tg
    on tg.source_record_id = stg.tax_code_id::text
    and tg.source_system_id = ss.id
    and tg.org_id = '{{ var("org_id") }}'

where sb.id is not null
  and cn.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or stg._airbyte_extracted_at::timestamp > (select max(source_updated_at) from {{ this }})
)
{% endif %}
