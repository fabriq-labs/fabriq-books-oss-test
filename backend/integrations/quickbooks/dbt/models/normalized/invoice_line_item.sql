-- Normalized invoice_line_item for QuickBooks Online
-- Unnests SalesItemLineDetail from qb_invoices.Line into public.invoice_line_item
-- Pass-through only: QBO already computed amounts/tax. No Fabriq recalculation.
-- No lineage columns on this Prisma table — use deterministic id for merge
-- depends_on: {{ ref('invoice') }}

{{
  config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key=['id'],
    on_schema_change='ignore',
    full_refresh=false
  )
}}

select
    -- Deterministic id so re-syncs merge instead of duplicating
    ('in_item__' || md5(concat(
        '{{ var("org_id") }}',
        '_qb_',
        stg.invoice_id::text,
        '_',
        coalesce(stg.line_id::text, stg.line_num::text, '0')
    )))::varchar(50) as id,

    coalesce(stg.item_name, stg.description, 'Line item') as item_name,
    coalesce(stg.item_id, stg.line_id)::text as item_number,
    stg.description as item_description,
    im.item_type as item_type,

    -- QBO SalesItemLineDetail fields only (no amount/qty derivation)
    stg.unit_price::double precision as rate,
    stg.qty::double precision as ordered_quantity,
    stg.amount::double precision as ordered_amount,
    stg.qty::integer as invoice_qty,
    stg.amount::double precision as line_total,
    stg.amount::double precision as invoiced_amount,

    -- Tax: TaxCodeRef + QBO TaxPercent on taxable lines (no line tax amount math)
    stg.tax_code as tax_type,
    case
        when upper(coalesce(stg.tax_code, '')) = 'TAX'
             and coalesce(stg.invoice_tax_percent, 0) > 0
        then stg.invoice_tax_percent
        else null
    end::double precision as tax_rate,
    case
        when upper(coalesce(stg.tax_code, '')) = 'TAX'
             and coalesce(stg.invoice_tax_percent, 0) > 0
        then stg.invoice_tax_percent
        else null
    end::double precision as tax_rate_intra,
    null::double precision as line_tax_amount,
    null as tax_group_id,
    null as classification_code,
    null as classification_scheme,
    null::double precision as taxable_amount,

    null as po_number,
    null as purchase_order_item_id,
    im.id as item_master_id,
    inv.id as instance_id,
    null as purchase_requisition_id,

    coalesce(stg.item_name, stg.description) as name,
    null as created_by,
    null::timestamp as need_by_date,
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    null as modified_by,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    '{{ var("org_id") }}' as org_id,
    null as assigned_to,
    null::double precision as discount_rate,
    null::double precision as discount_amount

from {{ ref('stg_qbo_invoice_line_items') }} stg
-- Parent invoice must already be normalized (same org + QBO source_record_id)
inner join public.invoice inv
    on inv.source_record_id = stg.invoice_id
    and inv.org_id = '{{ var("org_id") }}'
    and inv.invoice_type = 'SALES'
inner join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on inv.source_system_id = ss.id
left join public.item_master im
    on im.source_record_id = stg.item_id
    and im.source_system_id = ss.id
    and im.org_id = '{{ var("org_id") }}'

where stg.line_id is not null
  or stg.line_num is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(modified_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(modified_at) from {{ this }})
)
{% endif %}
