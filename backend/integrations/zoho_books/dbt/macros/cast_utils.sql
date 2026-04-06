-- Cast utility macros for type conversions

{% macro safe_cast_float(field) %}
    -- Safely cast to float, returning null if not numeric
    case
        when {{ field }} ~ '^[0-9]+(\.[0-9]+)?$' then {{ field }}::float
        else null
    end
{% endmacro %}

{% macro safe_cast_timestamp(field) %}
    -- Safely cast to timestamp, returning null if invalid
    case
        when {{ field }} is not null and {{ field }} != '' then
            case
                when {{ field }} ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}' then {{ field }}::timestamp
                when {{ field }} ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}' then {{ field }}::timestamp
                else null
            end
        else null
    end
{% endmacro %}
