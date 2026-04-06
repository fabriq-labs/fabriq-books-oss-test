-- Override generate_schema_name to use custom_schema directly
-- This prevents DBT from prefixing with profile schema (e.g., "public_datalake" instead of "datalake")

{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name }}
    {%- endif -%}
{%- endmacro %}

