-- Normalized item_master model for QuickBooks Online
-- Maps QuickBooks items to public.item_master
-- QBO UI fields: Name, Type, Sku→item_code, Description, UnitPrice,
-- IncomeAccount→sales_account_id, ExpenseAccount→purchase_account_id,
-- PrefVendor→supplier_id/preferred_supplier, SalesTaxCode→item_tax_category
-- depends_on: {{ ref('account') }}
-- depends_on: {{ ref('supplier') }}

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
    -- Prisma generates id on insert; merge matches lineage keys.

    -- SKU → item_code (unique, nullable, max 20 chars in Prisma)
    case
        when stg.sku is not null
         and trim(stg.sku::text) != ''
        then left(trim(stg.sku::text), 20)
        else null
    end as item_code,

    coalesce(stg.name, '') as item_name,
    coalesce(stg.name, '') as name,
    null as item_shortname,
    coalesce(stg.description, coalesce(stg.name, '')) as item_description,
    -- QBO: Inventory / NonInventory / Service → Fabriq form: Goods / Services
    case
        when lower(coalesce(stg.item_type, '')) in ('service', 'services') then 'Services'
        when lower(coalesce(stg.item_type, '')) in ('inventory', 'noninventory', 'non-inventory', 'goods') then 'Goods'
        else coalesce(nullif(trim(stg.item_type), ''), 'Goods')
    end as item_type,
    coalesce(stg.unit_price, 0)::double precision as unit_price,
    case
        when stg.item_type = 'Inventory' and coalesce(stg.track_qty_on_hand, false) then 'Y'
        else 'N'
    end as stockable,
    case
        when coalesce(stg.active, true) then 'active'
        else 'inactive'
    end as item_status,

    -- Income account → sales_account_id (synced Chart of Accounts)
    sa.id as sales_account_id,
    -- Expense account → purchase_account_id
    pa.id as purchase_account_id,

    -- Preferred vendor
    vend.id as supplier_id,
    coalesce(stg.preferred_vendor_name, vend.supplier_name) as preferred_supplier,

    -- Sales tax category label from QBO (e.g. "Taxable - standard rate")
    nullif(trim(coalesce(stg.sales_tax_code_name, '')), '') as item_tax_category,

    -- Timestamps
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,

    -- Multi-tenancy
    '{{ var("org_id") }}' as org_id,

    -- Lineage fields
    ss.id as source_system_id,
    stg.item_id as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id,

    -- Optional / not mapped from QBO (no matching Fabriq columns: purchase_cost, purchase_description)
    null as created_by,
    null as modified_by,
    null as assigned_to,
    null as uom_id,
    null::double precision as lead_time,
    null::timestamp as expiry_date,
    null as search_keywords,
    null as product_id,
    null as item_category_id,
    null as tax_master_id,
    null as tax_rate_intra_id

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
    order by id, created_at desc
    limit 1
) ss on true
-- Income account (must already be synced)
left join public.account sa
    on sa.source_record_id = stg.income_account_id
    and sa.source_system_id = ss.id
    and sa.org_id = '{{ var("org_id") }}'
-- Expense account
left join public.account pa
    on pa.source_record_id = stg.expense_account_id
    and pa.source_system_id = ss.id
    and pa.org_id = '{{ var("org_id") }}'
-- Preferred vendor (must already be synced as supplier)
left join public.supplier vend
    on vend.source_record_id = stg.preferred_vendor_id
    and vend.source_system_id = ss.id
    and vend.org_id = '{{ var("org_id") }}'

where sb.id is not null
  and coalesce(stg.active, true) = true

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
