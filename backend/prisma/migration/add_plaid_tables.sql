-- Plaid bank feed — aligns public.plaid_item and public.account with:
--   backend/prisma/schema/plaid.prisma
--   backend/prisma/schema/data.prisma (account.plaid_item_id, account.inst_id, account.last_sync_at)
--
-- Mapping model (no JSON column on plaid_item):
--   plaid_item          — one row per bank connection (Plaid "item")
--   account.plaid_item_id — FK to plaid_item
--   account.inst_id       — Plaid sub-account id (shared column; also used by broker feeds)
--   account.last_sync_at  — per-account transaction sync timestamp
--
-- Prerequisites:
--   - public.entity exists (FK for plaid_item.legal_entity_id)
--
-- Safe to run multiple times (idempotent).

-- ── plaid_item ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plaid_item (
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

-- Upgrade path: add columns that may be missing on DBs created from earlier Plaid SQL
ALTER TABLE public.plaid_item
  ADD COLUMN IF NOT EXISTS legal_entity_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS institution_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS institution_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS item_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cursor TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS modified_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);

-- Legacy v1 stored sub-account mappings in JSON; migrate then drop
DO $$
DECLARE
  rec RECORD;
  acct JSONB;
  fabriq_id TEXT;
  plaid_acct_id TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plaid_item'
      AND column_name = 'accounts'
  ) THEN
    FOR rec IN SELECT id, org_id, accounts FROM public.plaid_item WHERE accounts IS NOT NULL LOOP
      FOR acct IN SELECT * FROM jsonb_array_elements(rec.accounts) LOOP
        fabriq_id := acct->>'fabriq_account_id';
        plaid_acct_id := acct->>'plaid_account_id';
        IF fabriq_id IS NOT NULL THEN
          UPDATE public.account
          SET plaid_item_id = rec.id,
              inst_id = COALESCE(plaid_acct_id, inst_id)
          WHERE id = fabriq_id
            AND org_id = rec.org_id
            AND plaid_item_id IS NULL;
        END IF;
      END LOOP;
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.plaid_item DROP COLUMN IF EXISTS accounts;

CREATE INDEX IF NOT EXISTS plaid_item_org_id_idx ON public.plaid_item (org_id);
CREATE INDEX IF NOT EXISTS plaid_item_legal_entity_id_idx ON public.plaid_item (legal_entity_id);

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
    ALTER TABLE public.plaid_item
      ADD CONSTRAINT plaid_item_legal_entity_id_fkey
      FOREIGN KEY (legal_entity_id)
      REFERENCES public.entity (id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ── account (Plaid mapping columns) ─────────────────────────────────────────

ALTER TABLE public.account
  ADD COLUMN IF NOT EXISTS plaid_item_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS inst_id TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS account_plaid_item_id_idx ON public.account (plaid_item_id);

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
    ALTER TABLE public.account
      ADD CONSTRAINT account_plaid_item_id_fkey
      FOREIGN KEY (plaid_item_id)
      REFERENCES public.plaid_item (id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END
$$;
