-- Override generate_schema_name to fix DBT 1.2.2 custom_schema concatenation issue
-- When custom_schema is specified, use it directly instead of prefixing with profile schema
-- This prevents "public_datalake" instead of "datalake" issue

{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name }}
    {%- endif -%}
{%- endmacro %}

