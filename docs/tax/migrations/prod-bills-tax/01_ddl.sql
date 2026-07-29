-- =============================================================================
-- prod-bills-tax / 01_ddl.sql
-- Branch: agentc/bills-tax-analysis-e0b7 (BP-0 + BP-3 schema)
-- Idempotent. Does NOT change purchase_order / purchase_requisition.
-- Prerequisite: public.tax_region exists (sales tax architecture / prod-hilka 01).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- BP-0: supplier tax profile
-- -----------------------------------------------------------------------------
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

COMMENT ON COLUMN supplier.tax_treatment IS
  'Supplier tax treatment (e.g. registered, export / overseas)';
COMMENT ON COLUMN supplier.default_tax_region_id IS
  'Default tax region for purchase tax suggestion geography';

-- -----------------------------------------------------------------------------
-- BP-0: invoice.supplier_id (party link for Without-PO bills + tax display)
-- -----------------------------------------------------------------------------
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

COMMENT ON COLUMN invoice.supplier_id IS
  'FK to supplier for purchase bills (structured tax / suggestion)';

-- -----------------------------------------------------------------------------
-- BP-3: invoice.po_mode (With PO | Without PO); invoice_type = SALES | PURCHASE
-- -----------------------------------------------------------------------------
ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS po_mode TEXT;

COMMENT ON COLUMN invoice.invoice_type IS
  'Business classification: SALES | PURCHASE';
COMMENT ON COLUMN invoice.po_mode IS
  'Purchase PO linkage: With PO | Without PO (null for sales)';

CREATE INDEX IF NOT EXISTS invoice_po_mode_idx ON invoice (po_mode);
CREATE INDEX IF NOT EXISTS invoice_invoice_type_idx ON invoice (invoice_type);

COMMIT;
