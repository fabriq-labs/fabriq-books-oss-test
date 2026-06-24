-- Plaid bank feed — aligns public.plaid_item and public.account with:
--   backend/prisma/schema/plaid.prisma
--   backend/prisma/schema/data.prisma (account.plaid_item_id)
--
-- Safe to run multiple times (idempotent).

-- ── plaid_item ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plaid_item (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('plaid_' || gen_random_uuid()::text),
  org_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  legal_entity_id VARCHAR(50),
  institution_id VARCHAR(255),
  institution_name VARCHAR(255),
  access_token TEXT NOT NULL,
  item_id VARCHAR(255) NOT NULL UNIQUE,
  cursor TEXT,
  last_synced_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  modified_by VARCHAR(255),
  assigned_to VARCHAR(255)
);

ALTER TABLE plaid_item
  ADD COLUMN IF NOT EXISTS legal_entity_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255),
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS modified_by VARCHAR(255);

-- ── account.plaid_item_id (one-to-many: plaid_item → account) ───────────────

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS plaid_item_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS account_plaid_item_id_idx ON account (plaid_item_id);

-- Best-effort: migrate legacy JSON mappings before dropping accounts column
DO $$
DECLARE
  rec RECORD;
  acct JSONB;
  fabriq_id TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plaid_item'
      AND column_name = 'accounts'
  ) THEN
    FOR rec IN SELECT id, org_id, accounts FROM plaid_item WHERE accounts IS NOT NULL LOOP
      FOR acct IN SELECT * FROM jsonb_array_elements(rec.accounts) LOOP
        fabriq_id := acct->>'fabriq_account_id';
        IF fabriq_id IS NOT NULL THEN
          UPDATE account
          SET plaid_item_id = rec.id,
              inst_id = COALESCE(acct->>'plaid_account_id', inst_id)
          WHERE id = fabriq_id
            AND org_id = rec.org_id
            AND plaid_item_id IS NULL;
        END IF;
      END LOOP;
    END LOOP;
  END IF;
END $$;

ALTER TABLE plaid_item DROP COLUMN IF EXISTS accounts;

CREATE INDEX IF NOT EXISTS plaid_item_org_id_idx ON plaid_item (org_id);
CREATE INDEX IF NOT EXISTS plaid_item_legal_entity_id_idx ON plaid_item (legal_entity_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE t.relname = 'plaid_item'
      AND c.contype = 'f'
      AND c.conname = 'plaid_item_legal_entity_id_fkey'
  ) THEN
    ALTER TABLE plaid_item
      ADD CONSTRAINT plaid_item_legal_entity_id_fkey
      FOREIGN KEY (legal_entity_id)
      REFERENCES entity (id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE t.relname = 'account'
      AND c.contype = 'f'
      AND c.conname = 'account_plaid_item_id_fkey'
  ) THEN
    ALTER TABLE account
      ADD CONSTRAINT account_plaid_item_id_fkey
      FOREIGN KEY (plaid_item_id)
      REFERENCES plaid_item (id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END
$$;
