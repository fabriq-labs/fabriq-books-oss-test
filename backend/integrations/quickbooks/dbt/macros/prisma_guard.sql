{# Prisma owns public.* tables. Normalized models may MERGE only — never CREATE/ALTER/DROP.
   dbt-postgres widens varchar via SQLAdapter.expand_column_types → alter_column_type,
   which ADD/copy/DROP COLUMN CASCADE/RENAME. That destroyed Prisma PKs and FKs.

   expand_target_column_types always runs (even with on_schema_change=ignore).
   Skip public ALTER instead of failing the run.

   ignore returns no column list, so vanilla merge would INSERT every dest column
   (including id). Intersect with the temp SELECT so Prisma defaults apply. #}

{% macro _is_public_relation(relation) %}
  {{ return((relation.schema | lower) == 'public') }}
{% endmacro %}

{% macro _refuse_public_ddl(relation, action) %}
  {% if _is_public_relation(relation) %}
    {{ exceptions.raise_compiler_error(
      "Refusing to " ~ action ~ " on " ~ relation
      ~ ". Prisma owns public table schema; dbt may MERGE only. Align the model SELECT with Prisma."
    ) }}
  {% endif %}
{% endmacro %}

{% macro postgres__expand_target_column_types(from_relation, to_relation) %}
{% endmacro %}

{% macro postgres__alter_column_type(relation, column_name, new_column_type) %}
  {% if _is_public_relation(relation) %}
    {% do log(
      "Skipping ALTER COLUMN " ~ column_name ~ " to " ~ new_column_type
      ~ " on " ~ relation ~ " (Prisma-owned; merge-only)",
      info=True
    ) %}
    {{ return('') }}
  {% endif %}
  {%- set tmp_column = column_name + "__dbt_alter" -%}
  {% call statement('alter_column_type') %}
    alter table {{ relation }} add column {{ adapter.quote(tmp_column) }} {{ new_column_type }};
    update {{ relation }} set {{ adapter.quote(tmp_column) }} = {{ adapter.quote(column_name) }};
    alter table {{ relation }} drop column {{ adapter.quote(column_name) }} cascade;
    alter table {{ relation }} rename column {{ adapter.quote(tmp_column) }} to {{ adapter.quote(column_name) }}
  {% endcall %}
{% endmacro %}

{% macro postgres__alter_relation_add_remove_columns(relation, add_columns, remove_columns) %}
  {{ _refuse_public_ddl(relation, "ADD/DROP columns") }}
  {% if add_columns is none %}
    {% set add_columns = [] %}
  {% endif %}
  {% if remove_columns is none %}
    {% set remove_columns = [] %}
  {% endif %}
  {% set sql -%}
    alter {{ relation.type }} {{ relation }}
    {% for column in add_columns %}
      add column {{ column.name }} {{ column.data_type }}{{ ',' if not loop.last }}
    {% endfor %}{{ ',' if add_columns and remove_columns }}
    {% for column in remove_columns %}
      drop column {{ column.name }}{{ ',' if not loop.last }}
    {% endfor %}
  {%- endset -%}
  {% do run_query(sql) %}
{% endmacro %}

{% macro prisma_merge_columns(dest_columns, source_relation) %}
  {% set source_names = adapter.get_columns_in_relation(source_relation)
      | map(attribute='name') | map('lower') | list %}
  {% set cols = [] %}
  {% for col in dest_columns %}
    {% if (col.name | lower) in source_names %}
      {% do cols.append(col) %}
    {% endif %}
  {% endfor %}
  {{ return(cols) }}
{% endmacro %}

{% macro postgres__get_merge_sql(target, source, unique_key, dest_columns, incremental_predicates=none) %}
  {% set merge_columns = prisma_merge_columns(dest_columns, source) %}
  {{ return(default__get_merge_sql(target, source, unique_key, merge_columns, incremental_predicates)) }}
{% endmacro %}

{% macro assert_prisma_relation_exists() %}
do $assert$
begin
  if to_regclass('{{ this.schema }}.{{ this.identifier }}') is null then
    raise exception 'dbt will not create %.% — Prisma owns this table. Create it via Prisma first.',
      '{{ this.schema }}', '{{ this.identifier }}';
  end if;
end
$assert$;
{% endmacro %}
