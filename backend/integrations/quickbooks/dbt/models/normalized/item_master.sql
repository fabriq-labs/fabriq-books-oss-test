-- Normalized item_master for QuickBooks Online → public.item_master
-- depends_on: {{ ref('account') }}
-- depends_on: {{ ref('supplier') }}
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
    case
        when stg.sku is not null and trim(stg.sku::text) != ''
        then left(trim(stg.sku::text), 50)
        else null
    end as code,

    coalesce(stg.name, '') as name,
    coalesce(stg.description, nullif(trim(stg.name), '')) as description,

    case
        when lower(coalesce(stg.item_type, '')) in ('service', 'services') then 'service'
        when lower(coalesce(stg.item_type, '')) in ('inventory', 'noninventory', 'non-inventory', 'goods') then 'goods'
        else lower(coalesce(nullif(trim(stg.item_type), ''), 'goods'))
    end as item_type,

    coalesce(stg.unit_price, 0)::numeric(19, 4) as unit_price,

    case
        when stg.item_type = 'Inventory' and coalesce(stg.track_qty_on_hand, false) then true
        else false
    end as is_stockable,

    coalesce(stg.active, true) as is_active,

    sa.id as sales_account_id,
    pa.id as purchase_account_id,
    vend.id as preferred_supplier_id,
    tg.id as tax_group_id,
    nullif(trim(coalesce(stg.sales_tax_code_name, '')), '') as item_tax_category,

    {{ parse_qbo_date('stg.create_time') }} as created_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,

    '{{ var("org_id") }}' as org_id,
    ss.id as source_system_id,
    stg.item_id::text as source_record_id,
    sb.id as ingest_batch_id,

    null as created_by,
    null as modified_by,
    null as uom_id,
    null as tax_master_id,
    null as classification_code,
    null as classification_scheme,
    null as currency_id

from {{ ref('stg_qbo_items') }} stg
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'items'
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
left join public.account sa
    on sa.source_record_id = stg.income_account_id::text
    and sa.source_system_id = ss.id
    and sa.org_id = '{{ var("org_id") }}'
left join public.account pa
    on pa.source_record_id = stg.expense_account_id::text
    and pa.source_system_id = ss.id
    and pa.org_id = '{{ var("org_id") }}'
left join public.supplier vend
    on vend.source_record_id = stg.preferred_vendor_id::text
    and vend.source_system_id = ss.id
    and vend.org_id = '{{ var("org_id") }}'
left join public.tax_group tg
    on tg.source_record_id = stg.sales_tax_code_id::text
    and tg.source_system_id = ss.id
    and tg.org_id = '{{ var("org_id") }}'

where sb.id is not null
  and coalesce(stg.active, true) = true

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
