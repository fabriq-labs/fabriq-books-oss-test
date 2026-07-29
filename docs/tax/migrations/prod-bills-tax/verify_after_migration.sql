-- =============================================================================
-- prod-bills-tax / verify_after_migration.sql
-- Read-only. Paste full output back for review.
-- Usage:
--   psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/verify_after_migration.sql
-- =============================================================================

\echo '===== 0) Connection ====='
SELECT current_database() AS database,
       current_user AS db_user,
       inet_server_addr() AS server_addr,
       now() AS checked_at;

\echo ''
\echo '===== 1) Prerequisite tax tables (sales architecture) ====='
SELECT
  CASE WHEN to_regclass('public.tax_region') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS tax_region,
  CASE WHEN to_regclass('public.tax_group') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS tax_group,
  CASE WHEN to_regclass('public.party_tax_registration') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS party_tax_registration,
  CASE WHEN to_regclass('public.entity_tax_settings') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS entity_tax_settings;

\echo ''
\echo '===== 2) New columns present ====='
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='supplier' AND column_name='tax_treatment'
  ) THEN 'PASS' ELSE 'FAIL' END AS supplier_tax_treatment,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='supplier' AND column_name='default_tax_region_id'
  ) THEN 'PASS' ELSE 'FAIL' END AS supplier_default_tax_region_id,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice' AND column_name='supplier_id'
  ) THEN 'PASS' ELSE 'FAIL' END AS invoice_supplier_id,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice' AND column_name='po_mode'
  ) THEN 'PASS' ELSE 'FAIL' END AS invoice_po_mode;

\echo ''
\echo '===== 3) Foreign keys ====='
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_default_tax_region_id_fkey')
    THEN 'PASS' ELSE 'FAIL' END AS fk_supplier_default_tax_region,
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoice_supplier_id_fkey')
    THEN 'PASS' ELSE 'FAIL' END AS fk_invoice_supplier;

\echo ''
\echo '===== 4) Indexes ====='
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='supplier_default_tax_region_id_idx')
    THEN 'PASS' ELSE 'FAIL' END AS idx_supplier_default_tax_region,
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='invoice_supplier_id_idx')
    THEN 'PASS' ELSE 'FAIL' END AS idx_invoice_supplier,
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='invoice_po_mode_idx')
    THEN 'PASS' ELSE 'FAIL' END AS idx_invoice_po_mode,
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='invoice_invoice_type_idx')
    THEN 'PASS' ELSE 'FAIL' END AS idx_invoice_type;

\echo ''
\echo '===== 5) Data integrity (expect PASS / 0) ====='
SELECT
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS check_no_legacy_po_in_invoice_type,
  count(*) AS legacy_po_literals_remaining
FROM invoice
WHERE invoice_type IN ('With PO', 'Without PO');

SELECT
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS check_no_sales_with_po_mode,
  count(*) AS sales_with_po_mode
FROM invoice
WHERE invoice_type = 'SALES' AND po_mode IS NOT NULL;

SELECT
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS check_purchase_has_po_mode,
  count(*) AS purchase_missing_po_mode
FROM invoice
WHERE invoice_type = 'PURCHASE'
  AND (po_mode IS NULL OR btrim(po_mode) = '');

SELECT
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS check_po_linked_bills_have_supplier_id,
  count(*) AS po_linked_missing_supplier_id
FROM invoice i
JOIN purchase_order po ON po.id = i.purchase_order_id
WHERE i.supplier_id IS NULL
  AND po.supplier_id IS NOT NULL;

\echo ''
\echo '===== 6) invoice_type / po_mode distribution ====='
SELECT invoice_type, po_mode, count(*) AS n
FROM invoice
GROUP BY 1, 2
ORDER BY 1 NULLS LAST, 2 NULLS LAST;

\echo ''
\echo '===== 7) View metadata ====='
SELECT
  name,
  CASE WHEN (data_graph ? 'supplier_id') THEN 'PASS' ELSE 'FAIL' END AS has_supplier_id,
  CASE WHEN (data_graph ? 'po_mode') THEN 'PASS' ELSE 'FAIL' END AS has_po_mode,
  data_graph -> 'invoice_type' ->> 'displayName' AS invoice_type_label,
  CASE WHEN (data_graph -> 'invoice_type' ->> 'displayName') = 'Invoice Class'
    THEN 'PASS' ELSE 'WARN' END AS invoice_type_label_ok
FROM view
WHERE name = 'invoice_view' AND model_name = 'invoice';

SELECT
  name,
  CASE WHEN (data_graph ? 'tax_treatment') THEN 'PASS' ELSE 'FAIL' END AS has_tax_treatment,
  CASE WHEN (data_graph ? 'default_tax_region_id') THEN 'PASS' ELSE 'FAIL' END AS has_default_tax_region_id,
  CASE WHEN (data_graph ? 'default_tax_region') THEN 'PASS' ELSE 'FAIL' END AS has_default_tax_region_rel
FROM view
WHERE model_name = 'supplier'
  AND name IN ('supplier_view', 'supplierFullAccess')
ORDER BY name;

\echo ''
\echo '===== 8) invoice_extractor prompt (fabriq_books) ====='
SELECT
  CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS prompt_row_exists,
  count(*) AS n
FROM prompt_template
WHERE prompt_type = 'invoice_extractor' AND app_name = 'fabriq_books';

SELECT prompt_type, app_name, length(prompt_text) AS prompt_len,
       CASE WHEN prompt_text ILIKE '%supplier_tax_id%' THEN 'PASS' ELSE 'FAIL' END AS mentions_supplier_tax_id,
       CASE WHEN prompt_text ILIKE '%tax_components%' THEN 'PASS' ELSE 'FAIL' END AS mentions_tax_components,
       CASE WHEN prompt_text ILIKE '%place_of_supply%' THEN 'PASS' ELSE 'FAIL' END AS mentions_place_of_supply,
       modified_at
FROM prompt_template
WHERE prompt_type = 'invoice_extractor' AND app_name = 'fabriq_books';

\echo ''
\echo '===== 9) Sample purchase rows (up to 10) ====='
SELECT id, invoice_number, invoice_type, po_mode, supplier_id, purchase_order_id
FROM invoice
WHERE invoice_type = 'PURCHASE'
   OR po_mode IS NOT NULL
ORDER BY modified_at DESC NULLS LAST
LIMIT 10;

\echo ''
\echo '===== 10) Overall rollup ====='
WITH checks AS (
  SELECT 'supplier.tax_treatment' AS check_name,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='supplier' AND column_name='tax_treatment') AS ok
  UNION ALL SELECT 'supplier.default_tax_region_id',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='supplier' AND column_name='default_tax_region_id')
  UNION ALL SELECT 'invoice.supplier_id',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice' AND column_name='supplier_id')
  UNION ALL SELECT 'invoice.po_mode',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice' AND column_name='po_mode')
  UNION ALL SELECT 'fk_supplier_default_tax_region',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_default_tax_region_id_fkey')
  UNION ALL SELECT 'fk_invoice_supplier',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoice_supplier_id_fkey')
  UNION ALL SELECT 'no_legacy_po_in_invoice_type',
    NOT EXISTS (SELECT 1 FROM invoice WHERE invoice_type IN ('With PO', 'Without PO'))
  UNION ALL SELECT 'no_sales_with_po_mode',
    NOT EXISTS (SELECT 1 FROM invoice WHERE invoice_type = 'SALES' AND po_mode IS NOT NULL)
  UNION ALL SELECT 'purchase_has_po_mode',
    NOT EXISTS (
      SELECT 1 FROM invoice
      WHERE invoice_type = 'PURCHASE' AND (po_mode IS NULL OR btrim(po_mode) = '')
    )
  UNION ALL SELECT 'invoice_view.supplier_id',
    EXISTS (SELECT 1 FROM view WHERE name='invoice_view' AND model_name='invoice' AND data_graph ? 'supplier_id')
  UNION ALL SELECT 'invoice_view.po_mode',
    EXISTS (SELECT 1 FROM view WHERE name='invoice_view' AND model_name='invoice' AND data_graph ? 'po_mode')
  UNION ALL SELECT 'supplier_view.tax_treatment',
    EXISTS (SELECT 1 FROM view WHERE name='supplier_view' AND model_name='supplier' AND data_graph ? 'tax_treatment')
)
SELECT check_name,
       CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY result DESC, check_name;

SELECT
  CASE WHEN bool_and(ok) THEN 'ALL PASS' ELSE 'HAS FAILURES — paste output for review' END AS overall
FROM (
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='supplier' AND column_name='tax_treatment') AS ok
  UNION ALL SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='supplier' AND column_name='default_tax_region_id')
  UNION ALL SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice' AND column_name='supplier_id')
  UNION ALL SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice' AND column_name='po_mode')
  UNION ALL SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_default_tax_region_id_fkey')
  UNION ALL SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoice_supplier_id_fkey')
  UNION ALL SELECT NOT EXISTS (SELECT 1 FROM invoice WHERE invoice_type IN ('With PO', 'Without PO'))
  UNION ALL SELECT NOT EXISTS (SELECT 1 FROM invoice WHERE invoice_type = 'SALES' AND po_mode IS NOT NULL)
  UNION ALL SELECT NOT EXISTS (
    SELECT 1 FROM invoice
    WHERE invoice_type = 'PURCHASE' AND (po_mode IS NULL OR btrim(po_mode) = '')
  )
  UNION ALL SELECT EXISTS (SELECT 1 FROM view WHERE name='invoice_view' AND model_name='invoice' AND data_graph ? 'supplier_id')
  UNION ALL SELECT EXISTS (SELECT 1 FROM view WHERE name='invoice_view' AND model_name='invoice' AND data_graph ? 'po_mode')
  UNION ALL SELECT EXISTS (SELECT 1 FROM view WHERE name='supplier_view' AND model_name='supplier' AND data_graph ? 'tax_treatment')
) s;

\echo ''
\echo '===== DONE — copy everything above and paste back ====='
