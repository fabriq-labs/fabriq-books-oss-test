-- Cast utility macros for type conversions

{% macro safe_cast_float(field) %}
    -- Safely cast to float, returning null if not numeric
    case
        when {{ field }} ~ '^[0-9]+(\.[0-9]+)?$' then {{ field }}::float
        else null
    end
{% endmacro %}

{% macro safe_cast_timestamp(field) %}
    -- Safely cast to timestamp, handling multiple formats
    case
        when {{ field }} is null or {{ field }} = '' or {{ field }} = 'null' then null
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

{% macro parse_qbo_date(field) %}
    -- Parse QuickBooks Online date field (ISO 8601 format)
    {{ safe_cast_timestamp(field) }}
{% endmacro %}


