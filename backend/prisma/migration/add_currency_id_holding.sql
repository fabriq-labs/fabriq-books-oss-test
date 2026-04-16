-- Align public.holding with backend/prisma/schema/data.prisma:
--   currency_id  String?  @db.VarChar(50)  (FK to public.currency.id, optional)
--   Prisma relation field "currency" maps to column currency_id only; there is no "currency" column.
--
-- Legacy DBs may have a text "currency" column (ISO code). This script:
--   1) Adds currency_id if missing
--   2) Backfills currency_id from legacy ISO text → public.currency.code (code is unique; prefers same org_id when set)
--   3) Adds index + FK
--   4) Drops legacy "currency" column
--
-- Prerequisites:
--   - public.currency exists with PRIMARY KEY (id) VARCHAR(50).
--
-- Safe to run multiple times (idempotent).

ALTER TABLE public.holding
  ADD COLUMN IF NOT EXISTS currency_id VARCHAR(50);

-- Backfill from legacy ISO text column when present (currency.code is unique in Prisma schema).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'holding'
      AND column_name = 'currency'
  ) THEN
    UPDATE public.holding h
    SET currency_id = c.id
    FROM public.currency c
    WHERE h.currency_id IS NULL
      AND h.currency IS NOT NULL
      AND TRIM(h.currency::text) <> ''
      AND UPPER(TRIM(h.currency::text)) = UPPER(c.code)
      AND (h.org_id IS NULL OR h.org_id = c.org_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS holding_currency_id_idx
  ON public.holding (currency_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE t.relname = 'holding'
      AND c.contype = 'f'
      AND c.conname = 'holding_currency_id_fkey'
  ) THEN
    ALTER TABLE public.holding
      ADD CONSTRAINT holding_currency_id_fkey
      FOREIGN KEY (currency_id)
      REFERENCES public.currency (id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.holding
  DROP COLUMN IF EXISTS currency;
