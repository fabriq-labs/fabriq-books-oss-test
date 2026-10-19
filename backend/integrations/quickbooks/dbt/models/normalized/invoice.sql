-- Normalized invoice for QuickBooks Online → public.invoice (universal sales)
-- depends_on: {{ ref('location') }}
-- depends_on: {{ ref('customer') }}

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
        when stg.invoice_number is not null
         and trim(stg.invoice_number::text) != ''
         and upper(trim(stg.invoice_number::text)) != 'NULL'
         and trim(stg.invoice_number::text) != 'NA'
        then trim(stg.invoice_number::text)
        else 'INV-' || stg.invoice_id::text
    end as number,

    coalesce(stg.txn_date::timestamp, now()) as invoice_date,
    stg.due_date::timestamp as due_date,

    'sales'::invoice_direction as direction,

    -- Synced QBO invoices are treated as posted; void when Balance/Total imply cancelled is rare — park.
    'posted'::sales_document_status as status,

    c.id as customer_id,
    null as supplier_id,
    coalesce(le.id, null) as entity_id,
    loc.id as location_id,
    cur.id as currency_id,
    pt.id as payment_terms_id,
    coalesce(stg.exchange_rate, 1)::numeric(19, 6) as exchange_rate,

    -- Prefer net = total - tax when QBO tax total present; else park equal split smell.
    case
        when stg.tax_total is not null
        then (coalesce(stg.total_amt, 0) - coalesce(stg.tax_total, 0))::numeric(19, 4)
        else stg.total_amt::numeric(19, 4)
    end as net_amount,
    coalesce(stg.tax_total, 0)::numeric(19, 4) as tax_amount,
    null::numeric(19, 4) as shipping_amount,
    null::numeric(19, 4) as adjustment_amount,
    stg.total_amt::numeric(19, 4) as total_amount,
    stg.balance::numeric(19, 4) as balance_amount,

    null as tax_region_id,
    null as seller_tax_region_id,
    null as tax_responsibility,

    nullif(
        trim(concat_ws(', ',
            nullif(stg.billing_address_line1, ''),
            nullif(stg.billing_city, ''),
            nullif(stg.billing_state, ''),
            nullif(stg.billing_postal_code, ''),
            nullif(stg.billing_country, '')
        )),
        ''
    ) as bill_to,
    coalesce(
        nullif(
            trim(concat_ws(', ',
                nullif(stg.shipping_address_line1, ''),
                nullif(stg.shipping_city, ''),
                nullif(stg.shipping_state, ''),
                nullif(stg.shipping_postal_code, ''),
                nullif(stg.shipping_country, '')
            )),
            ''
        ),
        nullif(
            trim(concat_ws(', ',
                nullif(stg.billing_address_line1, ''),
                nullif(stg.billing_city, ''),
                nullif(stg.billing_state, ''),
                nullif(stg.billing_postal_code, ''),
                nullif(stg.billing_country, '')
            )),
            ''
        )
    ) as ship_to,

    stg.private_note as notes,
    null as reference,
    null as account_id,

    null as created_by,
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    null as modified_by,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    '{{ var("org_id") }}' as org_id,

    ss.id as source_system_id,
    stg.invoice_id::text as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id

from {{ ref('stg_qbo_invoices') }} stg
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'invoices'
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
left join lateral (
    select pt.id
    from public.payment_terms pt
    where pt.org_id = '{{ var("org_id") }}'
      and (
        (
            stg.sales_term_name is not null
            and trim(stg.sales_term_name) != ''
            and lower(trim(pt.name)) = lower(trim(stg.sales_term_name))
        )
        or (
            (stg.sales_term_name is null or trim(stg.sales_term_name) = '')
            and stg.due_date is not null
            and stg.txn_date is not null
            and pt.days = (stg.due_date - stg.txn_date)
        )
      )
    order by
        case
            when stg.sales_term_name is not null
             and lower(trim(pt.name)) = lower(trim(stg.sales_term_name))
            then 0 else 1
        end,
        pt.id
    limit 1
) pt on true

where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
