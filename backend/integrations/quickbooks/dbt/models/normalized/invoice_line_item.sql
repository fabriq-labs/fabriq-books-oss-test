-- Normalized invoice_line_item for QuickBooks Online → public.invoice_line_item
-- depends_on: {{ ref('invoice') }}
-- depends_on: {{ ref('item_master') }}
-- depends_on: {{ ref('tax_group') }}

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
    inv.id as invoice_id,
    coalesce(stg.line_num, 1)::integer as line_number,
    im.id as item_master_id,
    stg.description as description,
    coalesce(stg.qty, 1)::numeric(19, 4) as quantity,
    coalesce(stg.unit_price, 0)::numeric(19, 4) as unit_price,
    null::numeric(9, 6) as discount_rate,
    null::numeric(19, 4) as discount_amount,
    coalesce(stg.amount, 0)::numeric(19, 4) as amount,
    null as account_id,
    tg.id as tax_group_id,
    null as classification_code,
    null as classification_scheme,

    null as created_by,
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    null as modified_by,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    '{{ var("org_id") }}' as org_id,

    ss.id as source_system_id,
    (stg.invoice_id::text || ':' || coalesce(stg.line_id::text, stg.line_num::text, '0')) as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    inv.ingest_batch_id as ingest_batch_id

from {{ ref('stg_qbo_invoice_line_items') }} stg
inner join public.invoice inv
    on inv.source_record_id = stg.invoice_id::text
    and inv.org_id = '{{ var("org_id") }}'
    and inv.direction = 'sales'
inner join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
      and org_id = '{{ var("org_id") }}'
    order by id, created_at desc
    limit 1
) ss on inv.source_system_id = ss.id
left join public.item_master im
    on im.source_record_id = stg.item_id::text
    and im.source_system_id = ss.id
    and im.org_id = '{{ var("org_id") }}'
left join public.tax_group tg
    on tg.org_id = '{{ var("org_id") }}'
    and stg.tax_code is not null
    and trim(stg.tax_code) != ''
    and upper(stg.tax_code) not in ('TAX', 'NON')
    and (
        tg.source_record_id = stg.tax_code::text
        or tg.code = ('qbo_code_' || stg.tax_code::text)
    )

where stg.line_id is not null
   or stg.line_num is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
