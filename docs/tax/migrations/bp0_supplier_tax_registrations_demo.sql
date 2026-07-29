-- BP-0/BP-1 demo: supplier tax treatments + party_tax_registration for bills Seller GSTIN smoke tests.
-- Safe to re-run (upserts by fixed ids where possible).
-- Org: org_indian_demo (LE Karnataka / GSTIN 29AABCD1234A1Z5)

-- Intra-state (KA) — same region as HQ LE
UPDATE supplier
SET city = 'Bengaluru',
    state = 'Karnataka',
    tax_treatment = 'registered',
    default_tax_region_id = 'txreg_in_ka',
    modified_at = CURRENT_TIMESTAMP
WHERE id = 'supp_hp_india';

INSERT INTO party_tax_registration (
  id, party_type, party_id, scheme, registration_number, tax_region_id, is_primary, org_id
) VALUES (
  'ptxr_supp_hp_india', 'supplier', 'supp_hp_india', 'GSTIN', '29AABCH2222B1Z2', 'txreg_in_ka', true, 'org_indian_demo'
)
ON CONFLICT (id) DO UPDATE SET
  registration_number = EXCLUDED.registration_number,
  tax_region_id = EXCLUDED.tax_region_id,
  scheme = EXCLUDED.scheme,
  is_primary = EXCLUDED.is_primary,
  modified_at = CURRENT_TIMESTAMP;

-- Inter-state (DL) — different IN region vs HQ LE
UPDATE supplier
SET tax_treatment = 'registered',
    default_tax_region_id = 'txreg_in_dl',
    modified_at = CURRENT_TIMESTAMP
WHERE id = 'supp_apollo_tyres';

INSERT INTO party_tax_registration (
  id, party_type, party_id, scheme, registration_number, tax_region_id, is_primary, org_id
) VALUES (
  'ptxr_supp_apollo_tyres', 'supplier', 'supp_apollo_tyres', 'GSTIN', '07AABCA1111A1Z7', 'txreg_in_dl', true, 'org_indian_demo'
)
ON CONFLICT (id) DO UPDATE SET
  registration_number = EXCLUDED.registration_number,
  tax_region_id = EXCLUDED.tax_region_id,
  scheme = EXCLUDED.scheme,
  is_primary = EXCLUDED.is_primary,
  modified_at = CURRENT_TIMESTAMP;

-- Extra inter-state (MH)
UPDATE supplier
SET tax_treatment = 'registered',
    default_tax_region_id = 'txreg_in_mh',
    modified_at = CURRENT_TIMESTAMP
WHERE id = 'supp_cipla';

INSERT INTO party_tax_registration (
  id, party_type, party_id, scheme, registration_number, tax_region_id, is_primary, org_id
) VALUES (
  'ptxr_supp_cipla', 'supplier', 'supp_cipla', 'GSTIN', '27AABCC3333C1Z3', 'txreg_in_mh', true, 'org_indian_demo'
)
ON CONFLICT (id) DO UPDATE SET
  registration_number = EXCLUDED.registration_number,
  tax_region_id = EXCLUDED.tax_region_id,
  scheme = EXCLUDED.scheme,
  is_primary = EXCLUDED.is_primary,
  modified_at = CURRENT_TIMESTAMP;

-- Overseas / export supplier (US) + EIN as OTHER registration
INSERT INTO supplier (
  id, supplier_name, supplier_address, city, state, country, zip_code,
  primary_phone, primary_email, legal_name, status, tax_treatment,
  preferred_currency_id, onboarded_date, org_id
) VALUES (
  'supp_acme_global',
  'Acme Global Supplies Inc',
  '100 Congress Ave, Suite 400',
  'Austin',
  'Texas',
  'United States',
  '78701',
  '+1-512-555-0100',
  'ap@acmeglobal.example',
  'Acme Global Supplies Inc',
  'Active',
  'export',
  'curr_usd',
  CURRENT_TIMESTAMP,
  'org_indian_demo'
)
ON CONFLICT (id) DO UPDATE SET
  tax_treatment = EXCLUDED.tax_treatment,
  preferred_currency_id = EXCLUDED.preferred_currency_id,
  country = EXCLUDED.country,
  modified_at = CURRENT_TIMESTAMP;

INSERT INTO party_tax_registration (
  id, party_type, party_id, scheme, registration_number, tax_region_id, is_primary, org_id
) VALUES (
  'ptxr_supp_acme_global', 'supplier', 'supp_acme_global', 'OTHER', '12-3456789', NULL, true, 'org_indian_demo'
)
ON CONFLICT (id) DO UPDATE SET
  registration_number = EXCLUDED.registration_number,
  scheme = EXCLUDED.scheme,
  is_primary = EXCLUDED.is_primary,
  modified_at = CURRENT_TIMESTAMP;
