-- Plaid raw transaction store.
-- One row per Plaid transaction_id; links to posting via posting_id FK.
-- Replaces the notes = 'plaid_tx:<id>' dedup pattern on posting.
--
-- Prerequisites:
--   - public.plaid_item exists
--   - public.posting exists
--
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS public.plaid_transaction (
  id                     VARCHAR(50)  PRIMARY KEY DEFAULT ('plaidtx_' || gen_random_uuid()::text),
  org_id                 VARCHAR(50)  NOT NULL,
  plaid_item_id          VARCHAR(50)  NOT NULL,
  transaction_id         VARCHAR(255) NOT NULL,
  plaid_account_id       VARCHAR(255) NOT NULL,
  posting_id             VARCHAR(50),
  pending                BOOLEAN      NOT NULL DEFAULT false,
  pending_transaction_id VARCHAR(255),
  raw                    JSONB        NOT NULL,
  synced_at              TIMESTAMP(3),
  created_at             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS plaid_transaction_transaction_id_key
  ON public.plaid_transaction (transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS plaid_transaction_posting_id_key
  ON public.plaid_transaction (posting_id)
  WHERE posting_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS plaid_transaction_org_id_idx
  ON public.plaid_transaction (org_id);

CREATE INDEX IF NOT EXISTS plaid_transaction_plaid_item_id_idx
  ON public.plaid_transaction (plaid_item_id);

CREATE INDEX IF NOT EXISTS plaid_transaction_pending_transaction_id_idx
  ON public.plaid_transaction (pending_transaction_id)
  WHERE pending_transaction_id IS NOT NULL;

-- FK: plaid_item
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE t.relname = 'plaid_transaction' AND c.conname = 'plaid_transaction_plaid_item_id_fkey'
  ) THEN
    ALTER TABLE public.plaid_transaction
      ADD CONSTRAINT plaid_transaction_plaid_item_id_fkey
      FOREIGN KEY (plaid_item_id) REFERENCES public.plaid_item (id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- FK: posting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE t.relname = 'plaid_transaction' AND c.conname = 'plaid_transaction_posting_id_fkey'
  ) THEN
    ALTER TABLE public.plaid_transaction
      ADD CONSTRAINT plaid_transaction_posting_id_fkey
      FOREIGN KEY (posting_id) REFERENCES public.posting (id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;
