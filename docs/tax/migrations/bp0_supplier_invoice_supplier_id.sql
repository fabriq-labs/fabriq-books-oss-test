-- BP-0: Supplier tax profile + invoice.supplier_id
-- Local/dev apply only unless explicitly approved for other envs.
-- Does NOT change purchase_order / purchase_requisition.

-- 1) Supplier tax fields
ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS tax_treatment TEXT,
  ADD COLUMN IF NOT EXISTS default_tax_region_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_default_tax_region_id_fkey'
  ) THEN
    ALTER TABLE supplier
      ADD CONSTRAINT supplier_default_tax_region_id_fkey
      FOREIGN KEY (default_tax_region_id) REFERENCES tax_region(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS supplier_default_tax_region_id_idx
  ON supplier (default_tax_region_id);

-- 2) Invoice → supplier FK
ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS supplier_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_supplier_id_fkey'
  ) THEN
    ALTER TABLE invoice
      ADD CONSTRAINT invoice_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES supplier(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoice_supplier_id_idx ON invoice (supplier_id);

-- Optional: backfill supplier_id from linked PO when present
UPDATE invoice i
SET
  supplier_id = po.supplier_id,
  modified_at = NOW()
FROM purchase_order po
WHERE i.purchase_order_id = po.id
  AND i.supplier_id IS NULL
  AND po.supplier_id IS NOT NULL;
