-- =============================================================================
-- prod-bills-tax / 02_dml_backfill.sql
-- Data backfill only (no DDL). Safe to re-run.
-- =============================================================================

BEGIN;

-- 1) Backfill invoice.supplier_id from linked PO when missing
UPDATE invoice i
SET
  supplier_id = po.supplier_id,
  modified_at = NOW()
FROM purchase_order po
WHERE i.purchase_order_id = po.id
  AND i.supplier_id IS NULL
  AND po.supplier_id IS NOT NULL;

-- 2) Legacy overload: invoice_type held 'With PO' / 'Without PO'
UPDATE invoice
SET
  po_mode = invoice_type,
  invoice_type = 'PURCHASE',
  modified_at = CURRENT_TIMESTAMP
WHERE invoice_type IN ('With PO', 'Without PO');

-- 3) Already PURCHASE but missing po_mode
UPDATE invoice
SET
  po_mode = CASE
    WHEN purchase_order_id IS NOT NULL THEN 'With PO'
    ELSE 'Without PO'
  END,
  modified_at = CURRENT_TIMESTAMP
WHERE invoice_type = 'PURCHASE'
  AND (po_mode IS NULL OR btrim(po_mode) = '');

-- 4) Linked to a PO but still missing class/mode
UPDATE invoice
SET
  invoice_type = COALESCE(NULLIF(btrim(invoice_type), ''), 'PURCHASE'),
  po_mode = COALESCE(NULLIF(btrim(po_mode), ''), 'With PO'),
  modified_at = CURRENT_TIMESTAMP
WHERE purchase_order_id IS NOT NULL
  AND (
    invoice_type IS NULL
    OR invoice_type NOT IN ('SALES', 'PURCHASE')
    OR po_mode IS NULL
    OR btrim(po_mode) = ''
  );

-- 5) Sales must not carry po_mode
UPDATE invoice
SET
  po_mode = NULL,
  modified_at = CURRENT_TIMESTAMP
WHERE invoice_type = 'SALES'
  AND po_mode IS NOT NULL;

COMMIT;

-- Summary (outside txn so it always prints after apply)
SELECT invoice_type, po_mode, count(*) AS n
FROM invoice
GROUP BY 1, 2
ORDER BY 1 NULLS LAST, 2 NULLS LAST;
