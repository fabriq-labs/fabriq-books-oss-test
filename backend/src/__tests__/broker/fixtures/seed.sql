-- Broker test seed data
-- Run before tests: psql $DATABASE_URL -f seed.sql
-- All IDs are stable so tests can reference them by constant.

-- Currencies (global master data — pre-seeded by setup-db; insert only if missing)
INSERT INTO currency (id, code, name, symbol, org_id, modified_at)
VALUES ('curr_cad', 'CAD', 'Canadian Dollar', '$', 'system', NOW())
ON CONFLICT (code) DO NOTHING;

INSERT INTO currency (id, code, name, symbol, org_id, modified_at)
VALUES ('curr_usd', 'USD', 'US Dollar', '$', 'system', NOW())
ON CONFLICT (code) DO NOTHING;

-- Org (table is "organizations" in the DB)
INSERT INTO organizations (id, name, slug, settings, updated_at, basecurrency_id)
VALUES (
  'org_broker_test',
  'Broker Test Org',
  'broker-test-org',
  '{}',
  NOW(),
  'curr_cad'
)
ON CONFLICT (id) DO UPDATE SET basecurrency_id = 'curr_cad';

-- Exchange rate: 1 USD = 1.36 CAD, effective today
INSERT INTO exchange_rate (id, org_id, from_currency_id, to_currency_id, rate, effective_date, modified_at)
VALUES (
  'exr_usd_cad_test',
  'org_broker_test',
  'curr_usd',
  'curr_cad',
  1.36,
  CURRENT_DATE,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET rate = EXCLUDED.rate, effective_date = EXCLUDED.effective_date, modified_at = NOW();

-- User (no is_active column; auth_id and modified_at are required)
INSERT INTO "user" (id, email, name, org_id, auth_id, modified_at)
VALUES ('usr_broker_test', 'broker-test@example.com', 'Broker Test User', 'org_broker_test', 'broker-test', NOW())
ON CONFLICT (id) DO NOTHING;

-- Source system (Questrade connection) — refresh_token is plain text here
-- In production it is AES-256-CBC encrypted; tests use the mock connector directly
-- so this row is used only for integration/live tests.
INSERT INTO source_system (
  id, org_id, system_type, name, is_active,
  connection_config,
  created_at, modified_at
)
VALUES (
  'srcsys_qt_test',
  'org_broker_test',
  'questrade',
  'My Questrade (Test)',
  true,
  '{"oauth":{"refresh_token":"L-ZMusVF9sQ_cwpkBWv7wYd-uJ8DN3df0","token_endpoint":"https://login.questrade.com/oauth2/token"}}',
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
  org_id   = 'org_broker_test',  -- always restore to test org (may have been moved by live-data migration)
  is_active = true;
  -- Note: connection_config is NOT updated on conflict — preserve any real PAT already set
