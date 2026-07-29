-- System tax regions (IN states + CA provinces) and per-LE tax packs for demo entities.
-- org_id = 'system' for shared regions (see tax_region model).
-- Pack is per legal entity (entity_tax_settings.legal_entity_id), not tenant.

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
  SET name = EXCLUDED.name, region_type = EXCLUDED.region_type, modified_at = NOW();

-- Demo LEs: entity id equals tenant id for these seeds (skip if LE not loaded)
INSERT INTO entity_tax_settings (
  id, legal_entity_id, org_id, tax_country_pack, require_classification_on_taxable, enable_tax_responsibility, created_at, modified_at
)
SELECT v.id, v.legal_entity_id, v.org_id, v.tax_country_pack, v.require_classification_on_taxable, v.enable_tax_responsibility, NOW(), NOW()
FROM (VALUES
  ('enttax_indian_demo', 'org_indian_demo', 'org_indian_demo', 'IN', false, true),
  ('enttax_techflow_us', 'org_techflow_us', 'org_techflow_us', 'CA', false, false)
) AS v(id, legal_entity_id, org_id, tax_country_pack, require_classification_on_taxable, enable_tax_responsibility)
WHERE EXISTS (SELECT 1 FROM entity e WHERE e.id = v.legal_entity_id)
ON CONFLICT (legal_entity_id) DO UPDATE
  SET tax_country_pack = EXCLUDED.tax_country_pack,
      org_id = EXCLUDED.org_id,
      enable_tax_responsibility = EXCLUDED.enable_tax_responsibility,
      modified_at = NOW();
