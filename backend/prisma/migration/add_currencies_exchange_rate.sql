-- Align public.exchange_rate with backend/prisma/schema/data.prisma:
--   from_currency_id / to_currency_id  VARCHAR(50) NOT NULL → public.currency(id)
--   Prisma relations "from_currency" / "to_currency" map to these columns only;
--   Legacy text columns from_currency / to_currency (ISO codes) are removed.
--
-- Upgrades databases created from prisma/migration/forex-schema-alter.sql (text ISO columns).
-- Prerequisites: public.currency exists with PRIMARY KEY (id) VARCHAR(50), rows for each ISO code used in rates.
--
-- Safe to run multiple times (idempotent) for additive steps; legacy block runs once when old columns exist.

ALTER TABLE public.exchange_rate
  ADD COLUMN IF NOT EXISTS from_currency_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS to_currency_id VARCHAR(50);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exchange_rate'
      AND column_name = 'from_currency'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exchange_rate'
      AND column_name = 'to_currency'
  ) THEN
    ALTER TABLE public.exchange_rate
      DROP CONSTRAINT IF EXISTS exchange_rate_org_from_to_date_type_key;

    DROP INDEX IF EXISTS public.exchange_rate_org_from_to_date_idx;

    UPDATE public.exchange_rate er
    SET from_currency_id = c.id
    FROM public.currency c
    WHERE er.from_currency_id IS NULL
      AND er.from_currency IS NOT NULL
      AND TRIM(er.from_currency::text) <> ''
      AND UPPER(TRIM(er.from_currency::text)) = UPPER(c.code)
      AND er.org_id = c.org_id;

    UPDATE public.exchange_rate er
    SET to_currency_id = c.id
    FROM public.currency c
    WHERE er.to_currency_id IS NULL
      AND er.to_currency IS NOT NULL
      AND TRIM(er.to_currency::text) <> ''
      AND UPPER(TRIM(er.to_currency::text)) = UPPER(c.code)
      AND er.org_id = c.org_id;

    ALTER TABLE public.exchange_rate
      ALTER COLUMN from_currency_id SET NOT NULL,
      ALTER COLUMN to_currency_id SET NOT NULL;

    ALTER TABLE public.exchange_rate
      DROP COLUMN IF EXISTS from_currency,
      DROP COLUMN IF EXISTS to_currency;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rate_org_from_to_curr_ids_date_type_ux
  ON public.exchange_rate (org_id, from_currency_id, to_currency_id, effective_date, rate_type);

CREATE INDEX IF NOT EXISTS exchange_rate_org_from_to_curr_ids_date_idx
  ON public.exchange_rate (org_id, from_currency_id, to_currency_id, effective_date);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE t.relname = 'exchange_rate'
      AND c.contype = 'f'
      AND c.conname = 'exchange_rate_from_currency_id_fkey'
  ) THEN
    ALTER TABLE public.exchange_rate
      ADD CONSTRAINT exchange_rate_from_currency_id_fkey
      FOREIGN KEY (from_currency_id)
      REFERENCES public.currency (id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
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
    WHERE t.relname = 'exchange_rate'
      AND c.contype = 'f'
      AND c.conname = 'exchange_rate_to_currency_id_fkey'
  ) THEN
    ALTER TABLE public.exchange_rate
      ADD CONSTRAINT exchange_rate_to_currency_id_fkey
      FOREIGN KEY (to_currency_id)
      REFERENCES public.currency (id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END
$$;
