-- tax_master: lineage fields for ERP sync + view-only gating
-- Mirrors customers/supplier/item_master/account/invoice lineage columns.
-- Review and run manually (sandbox first). Do not auto-apply.
--
-- After apply:
--   1. Sync metadata so tax_master_view includes source_system_id
--   2. npx prisma generate (if schema already updated)

ALTER TABLE tax_master
  ADD COLUMN IF NOT EXISTS source_system_id TEXT DEFAULT 'srcsys_fabriq',
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMP(3) DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ingest_batch_id TEXT;

-- Existing rows stay editable as native Fabriq records
UPDATE tax_master
SET
  source_system_id = COALESCE(source_system_id, 'srcsys_fabriq'),
  source_updated_at = COALESCE(source_updated_at, NOW())
WHERE source_system_id IS NULL
   OR source_updated_at IS NULL;

CREATE INDEX IF NOT EXISTS tax_master_source_system_id_source_record_id_idx
  ON tax_master (source_system_id, source_record_id);
