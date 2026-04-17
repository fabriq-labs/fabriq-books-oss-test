-- Align public.account with backend/prisma/schema/data.prisma:
--   base_currency_id  String?  @db.VarChar(50)  (FK to public.currency.id, optional)
--   No separate "currency" column on account (legacy text/ISO column removed below).
--
-- Prerequisites:
--   - public.currency exists with PRIMARY KEY (id) VARCHAR(50) (see forex-schema-alter.sql
--     or Prisma migrate). Run this after currency is present.
--
-- Safe to run multiple times (idempotent).

ALTER TABLE public.account
  ADD COLUMN IF NOT EXISTS base_currency_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS account_base_currency_id_idx
  ON public.account (base_currency_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE t.relname = 'account'
      AND c.contype = 'f'
      AND c.conname = 'account_base_currency_id_fkey'
  ) THEN
    ALTER TABLE public.account
      ADD CONSTRAINT account_base_currency_id_fkey
      FOREIGN KEY (base_currency_id)
      REFERENCES public.currency (id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END
$$;

-- Legacy: older DBs may have a physical "currency" column (e.g. ISO code text). Prisma/client use base_currency_id only.
ALTER TABLE public.account
  DROP COLUMN IF EXISTS currency;
