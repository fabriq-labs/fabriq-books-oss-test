-- Cast utility macros for type conversions

{% macro safe_cast_float(field) %}
    -- Safely cast to float, returning null if not numeric
    case
        when {{ field }} ~ '^[0-9]+(\.[0-9]+)?$' then {{ field }}::float
        else null
    end
{% endmacro %}

{% macro safe_cast_timestamp(field) %}
    -- Safely cast to timestamp, handling multiple formats including .NET JSON date
    -- .NET format: /Date(1419937200000+0000)/ (milliseconds since epoch)
    case
        when {{ field }} is null or {{ field }} = '' or {{ field }} = 'null' then null
        -- .NET JSON date format: /Date(1234567890000+0000)/
        when ({{ field }})::text ~ '^/Date\([0-9]+[\+\-][0-9]+\)/$' then
            to_timestamp(
                (regexp_replace(({{ field }})::text, '^/Date\(([0-9]+)[\+\-][0-9]+\)/$', '\1'))::bigint / 1000.0
            )
        -- ISO 8601 format with T separator
        when ({{ field }})::text ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}' then ({{ field }})::text::timestamp
        -- ISO 8601 with Z timezone
        when ({{ field }})::text ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z' then ({{ field }})::text::timestamp
        -- Standard datetime format with space
        when ({{ field }})::text ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}' then ({{ field }})::text::timestamp
        -- Date only format
        when ({{ field }})::text ~ '^\d{4}-\d{2}-\d{2}$' then ({{ field }})::text::date::timestamp
        else null
    end
{% endmacro %}

{% macro parse_xero_date(field) %}
    -- Parse Xero date field which may be in .NET JSON format or ISO format
    -- .NET format: /Date(1419937200000+0000)/ (milliseconds since epoch + timezone)
    {{ safe_cast_timestamp(field) }}
{% endmacro %}

{% macro extract_xero_phone(phones_json, phone_type) %}
    -- Extract phone number from Xero Phones JSONB array
    -- phone_type: 'DEFAULT', 'DDI', 'MOBILE', 'FAX'
    coalesce(
        (
            select p->>'PhoneNumber'
            from jsonb_array_elements({{ phones_json }}) p
            where p->>'PhoneType' = '{{ phone_type }}'
            limit 1
        ),
        ({{ phones_json }}->0->>'PhoneNumber')
    )
{% endmacro %}

{% macro extract_xero_address(addresses_json, address_type, field) %}
    -- Extract address field from Xero Addresses JSONB array
    -- address_type: 'STREET', 'POBOX'
    -- field: 'AddressLine1', 'City', 'Region', 'Country', 'PostalCode'
    coalesce(
        (
            select a->>'{{ field }}'
            from jsonb_array_elements({{ addresses_json }}) a
            where a->>'AddressType' = '{{ address_type }}'
            limit 1
        ),
        ({{ addresses_json }}->0->>'{{ field }}')
    )
{% endmacro %}

