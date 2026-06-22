-- Plaid bank feed table (matches prisma/schema/plaid.prisma)
-- Run manually: psql $DATABASE_URL -f backend/prisma/migration/add_plaid_tables.sql

CREATE TABLE IF NOT EXISTS plaid_item (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('plaid_' || gen_random_uuid()::text),
  org_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  institution_id VARCHAR(255),
  institution_name VARCHAR(255),
  access_token TEXT NOT NULL,
  item_id VARCHAR(255) NOT NULL UNIQUE,
  cursor TEXT,
  accounts JSONB,
  last_synced_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  modified_by VARCHAR(255)
  assigned_to VARCHAR(255),
);

CREATE INDEX IF NOT EXISTS plaid_item_org_id_idx ON plaid_item (org_id);
