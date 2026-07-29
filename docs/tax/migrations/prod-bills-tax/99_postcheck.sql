-- =============================================================================
-- prod-bills-tax / 99_postcheck.sql
-- Read-only verification after 01–03 (and optional prompt update).
-- Requires 01_ddl columns to exist.
-- =============================================================================

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier' AND column_name = 'tax_treatment'
  ) AS ok_supplier_tax_treatment,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier' AND column_name = 'default_tax_region_id'
  ) AS ok_supplier_default_tax_region_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice' AND column_name = 'supplier_id'
  ) AS ok_invoice_supplier_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice' AND column_name = 'po_mode'
  ) AS ok_invoice_po_mode;

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'supplier_default_tax_region_id_fkey',
  'invoice_supplier_id_fkey'
)
ORDER BY 1;

-- Expect 0
SELECT count(*) AS legacy_po_literals_remaining
FROM invoice
WHERE invoice_type IN ('With PO', 'Without PO');

-- Expect 0
SELECT count(*) AS sales_with_po_mode
FROM invoice
WHERE invoice_type = 'SALES' AND po_mode IS NOT NULL;

SELECT invoice_type, po_mode, count(*) AS n
FROM invoice
GROUP BY 1, 2
ORDER BY 1 NULLS LAST, 2 NULLS LAST;

SELECT count(*) AS bills_with_po_link_missing_supplier_id
FROM invoice i
JOIN purchase_order po ON po.id = i.purchase_order_id
WHERE i.supplier_id IS NULL
  AND po.supplier_id IS NOT NULL;

SELECT name,
       (data_graph ? 'supplier_id') AS has_supplier_id,
       (data_graph ? 'po_mode') AS has_po_mode,
       data_graph -> 'invoice_type' ->> 'displayName' AS invoice_type_label
FROM view
WHERE name = 'invoice_view' AND model_name = 'invoice';

SELECT name,
       (data_graph ? 'tax_treatment') AS has_tax_treatment,
       (data_graph ? 'default_tax_region_id') AS has_default_region
FROM view
WHERE model_name = 'supplier'
  AND name IN ('supplier_view', 'supplierFullAccess');

SELECT prompt_type, app_name,
       (prompt_text ILIKE '%supplier_tax_id%') AS mentions_supplier_tax_id,
       (prompt_text ILIKE '%tax_components%') AS mentions_tax_components,
       length(prompt_text) AS prompt_len
FROM prompt_template
WHERE prompt_type = 'invoice_extractor'
  AND app_name = 'fabriq_books';
