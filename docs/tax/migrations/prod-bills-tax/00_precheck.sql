-- =============================================================================
-- prod-bills-tax / 00_precheck.sql
-- Read-only. Run before DDL. Expect tax architecture (sales CA) already present.
-- =============================================================================

SELECT current_database() AS database,
       current_user AS db_user,
       now() AS checked_at;

-- Prerequisite tables from sales tax architecture
SELECT
  to_regclass('public.tax_region') IS NOT NULL AS has_tax_region,
  to_regclass('public.tax_group') IS NOT NULL AS has_tax_group,
  to_regclass('public.party_tax_registration') IS NOT NULL AS has_party_tax_registration,
  to_regclass('public.entity_tax_settings') IS NOT NULL AS has_entity_tax_settings;

-- Columns this pack will add (false = needs migration)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier' AND column_name = 'tax_treatment'
  ) AS supplier_tax_treatment,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier' AND column_name = 'default_tax_region_id'
  ) AS supplier_default_tax_region_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice' AND column_name = 'supplier_id'
  ) AS invoice_supplier_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice' AND column_name = 'po_mode'
  ) AS invoice_po_mode,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice' AND column_name = 'currency_id'
  ) AS invoice_currency_id;

-- Legacy bill classification still in invoice_type (will become po_mode)
SELECT invoice_type, count(*) AS n
FROM invoice
GROUP BY 1
ORDER BY 2 DESC;

SELECT count(*) AS legacy_po_literals_in_invoice_type
FROM invoice
WHERE invoice_type IN ('With PO', 'Without PO');

-- PO-linked bills that can receive supplier_id after 01_ddl + 02 backfill.
-- Do NOT reference invoice.supplier_id here — that column is added by 01_ddl.
SELECT count(*) AS po_linked_bills_eligible_for_supplier_id_backfill
FROM invoice i
JOIN purchase_order po ON po.id = i.purchase_order_id
WHERE po.supplier_id IS NOT NULL;

-- If invoice.supplier_id already exists (re-run), show how many still need backfill
DO $$
DECLARE
  n bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice' AND column_name = 'supplier_id'
  ) THEN
    EXECUTE $q$
      SELECT count(*) FROM invoice i
      JOIN purchase_order po ON po.id = i.purchase_order_id
      WHERE i.supplier_id IS NULL AND po.supplier_id IS NOT NULL
    $q$ INTO n;
    RAISE NOTICE 'bills_with_po_link_missing_supplier_id = %', n;
  ELSE
    RAISE NOTICE 'bills_with_po_link_missing_supplier_id = skipped (invoice.supplier_id not present yet — expected before 01_ddl)';
  END IF;
END $$;

-- Metadata views this pack patches
SELECT name, model_name,
       (data_graph ? 'tax_treatment') AS has_tax_treatment,
       (data_graph ? 'default_tax_region_id') AS has_default_tax_region_id
FROM view
WHERE model_name = 'supplier'
  AND name IN ('supplier_view', 'supplierFullAccess');

SELECT name,
       (data_graph ? 'supplier_id') AS has_supplier_id,
       (data_graph ? 'po_mode') AS has_po_mode,
       data_graph -> 'invoice_type' ->> 'displayName' AS invoice_type_label
FROM view
WHERE name = 'invoice_view' AND model_name = 'invoice';

SELECT prompt_type, app_name, length(prompt_text) AS prompt_len, modified_at
FROM prompt_template
WHERE prompt_type = 'invoice_extractor'
ORDER BY app_name, modified_at DESC NULLS LAST;
