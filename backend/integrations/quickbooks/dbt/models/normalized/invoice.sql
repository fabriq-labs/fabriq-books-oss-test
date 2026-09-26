-- Normalized invoice model for QuickBooks Online
-- Maps QuickBooks invoices (sales) to public.invoice
-- Unique key / merge strategy inherited from dbt_project.yml normalized defaults
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
    -- Core invoice fields. Prisma generates id on insert; merge matches lineage keys.
    case
        when stg.invoice_number is not null
         and trim(stg.invoice_number::text) != ''
         and upper(trim(stg.invoice_number::text)) != 'NULL'
         and trim(stg.invoice_number::text) != 'NA'
        then trim(stg.invoice_number::text)
        else 'INV-' || stg.invoice_id::text
    end as invoice_number,
    -- TxnDate is already a date column from Airbyte (not text) — cast directly
    coalesce(stg.txn_date::timestamp, now()) as invoice_date,
    1::integer as invoice_version,
    case
        when coalesce(stg.balance, 0) = 0 and coalesce(stg.total_amt, 0) > 0 then 'Paid'
        when coalesce(stg.balance, 0) > 0
             and coalesce(stg.balance, 0) < coalesce(stg.total_amt, 0) then 'Partial'
        else 'Open'
    end as invoice_status,
    'SALES' as invoice_type,
    null as po_mode,
    null as transaction_type,

    -- Parties / FKs
    null as supplier_id,
    null as supplier_name,
    null as attach,
    null as supplier_remarks,
    null as shipping_terms,
    null as shipping_method,
    pt.id as payment_terms_id,
    null as remit_to,
    null as wf_instance_id,
    -- Sales invoices: BillAddr → bill_to (billing / customer address on the form)
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
    -- ShipAddr → deliver_to; fall back to bill address when QBO has no ship addr
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
    ) as deliver_to,
    null as requester_name,
    null as requester_email,
    null as ap_comment,
    null as po_number,
    null as account_id,

    -- Amounts from QBO only (TotalAmt, Balance, TxnTaxDetail.TotalTax) — no recalculation
    null::double precision as additional_tax,
    null::double precision as shipping_cost,
    null::double precision as tax_on_shipping,
    null::double precision as handling_cost,
    null::double precision as tax_on_handling,
    null::double precision as misc_cost,
    null::double precision as tax_on_misc,
    stg.total_amt::double precision as invoice_net_total,
    null::double precision as shipping_handling_misc_total,
    stg.total_amt::double precision as invoice_total,
    stg.balance::double precision as balance_amount,
    stg.tax_total::double precision as tax_total,

    -- Related docs
    null as purchase_order_id,
    -- Sales list filters by selected legal entity; assign HQ so synced invoices appear in UI
    coalesce(le.id, '{{ var("org_id") }}') as legal_entity_id,
    null as purchase_order_item_id,
    null as sales_order_id,
    null as name,
    case
        when coalesce(stg.balance, 0) = 0 and coalesce(stg.total_amt, 0) > 0 then 'Paid'
        when coalesce(stg.balance, 0) > 0
             and coalesce(stg.balance, 0) < coalesce(stg.total_amt, 0) then 'Partial'
        else 'Open'
    end as status,

    -- Audit / tenancy
    null as created_by,
    {{ parse_qbo_date('stg.create_time') }} as created_at,
    null as modified_by,
    {{ parse_qbo_date('stg.last_updated_time') }} as modified_at,
    '{{ var("org_id") }}' as org_id,
    null as assigned_to,
    -- Sales form requires location_id; bill-to UI is driven from this location (BillAddr)
    loc.id as location_id,
    c.id as customer_id,
    null as terms_and_conditions,
    stg.private_note as notes,
    null as tax_region_id,
    null as seller_tax_region_id,
    null as tax_responsibility,
    cur.id as currency_id,
    coalesce(stg.exchange_rate, 1)::double precision as exchange_rate,

    -- Lineage
    ss.id as source_system_id,
    stg.invoice_id as source_record_id,
    {{ parse_qbo_date('stg.last_updated_time') }} as source_updated_at,
    sb.id as ingest_batch_id

from {{ ref('stg_qbo_invoices') }} stg
-- Join to sync_batch (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from {{ ref('sync_batch') }}
    where airbyte_job_id = stg._airbyte_generation_id::text
      and stream_name = 'invoices'
    order by id, created_at desc
    limit 1
) sb on true
-- Join to source_system (with DISTINCT ON to prevent duplicates)
left join lateral (
    select distinct on (id) *
    from public.source_system
    where system_type = 'quickbooks'
      and is_active = true
    order by id, created_at desc
    limit 1
) ss on true
-- HQ legal entity for this tenant (Sales → Invoices filters by current entity)
left join lateral (
    select e.id
    from public.entity e
    where e.org_id = '{{ var("org_id") }}'
      and lower(trim(coalesce(e.is_it_headquartres::text, ''))) in ('yes', 'true', '1')
    order by e.id
    limit 1
) le on true
-- Join to customers table to populate customer_id FK
left join public.customers c
    on c.source_record_id = stg.customer_id
    and c.source_system_id = ss.id
    and c.org_id = '{{ var("org_id") }}'
-- BillAddr location created by normalized/location.sql (deterministic id)
left join public.location loc
    on loc.id = ('loca_' || md5(concat(
        '{{ var("org_id") }}',
        '_qb_',
        coalesce(stg.customer_id, 'nocust'),
        '_',
        coalesce(stg.billing_address_line1, ''),
        '_',
        coalesce(stg.billing_city, ''),
        '_',
        coalesce(stg.billing_postal_code, '')
    )))
    and loc.org_id = '{{ var("org_id") }}'
-- Currency from CurrencyRef.value (e.g. USD)
left join public.currency cur
    on upper(cur.code) = upper(coalesce(stg.currency_code, ''))
-- Payment terms: SalesTermRef.name (e.g. Net 30), else match days between DueDate and TxnDate
left join lateral (
    select pt.id
    from public.payment_terms pt
    where pt.org_id = '{{ var("org_id") }}'
      and (
        (
            stg.sales_term_name is not null
            and trim(stg.sales_term_name) != ''
            and lower(trim(pt.payment_terms)) = lower(trim(stg.sales_term_name))
        )
        or (
            (stg.sales_term_name is null or trim(stg.sales_term_name) = '')
            and stg.due_date is not null
            and stg.txn_date is not null
            and pt.no_of_days = (stg.due_date - stg.txn_date)
        )
      )
    order by
        case
            when stg.sales_term_name is not null
             and lower(trim(pt.payment_terms)) = lower(trim(stg.sales_term_name))
            then 0 else 1
        end,
        case
            when (stg.due_date - stg.txn_date) = 0
             and lower(trim(pt.payment_terms)) = 'due on receipt'
            then 0
            when (stg.due_date - stg.txn_date) > 0
             and lower(trim(pt.payment_terms)) like 'net %'
            then 0
            else 1
        end,
        pt.id
    limit 1
) pt on true

-- Only process records that have a corresponding batch
where sb.id is not null

{% if is_incremental() and not var('force_process_all', false) %}
-- Incremental logic: only insert/update new or changed records
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
