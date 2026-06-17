-- Broker test seed data
-- Run before tests: psql $DATABASE_URL -f seed.sql
-- All IDs are stable so tests can reference them by constant.

-- Org
INSERT INTO org (id, name, is_active)
VALUES ('org_broker_test', 'Broker Test Org', true)
ON CONFLICT (id) DO NOTHING;

-- Base currency (CAD)
INSERT INTO currency (id, code, name, symbol)
VALUES ('cur_cad', 'CAD', 'Canadian Dollar', '$')
ON CONFLICT (id) DO NOTHING;

INSERT INTO currency (id, code, name, symbol)
VALUES ('cur_usd', 'USD', 'US Dollar', '$')
ON CONFLICT (id) DO NOTHING;

-- Org base currency
UPDATE org SET basecurrency_id = 'cur_cad' WHERE id = 'org_broker_test';

-- Exchange rate: 1 USD = 1.36 CAD, effective today
INSERT INTO exchange_rate (id, org_id, from_currency_id, to_currency_id, rate, effective_date)
VALUES (
  'exr_usd_cad_test',
  'org_broker_test',
  'cur_usd',
  'cur_cad',
  1.36,
  CURRENT_DATE
)
ON CONFLICT (id) DO UPDATE SET rate = EXCLUDED.rate, effective_date = EXCLUDED.effective_date;

-- User
INSERT INTO "user" (id, email, name, org_id, is_active)
VALUES ('usr_broker_test', 'broker-test@example.com', 'Broker Test User', 'org_broker_test', true)
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
  '{"oauth":{"refresh_token":"TEST_REFRESH_TOKEN_REPLACE_ME","token_endpoint":"https://login.questrade.com/oauth2/token"}}',
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
  connection_config = EXCLUDED.connection_config,
  is_active = true;
