-- Seed global system currencies (25 major currencies)
-- Run after DB schema push, before demo data setup (Step 1.7 in setup-db.js).
-- Safe to re-run: ON CONFLICT (code) DO UPDATE preserves existing rows.
-- org_id = 'system' — currencies are global infrastructure, not tenant-owned.

INSERT INTO currency (id, code, name, symbol, decimal_places, is_active, org_id, created_at, modified_at)
VALUES
  ('curr_usd', 'USD', 'US Dollar',              '$',    2, true, 'system', NOW(), NOW()),
  ('curr_eur', 'EUR', 'Euro',                   '€',    2, true, 'system', NOW(), NOW()),
  ('curr_gbp', 'GBP', 'British Pound Sterling', '£',    2, true, 'system', NOW(), NOW()),
  ('curr_jpy', 'JPY', 'Japanese Yen',           '¥',    0, true, 'system', NOW(), NOW()),
  ('curr_cad', 'CAD', 'Canadian Dollar',        'CA$',  2, true, 'system', NOW(), NOW()),
  ('curr_aud', 'AUD', 'Australian Dollar',      'A$',   2, true, 'system', NOW(), NOW()),
  ('curr_chf', 'CHF', 'Swiss Franc',            'Fr',   2, true, 'system', NOW(), NOW()),
  ('curr_cny', 'CNY', 'Chinese Yuan',           '¥',    2, true, 'system', NOW(), NOW()),
  ('curr_inr', 'INR', 'Indian Rupee',           '₹',    2, true, 'system', NOW(), NOW()),
  ('curr_sgd', 'SGD', 'Singapore Dollar',       'S$',   2, true, 'system', NOW(), NOW()),
  ('curr_hkd', 'HKD', 'Hong Kong Dollar',       'HK$',  2, true, 'system', NOW(), NOW()),
  ('curr_nok', 'NOK', 'Norwegian Krone',        'kr',   2, true, 'system', NOW(), NOW()),
  ('curr_sek', 'SEK', 'Swedish Krona',          'kr',   2, true, 'system', NOW(), NOW()),
  ('curr_dkk', 'DKK', 'Danish Krone',           'kr',   2, true, 'system', NOW(), NOW()),
  ('curr_nzd', 'NZD', 'New Zealand Dollar',     'NZ$',  2, true, 'system', NOW(), NOW()),
  ('curr_mxn', 'MXN', 'Mexican Peso',           '$',    2, true, 'system', NOW(), NOW()),
  ('curr_brl', 'BRL', 'Brazilian Real',         'R$',   2, true, 'system', NOW(), NOW()),
  ('curr_zar', 'ZAR', 'South African Rand',     'R',    2, true, 'system', NOW(), NOW()),
  ('curr_aed', 'AED', 'UAE Dirham',             'د.إ',  2, true, 'system', NOW(), NOW()),
  ('curr_php', 'PHP', 'Philippine Peso',        '₱',    2, true, 'system', NOW(), NOW()),
  ('curr_thb', 'THB', 'Thai Baht',              '฿',    2, true, 'system', NOW(), NOW()),
  ('curr_myr', 'MYR', 'Malaysian Ringgit',      'RM',   2, true, 'system', NOW(), NOW()),
  ('curr_idr', 'IDR', 'Indonesian Rupiah',      'Rp',   0, true, 'system', NOW(), NOW()),
  ('curr_krw', 'KRW', 'South Korean Won',       '₩',    0, true, 'system', NOW(), NOW()),
  ('curr_try', 'TRY', 'Turkish Lira',           '₺',    2, true, 'system', NOW(), NOW())

ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  symbol         = EXCLUDED.symbol,
  decimal_places = EXCLUDED.decimal_places,
  is_active      = EXCLUDED.is_active,
  modified_at    = NOW();
