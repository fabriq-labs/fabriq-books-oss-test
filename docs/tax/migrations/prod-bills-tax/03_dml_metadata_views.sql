-- =============================================================================
-- prod-bills-tax / 03_dml_metadata_views.sql
-- Patch view.data_graph so APIs expose new columns (idempotent key checks).
-- Prefer also deploying updated view JSON via normal metadata sync after code deploy.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- supplier_view + supplierFullAccess: tax_treatment, default_tax_region_id, relation
-- -----------------------------------------------------------------------------
UPDATE view
SET
  data_graph = COALESCE(data_graph, '{}'::jsonb) || jsonb_build_object(
    'tax_treatment', jsonb_build_object(
      'required', false,
      'permission', 'update',
      'tableProps', jsonb_build_object(
        'width', '200',
        'columnType', 'text',
        'defaultValue', ''
      ),
      'displayName', 'Tax Treatment',
      'isColumnShow', true
    ),
    'default_tax_region_id', jsonb_build_object(
      'datatype', 'string',
      'permission', 'update',
      'tableProps', jsonb_build_object(
        'columnType', 'select',
        'selectProps', jsonb_build_object(
          'type', 'tax_region',
          'limit', '20',
          'instanceKey', 'id',
          'instanceType', 'tax_region',
          'searchParams', 'name',
          'instanceLabel', 'name',
          'instanceSourceKey', 'default_tax_region_id'
        ),
        'defaultValue', ''
      ),
      'listProps', jsonb_build_object(
        'type', 'text',
        'recordPath', 'default_tax_region.name'
      ),
      'displayName', 'Default Tax Region',
      'isColumnShow', true
    ),
    'default_tax_region', jsonb_build_object(
      'type', 'table',
      'select', jsonb_build_object(
        'id', 'read',
        'code', 'read',
        'name', 'read',
        'country_code', 'read'
      )
    )
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE model_name = 'supplier'
  AND name IN ('supplier_view', 'supplierFullAccess')
  AND (data_graph -> 'tax_treatment') IS NULL;

-- -----------------------------------------------------------------------------
-- invoice_view: supplier_id + supplier relation (nested tax fields)
-- -----------------------------------------------------------------------------
UPDATE view
SET
  data_graph = COALESCE(data_graph, '{}'::jsonb) || jsonb_build_object(
    'supplier_id', jsonb_build_object(
      'datatype', 'string',
      'permission', 'update',
      'tableProps', jsonb_build_object(
        'columnType', 'select',
        'selectProps', jsonb_build_object(
          'type', 'invoice',
          'limit', '10',
          'instanceKey', 'id',
          'instanceType', 'supplier',
          'searchParams', 'supplier_name',
          'instanceLabel', 'supplier_name',
          'instanceSourceKey', 'supplier_id'
        ),
        'defaultValue', ''
      ),
      'listProps', jsonb_build_object(
        'type', 'text',
        'recordPath', 'supplier.supplier_name'
      ),
      'displayName', 'Supplier',
      'isColumnShow', true
    ),
    'supplier', jsonb_build_object(
      'type', 'table',
      'select', jsonb_build_object(
        'id', 'read',
        'supplier_name', 'read',
        'legal_name', 'read',
        'primary_email', 'read',
        'primary_phone', 'read',
        'preferred_currency_id', 'read',
        'tax_treatment', 'read',
        'default_tax_region_id', 'read',
        'default_tax_region', jsonb_build_object(
          'type', 'table',
          'select', jsonb_build_object(
            'id', 'read',
            'code', 'read',
            'name', 'read'
          )
        ),
        'currency', jsonb_build_object(
          'type', 'table',
          'select', jsonb_build_object(
            'id', 'read',
            'code', 'read'
          )
        )
      )
    )
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE name = 'invoice_view'
  AND model_name = 'invoice'
  AND (data_graph -> 'supplier_id') IS NULL;

-- -----------------------------------------------------------------------------
-- invoice_view: po_mode
-- -----------------------------------------------------------------------------
UPDATE view
SET
  data_graph = COALESCE(data_graph, '{}'::jsonb) || jsonb_build_object(
    'po_mode', jsonb_build_object(
      'dataType', 'string',
      'permission', 'update',
      'displayName', 'PO Mode',
      'isColumnShow', false
    )
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE name = 'invoice_view'
  AND model_name = 'invoice'
  AND (data_graph -> 'po_mode') IS NULL;

-- Soften invoice_type display name → Invoice Class
UPDATE view
SET
  data_graph = jsonb_set(
    COALESCE(data_graph, '{}'::jsonb),
    '{invoice_type,displayName}',
    '"Invoice Class"'::jsonb,
    true
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE name = 'invoice_view'
  AND model_name = 'invoice'
  AND data_graph ? 'invoice_type';

COMMIT;

SELECT name, model_name,
       (data_graph ? 'tax_treatment') AS tax_treatment,
       (data_graph ? 'default_tax_region_id') AS default_tax_region_id,
       (data_graph ? 'supplier_id') AS supplier_id,
       (data_graph ? 'po_mode') AS po_mode,
       data_graph -> 'invoice_type' ->> 'displayName' AS invoice_type_label
FROM view
WHERE (model_name = 'supplier' AND name IN ('supplier_view', 'supplierFullAccess'))
   OR (model_name = 'invoice' AND name = 'invoice_view')
ORDER BY model_name, name;
