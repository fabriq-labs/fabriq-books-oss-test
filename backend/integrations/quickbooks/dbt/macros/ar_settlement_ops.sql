-- Phase 3 settlement ops: resolve delayed FKs, orphan sweep, void app cleanup.
-- Wired via on-run-end in dbt_project.yml. Sweeps only parents present in staging.

{% macro _datalake_relation(identifier) %}
  {%- set rel = adapter.get_relation(
        database=target.database,
        schema='datalake',
        identifier=identifier
      ) -%}
  {{ return(rel) }}
{% endmacro %}

{% macro resolve_settlement_fks() %}
  update public.payment_receipt_application pra
  set invoice_id = inv.id
  from public.invoice inv
  where pra.org_id = '{{ var("org_id") }}'
    and pra.invoice_id is null
    and pra.target_type = 'invoice'
    and pra.target_source_record_id is not null
    and inv.source_record_id = pra.target_source_record_id
    and inv.source_system_id = pra.source_system_id
    and inv.org_id = pra.org_id;

  update public.payment_receipt_application pra
  set credit_note_id = cn.id
  from public.credit_note cn
  where pra.org_id = '{{ var("org_id") }}'
    and pra.credit_note_id is null
    and pra.target_type = 'credit_note'
    and pra.target_source_record_id is not null
    and cn.source_record_id = pra.target_source_record_id
    and cn.source_system_id = pra.source_system_id
    and cn.org_id = pra.org_id;
{% endmacro %}

{% macro orphan_sweep_payment_applications() %}
  {%- set payments = _datalake_relation('stg_qbo_payments') -%}
  {%- set lines = _datalake_relation('stg_qbo_payment_lines') -%}
  {%- if payments is none or lines is none -%}
    {{ log('orphan_sweep_payment_applications: skip (staging missing)', info=True) }}
  {%- else -%}
  {# Only parents present in staging — avoid wiping apps when payments stream empty #}
  delete from public.payment_receipt_application pra
  where pra.org_id = '{{ var("org_id") }}'
    and pra.source_record_id is not null
    and exists (
      select 1
      from public.payment_receipt pr
      inner join {{ payments }} stg_p
        on stg_p.payment_id::text = pr.source_record_id
      where pr.id = pra.payment_receipt_id
        and pr.org_id = pra.org_id
        and pr.source_system_id = pra.source_system_id
    )
    and not exists (
      select 1
      from {{ lines }} stg
      where stg.application_source_record_id = pra.source_record_id
    );
  {%- endif -%}
{% endmacro %}

{% macro orphan_sweep_credit_note_items() %}
  {%- set headers = _datalake_relation('stg_qbo_credit_memos') -%}
  {%- set lines = _datalake_relation('stg_qbo_credit_memo_lines') -%}
  {%- if headers is none or lines is none -%}
    {{ log('orphan_sweep_credit_note_items: skip (staging missing)', info=True) }}
  {%- else -%}
  delete from public.credit_note_item cni
  where cni.org_id = '{{ var("org_id") }}'
    and cni.source_record_id is not null
    and exists (
      select 1
      from public.credit_note cn
      inner join {{ headers }} stg_h
        on stg_h.credit_memo_id::text = cn.source_record_id
      where cn.id = cni.credit_note_id
        and cn.org_id = cni.org_id
        and cn.source_system_id = cni.source_system_id
    )
    and not exists (
      select 1
      from {{ lines }} stg
      where stg.line_source_record_id = cni.source_record_id
    );
  {%- endif -%}
{% endmacro %}

{% macro sweep_voided_receipt_applications() %}
  delete from public.payment_receipt_application pra
  using public.payment_receipt pr
  where pra.payment_receipt_id = pr.id
    and pr.org_id = '{{ var("org_id") }}'
    and pr.status = 'void';
{% endmacro %}

{% macro ar_settlement_on_run_end() %}
  {{ resolve_settlement_fks() }}
  {{ orphan_sweep_payment_applications() }}
  {{ orphan_sweep_credit_note_items() }}
  {{ sweep_voided_receipt_applications() }}
{% endmacro %}
