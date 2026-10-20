-- Phase 3/4 AR settlement + ledger schema (additive).
-- Review before apply. Do not run against prod without review.
-- Mirrors docs/domain/AR_SETTLEMENT_AND_LEDGER.md §3.

-- Enums
DO $$ BEGIN
  CREATE TYPE "settlement_target_type" AS ENUM (
    'invoice', 'credit_note', 'payment_receipt', 'journal_entry', 'refund', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ledger_status" AS ENUM ('pending', 'posted', 'blocked', 'not_required');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- invoice ledger/void
ALTER TABLE "invoice"
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "ledger_status" "ledger_status",
  ADD COLUMN IF NOT EXISTS "ledger_error" TEXT,
  ADD COLUMN IF NOT EXISTS "ledger_posted_at" TIMESTAMP(3);

-- payment_receipt
ALTER TABLE "payment_receipt"
  ADD COLUMN IF NOT EXISTS "unapplied_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "receivable_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "ledger_status" "ledger_status",
  ADD COLUMN IF NOT EXISTS "ledger_error" TEXT,
  ADD COLUMN IF NOT EXISTS "ledger_posted_at" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "payment_receipt"
    ADD CONSTRAINT "payment_receipt_receivable_account_id_fkey"
    FOREIGN KEY ("receivable_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "payment_receipt_receivable_account_id_idx" ON "payment_receipt"("receivable_account_id");

-- payment_receipt_application reshape
ALTER TABLE "payment_receipt_application"
  ADD COLUMN IF NOT EXISTS "target_type" "settlement_target_type" NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS "credit_note_id" TEXT,
  ADD COLUMN IF NOT EXISTS "target_source_record_id" TEXT,
  ADD COLUMN IF NOT EXISTS "applied_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "source_system_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_record_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "ingest_batch_id" TEXT;

-- Make invoice_id nullable (was required)
ALTER TABLE "payment_receipt_application" ALTER COLUMN "invoice_id" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "payment_receipt_application"
    ADD CONSTRAINT "payment_receipt_application_credit_note_id_fkey"
    FOREIGN KEY ("credit_note_id") REFERENCES "credit_note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_receipt_application_org_source_key"
  ON "payment_receipt_application"("org_id", "source_system_id", "source_record_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_receipt_application_receipt_credit_key"
  ON "payment_receipt_application"("payment_receipt_id", "credit_note_id");
CREATE INDEX IF NOT EXISTS "payment_receipt_application_credit_note_id_idx"
  ON "payment_receipt_application"("credit_note_id");
CREATE INDEX IF NOT EXISTS "payment_receipt_application_org_target_type_idx"
  ON "payment_receipt_application"("org_id", "target_type");
CREATE INDEX IF NOT EXISTS "payment_receipt_application_source_idx"
  ON "payment_receipt_application"("source_system_id", "source_record_id");

-- Signed amount CHECKs (design §3.2)
DO $$ BEGIN
  ALTER TABLE "payment_receipt_application"
    ADD CONSTRAINT "payment_receipt_application_signed_amount_check" CHECK (
      (
        "target_type" = 'invoice'
        AND "amount_applied" >= 0
        AND "credit_note_id" IS NULL
      )
      OR (
        "target_type" = 'credit_note'
        AND "amount_applied" <= 0
        AND "invoice_id" IS NULL
      )
      OR (
        "target_type" NOT IN ('invoice', 'credit_note')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- credit_note ledger/void
ALTER TABLE "credit_note"
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "ledger_status" "ledger_status",
  ADD COLUMN IF NOT EXISTS "ledger_error" TEXT,
  ADD COLUMN IF NOT EXISTS "ledger_posted_at" TIMESTAMP(3);

-- credit_note_item lineage + parity
ALTER TABLE "credit_note_item"
  ADD COLUMN IF NOT EXISTS "discount_rate" DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS "classification_code" TEXT,
  ADD COLUMN IF NOT EXISTS "classification_scheme" TEXT,
  ADD COLUMN IF NOT EXISTS "source_system_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_record_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "ingest_batch_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_note_item_org_source_key"
  ON "credit_note_item"("org_id", "source_system_id", "source_record_id");
CREATE INDEX IF NOT EXISTS "credit_note_item_source_idx"
  ON "credit_note_item"("source_system_id", "source_record_id");

-- credit_note_application
CREATE TABLE IF NOT EXISTS "credit_note_application" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "credit_note_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "amount_applied" DECIMAL(19,4) NOT NULL,
  "applied_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT,
  "modified_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_system_id" TEXT,
  "source_record_id" TEXT,
  "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "ingest_batch_id" TEXT,
  CONSTRAINT "credit_note_application_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "credit_note_application" ALTER COLUMN "id" SET DEFAULT ('cnapp_' || gen_random_uuid());

DO $$ BEGIN
  ALTER TABLE "credit_note_application"
    ADD CONSTRAINT "credit_note_application_credit_note_id_fkey"
    FOREIGN KEY ("credit_note_id") REFERENCES "credit_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "credit_note_application"
    ADD CONSTRAINT "credit_note_application_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_note_application_org_source_key"
  ON "credit_note_application"("org_id", "source_system_id", "source_record_id");
CREATE INDEX IF NOT EXISTS "credit_note_application_org_id_idx" ON "credit_note_application"("org_id");
CREATE INDEX IF NOT EXISTS "credit_note_application_credit_note_id_idx" ON "credit_note_application"("credit_note_id");
CREATE INDEX IF NOT EXISTS "credit_note_application_invoice_id_idx" ON "credit_note_application"("invoice_id");

-- credit_note_line_tax
CREATE TABLE IF NOT EXISTS "credit_note_line_tax" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "credit_note_item_id" TEXT NOT NULL,
  "tax_master_id" TEXT,
  "tax_group_id" TEXT,
  "rate" DECIMAL(9,6),
  "amount" DECIMAL(19,4),
  "component_type" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_note_line_tax_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "credit_note_line_tax" ALTER COLUMN "id" SET DEFAULT ('cnlt_' || gen_random_uuid());

DO $$ BEGIN
  ALTER TABLE "credit_note_line_tax"
    ADD CONSTRAINT "credit_note_line_tax_credit_note_item_id_fkey"
    FOREIGN KEY ("credit_note_item_id") REFERENCES "credit_note_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "credit_note_line_tax"
    ADD CONSTRAINT "credit_note_line_tax_tax_master_id_fkey"
    FOREIGN KEY ("tax_master_id") REFERENCES "tax_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "credit_note_line_tax"
    ADD CONSTRAINT "credit_note_line_tax_tax_group_id_fkey"
    FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "credit_note_line_tax_org_id_idx" ON "credit_note_line_tax"("org_id");
CREATE INDEX IF NOT EXISTS "credit_note_line_tax_item_idx" ON "credit_note_line_tax"("credit_note_item_id");

-- entity_ledger_settings
CREATE TABLE IF NOT EXISTS "entity_ledger_settings" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "default_receivable_account_id" TEXT,
  "default_income_account_id" TEXT,
  "default_undeposited_funds_account_id" TEXT,
  "default_fx_gain_loss_account_id" TEXT,
  "default_discount_account_id" TEXT,
  "ledger_start_date" TIMESTAMP(3),
  "created_by" TEXT,
  "modified_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entity_ledger_settings_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "entity_ledger_settings" ALTER COLUMN "id" SET DEFAULT ('els_' || gen_random_uuid());

CREATE UNIQUE INDEX IF NOT EXISTS "entity_ledger_settings_entity_id_key" ON "entity_ledger_settings"("entity_id");
CREATE INDEX IF NOT EXISTS "entity_ledger_settings_org_id_idx" ON "entity_ledger_settings"("org_id");

DO $$ BEGIN
  ALTER TABLE "entity_ledger_settings"
    ADD CONSTRAINT "entity_ledger_settings_entity_id_fkey"
    FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- posting: multi-receipt, credit_note, posting_key
ALTER TABLE "posting"
  ADD COLUMN IF NOT EXISTS "credit_note_id" TEXT,
  ADD COLUMN IF NOT EXISTS "posting_key" VARCHAR(200);

-- Drop 1:1 unique on payment_receipt_id if present
DO $$ BEGIN
  ALTER TABLE "posting" DROP CONSTRAINT IF EXISTS "posting_payment_receipt_id_key";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DROP INDEX IF EXISTS "posting_payment_receipt_id_key";

DO $$ BEGIN
  ALTER TABLE "posting"
    ADD CONSTRAINT "posting_credit_note_id_fkey"
    FOREIGN KEY ("credit_note_id") REFERENCES "credit_note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "posting_payment_receipt_id_idx" ON "posting"("payment_receipt_id");
CREATE INDEX IF NOT EXISTS "posting_credit_note_id_idx" ON "posting"("credit_note_id");
CREATE INDEX IF NOT EXISTS "posting_org_posting_key_idx" ON "posting"("org_id", "posting_key");

CREATE UNIQUE INDEX IF NOT EXISTS "posting_org_posting_key_active_uidx"
  ON "posting"("org_id", "posting_key")
  WHERE "status" = 'active' AND "posting_key" IS NOT NULL;
