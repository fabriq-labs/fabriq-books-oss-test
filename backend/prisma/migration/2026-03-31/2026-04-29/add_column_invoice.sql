ALTER TABLE "invoice"
DROP COLUMN IF EXISTS "payment_terms",
ADD COLUMN IF NOT EXISTS "payment_terms_id" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "adjustable_label" TEXT DEFAULT 'Adjustable',
ADD COLUMN IF NOT EXISTS "adjustable_value" DOUBLE PRECISION DEFAULT 0.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_payment_terms_id_fkey'
  ) THEN
    ALTER TABLE "invoice"
    ADD CONSTRAINT "invoice_payment_terms_id_fkey"
    FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id")
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;
END $$;
