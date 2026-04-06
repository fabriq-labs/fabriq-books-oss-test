-- Forex schema changes: run this directly on the database (no Prisma).
-- Run after this: npx prisma generate (so the client knows the new tables/columns).

-- 1. Create enum for exchange rate type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exchange_rate_type') THEN
    CREATE TYPE exchange_rate_type AS ENUM ('SPOT', 'CLOSING', 'AVERAGE');
  END IF;
END$$;

-- 2. Create currency table (system-wide reference)
CREATE TABLE IF NOT EXISTS currency (
  id              VARCHAR(50) PRIMARY KEY DEFAULT ('curr_' || gen_random_uuid()),
  code            VARCHAR(255) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  symbol          VARCHAR(50),
  decimal_places  INTEGER NOT NULL DEFAULT 2,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create exchange_rate table
CREATE TABLE IF NOT EXISTS exchange_rate (
  id              VARCHAR(50) PRIMARY KEY DEFAULT ('exrt_' || gen_random_uuid()),
  org_id          VARCHAR(50) NOT NULL,
  from_currency   VARCHAR(50) NOT NULL,
  to_currency     VARCHAR(50) NOT NULL,
  effective_date  DATE NOT NULL,
  rate            NUMERIC(19, 6) NOT NULL,
  rate_type       exchange_rate_type NOT NULL DEFAULT 'SPOT',
  source          VARCHAR(255),
  created_by      VARCHAR(50),
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_by     VARCHAR(50),
  modified_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_to     VARCHAR(50),
  CONSTRAINT exchange_rate_org_from_to_date_type_key UNIQUE (org_id, from_currency, to_currency, effective_date, rate_type)
);

CREATE INDEX IF NOT EXISTS exchange_rate_org_from_to_date_idx
  ON exchange_rate (org_id, from_currency, to_currency, effective_date);

-- 4. Add base_currency to organizations (org model maps to "organizations")
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS base_currency VARCHAR(50) DEFAULT 'USD';
