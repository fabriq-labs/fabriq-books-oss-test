-- WP5 finish: fold Phase 4 ledger defaults onto entity; drop entity_ledger_settings.
-- Idempotent. Do not run prisma db push / migrate.

-- 1. Columns on entity
ALTER TABLE "entity"
  ADD COLUMN IF NOT EXISTS "default_receivable_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "default_income_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "default_undeposited_funds_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "default_fx_gain_loss_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "default_discount_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "ledger_start_date" TIMESTAMP(3);

-- 2. Copy any rows that already existed on entity_ledger_settings
UPDATE "entity" e
SET
  "default_receivable_account_id" = COALESCE(e."default_receivable_account_id", els."default_receivable_account_id"),
  "default_income_account_id" = COALESCE(e."default_income_account_id", els."default_income_account_id"),
  "default_undeposited_funds_account_id" = COALESCE(e."default_undeposited_funds_account_id", els."default_undeposited_funds_account_id"),
  "default_fx_gain_loss_account_id" = COALESCE(e."default_fx_gain_loss_account_id", els."default_fx_gain_loss_account_id"),
  "default_discount_account_id" = COALESCE(e."default_discount_account_id", els."default_discount_account_id"),
  "ledger_start_date" = COALESCE(e."ledger_start_date", els."ledger_start_date"),
  "modified_at" = CURRENT_TIMESTAMP
FROM "entity_ledger_settings" els
WHERE els."entity_id" = e."id";

-- 3. FKs from entity → account
DO $$ BEGIN
  ALTER TABLE "entity"
    ADD CONSTRAINT "entity_default_receivable_account_id_fkey"
    FOREIGN KEY ("default_receivable_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "entity"
    ADD CONSTRAINT "entity_default_income_account_id_fkey"
    FOREIGN KEY ("default_income_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "entity"
    ADD CONSTRAINT "entity_default_undeposited_funds_account_id_fkey"
    FOREIGN KEY ("default_undeposited_funds_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "entity"
    ADD CONSTRAINT "entity_default_fx_gain_loss_account_id_fkey"
    FOREIGN KEY ("default_fx_gain_loss_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "entity"
    ADD CONSTRAINT "entity_default_discount_account_id_fkey"
    FOREIGN KEY ("default_discount_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "entity_default_receivable_account_id_idx"
  ON "entity"("default_receivable_account_id");
CREATE INDEX IF NOT EXISTS "entity_default_income_account_id_idx"
  ON "entity"("default_income_account_id");
CREATE INDEX IF NOT EXISTS "entity_default_undeposited_funds_account_id_idx"
  ON "entity"("default_undeposited_funds_account_id");
CREATE INDEX IF NOT EXISTS "entity_default_fx_gain_loss_account_id_idx"
  ON "entity"("default_fx_gain_loss_account_id");
CREATE INDEX IF NOT EXISTS "entity_default_discount_account_id_idx"
  ON "entity"("default_discount_account_id");

-- 4. Drop the 1:1 settings table (empty or already copied)
DROP TABLE IF EXISTS "entity_ledger_settings";
