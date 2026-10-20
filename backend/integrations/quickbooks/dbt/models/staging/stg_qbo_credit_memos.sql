-- Staging: QuickBooks Online credit memos (Airbyte → datalake.qb_credit_memos)

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

    "Id" as credit_memo_id,
    "DocNumber" as doc_number,
    "TxnDate" as txn_date,
    "TotalAmt" as total_amt,
    "Balance" as balance,
    "RemainingCredit" as remaining_credit,
    "PrivateNote" as private_note,
    "ExchangeRate" as exchange_rate,

    "CustomerRef"->>'value' as customer_id,
    "CustomerRef"->>'name' as customer_name,
    "CurrencyRef"->>'value' as currency_code,

    "BillAddr"->>'Line1' as billing_address_line1,
    "BillAddr"->>'City' as billing_city,
    "BillAddr"->>'CountrySubDivisionCode' as billing_state,
    "BillAddr"->>'PostalCode' as billing_postal_code,
    "BillAddr"->>'Country' as billing_country,

    nullif("TxnTaxDetail"->>'TotalTax', '')::double precision as tax_total,
    "Line" as line_items,

    "MetaData"->>'LastUpdatedTime' as last_updated_time,
    "MetaData"->>'CreateTime' as create_time

from {{ source('datalake', 'qb_credit_memos') }}
