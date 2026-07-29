-- BP-3: Separate purchase classification from PO linkage mode.
-- invoice_type → business class: SALES | PURCHASE
-- po_mode      → procurement link: 'With PO' | 'Without PO'
--
-- Safe to re-run. Apply on local/test first; see docs/tax/migrations/BP3_PO_MODE_PROD_PLAN.md for prod.

-- 1) Schema
ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS po_mode TEXT;

COMMENT ON COLUMN invoice.invoice_type IS 'Business classification: SALES | PURCHASE';
COMMENT ON COLUMN invoice.po_mode IS 'Purchase PO linkage: With PO | Without PO (null for sales)';

CREATE INDEX IF NOT EXISTS invoice_po_mode_idx ON invoice (po_mode);
CREATE INDEX IF NOT EXISTS invoice_invoice_type_idx ON invoice (invoice_type);

-- 2) Backfill from legacy overloaded invoice_type
UPDATE invoice
SET
  po_mode = invoice_type,
  invoice_type = 'PURCHASE',
  modified_at = CURRENT_TIMESTAMP
WHERE invoice_type IN ('With PO', 'Without PO');

-- Bills already marked PURCHASE but missing po_mode
UPDATE invoice
SET
  po_mode = CASE WHEN purchase_order_id IS NOT NULL THEN 'With PO' ELSE 'Without PO' END,
  modified_at = CURRENT_TIMESTAMP
WHERE invoice_type = 'PURCHASE'
  AND (po_mode IS NULL OR btrim(po_mode) = '');

-- Linked to a PO but still missing classification/mode (orphan purchase-ish rows)
UPDATE invoice
SET
  invoice_type = COALESCE(NULLIF(btrim(invoice_type), ''), 'PURCHASE'),
  po_mode = COALESCE(NULLIF(btrim(po_mode), ''), 'With PO'),
  modified_at = CURRENT_TIMESTAMP
WHERE purchase_order_id IS NOT NULL
  AND (invoice_type IS NULL OR invoice_type NOT IN ('SALES', 'PURCHASE') OR po_mode IS NULL);

-- 3) Expose po_mode on invoice_view data_graph (metadata)
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

-- Soften invoice_type display name (classification)
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
