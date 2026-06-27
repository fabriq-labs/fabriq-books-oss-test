-- Instrument market price + option underlying link (Phase 0)
-- Run once against your database before deploying the application changes.

ALTER TYPE instrument_type ADD VALUE IF NOT EXISTS 'OPTION';

ALTER TABLE instrument
  ADD COLUMN IF NOT EXISTS current_price          NUMERIC(19,4),
  ADD COLUMN IF NOT EXISTS price_updated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_currency_id      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS external_symbol_id     INTEGER,
  ADD COLUMN IF NOT EXISTS underlying_instrument_id VARCHAR(50);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'instrument_underlying_fk'
  ) THEN
    ALTER TABLE instrument
      ADD CONSTRAINT instrument_underlying_fk
      FOREIGN KEY (underlying_instrument_id) REFERENCES instrument(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS instrument_underlying_instrument_id_idx
  ON instrument(underlying_instrument_id);

-- Backfill instrument.current_price from the latest active holding per instrument
UPDATE instrument i
SET
  current_price = h.current_price,
  price_updated_at = h.last_updated,
  price_currency_id = h.currency_id
FROM (
  SELECT DISTINCT ON (instrument_id)
    instrument_id, current_price, last_updated, currency_id
  FROM holding
  WHERE is_active = true AND current_price IS NOT NULL
  ORDER BY instrument_id, last_updated DESC
) h
WHERE i.id = h.instrument_id;

-- Reclassify obvious option symbols still typed as STOCK
UPDATE instrument
SET type = 'OPTION'
WHERE type = 'STOCK'
  AND symbol ~ '\d{1,2}[A-Z][a-z]{2}\d{2}[CP]\d+(\.\d+)?$';
