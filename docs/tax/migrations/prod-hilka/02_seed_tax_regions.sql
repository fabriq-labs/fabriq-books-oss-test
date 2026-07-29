-- ============================================================================
-- System tax regions (shared). Includes Punjab (PB) required for Knack GSTIN 03…
-- Safe to re-run (ON CONFLICT upsert).
-- ============================================================================

BEGIN;

INSERT INTO tax_region (id, country_code, code, name, region_type, org_id, created_at, modified_at) VALUES
  ('txreg_in_mh', 'IN', 'MH', 'Maharashtra', 'state', 'system', NOW(), NOW()),
  ('txreg_in_ka', 'IN', 'KA', 'Karnataka', 'state', 'system', NOW(), NOW()),
  ('txreg_in_tn', 'IN', 'TN', 'Tamil Nadu', 'state', 'system', NOW(), NOW()),
  ('txreg_in_dl', 'IN', 'DL', 'Delhi', 'state', 'system', NOW(), NOW()),
  ('txreg_in_gj', 'IN', 'GJ', 'Gujarat', 'state', 'system', NOW(), NOW()),
  ('txreg_in_ts', 'IN', 'TS', 'Telangana', 'state', 'system', NOW(), NOW()),
  ('txreg_in_up', 'IN', 'UP', 'Uttar Pradesh', 'state', 'system', NOW(), NOW()),
  ('txreg_in_wb', 'IN', 'WB', 'West Bengal', 'state', 'system', NOW(), NOW()),
  ('txreg_in_rj', 'IN', 'RJ', 'Rajasthan', 'state', 'system', NOW(), NOW()),
  ('txreg_in_hr', 'IN', 'HR', 'Haryana', 'state', 'system', NOW(), NOW()),
  ('txreg_in_pb', 'IN', 'PB', 'Punjab', 'state', 'system', NOW(), NOW()),
  ('txreg_ca_on', 'CA', 'ON', 'Ontario', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_bc', 'CA', 'BC', 'British Columbia', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_ab', 'CA', 'AB', 'Alberta', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_qc', 'CA', 'QC', 'Quebec', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_mb', 'CA', 'MB', 'Manitoba', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_sk', 'CA', 'SK', 'Saskatchewan', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_ns', 'CA', 'NS', 'Nova Scotia', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_nb', 'CA', 'NB', 'New Brunswick', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_nl', 'CA', 'NL', 'Newfoundland and Labrador', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_pe', 'CA', 'PE', 'Prince Edward Island', 'province', 'system', NOW(), NOW()),
  ('txreg_ca_nt', 'CA', 'NT', 'Northwest Territories', 'territory', 'system', NOW(), NOW()),
  ('txreg_ca_yt', 'CA', 'YT', 'Yukon', 'territory', 'system', NOW(), NOW()),
  ('txreg_ca_nu', 'CA', 'NU', 'Nunavut', 'territory', 'system', NOW(), NOW())
ON CONFLICT (country_code, code, org_id) DO UPDATE
  SET name = EXCLUDED.name,
      region_type = EXCLUDED.region_type,
      modified_at = NOW();

COMMIT;
