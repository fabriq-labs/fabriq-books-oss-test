-- Staging: QuickBooks Online payments (Airbyte → datalake.qb_payments)

{{
  config(
    materialized='view',
    schema='datalake'
  )
}}

select
    _airbyte_raw_id as airbyte_raw_id,
    _airbyte_extracted_at,
    _airbyte_generation_id,
    _airbyte_meta,

    "Id" as payment_id,
    -- Airbyte QBO Payment stream often omits DocNumber; fall back in normalized model.
    null::text as doc_number,
    "TxnDate" as txn_date,
    "TotalAmt" as total_amt,
    "UnappliedAmt" as unapplied_amt,
    "PrivateNote" as private_note,
    "PaymentRefNum" as payment_ref_num,
    "ExchangeRate" as exchange_rate,

    "CustomerRef"->>'value' as customer_id,
    "CustomerRef"->>'name' as customer_name,
    "DepositToAccountRef"->>'value' as deposit_account_id,
    "DepositToAccountRef"->>'name' as deposit_account_name,
    "ARAccountRef"->>'value' as ar_account_id,
    "ARAccountRef"->>'name' as ar_account_name,
    "PaymentMethodRef"->>'value' as payment_method_id,
    "PaymentMethodRef"->>'name' as payment_method_name,
    "CurrencyRef"->>'value' as currency_code,

    "Line" as line_items,

    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time

from {{ source('datalake', 'qb_payments') }}
