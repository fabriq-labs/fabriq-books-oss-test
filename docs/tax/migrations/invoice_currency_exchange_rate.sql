-- Invoice document currency + snapshotted exchange rate (payment_receipt pattern).
-- Does NOT store exchange_rate.id — only currency_id + numeric rate.
-- Review and run manually (sandbox first). Do not auto-apply.

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS currency_id TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION DEFAULT 1.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_currency_id_fkey'
  ) THEN
    ALTER TABLE invoice
      ADD CONSTRAINT invoice_currency_id_fkey
      FOREIGN KEY (currency_id) REFERENCES currency(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoice_currency_id_idx ON invoice (currency_id);

-- Optional backfill: LE base currency, rate 1
UPDATE invoice i
SET
  currency_id = e.basecurrency_id,
  exchange_rate = COALESCE(i.exchange_rate, 1.00),
  modified_at = NOW()
FROM entity e
WHERE i.legal_entity_id = e.id
  AND i.currency_id IS NULL
  AND e.basecurrency_id IS NOT NULL;
