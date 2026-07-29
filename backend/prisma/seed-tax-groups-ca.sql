-- Canada pack: tax_master components + tax groups for US/CA demo org (org_techflow_us).
-- Regions are in seed-tax-regions.sql. Apply after tax tables exist.
-- Idempotent. Safe if org_techflow_us is not loaded yet (rows keyed for that org_id).

INSERT INTO tax_master (
  id, tax_name, tax_code, tax_rate, effective_from, geo, status, org_id, component_type, created_at, modified_at
) VALUES
  ('tax_ca_gst5',  'GST 5%',  'CAGST5',  5,  '2024-01-01', 'CA', 'Active', 'org_techflow_us', 'gst', NOW(), NOW()),
  ('tax_ca_hst13', 'HST 13%', 'CAHST13', 13, '2024-01-01', 'CA-ON', 'Active', 'org_techflow_us', 'hst', NOW(), NOW()),
  ('tax_ca_hst15', 'HST 15%', 'CAHST15', 15, '2024-01-01', 'CA-NS', 'Active', 'org_techflow_us', 'hst', NOW(), NOW()),
  ('tax_ca_pst7',  'PST 7%',  'CAPST7',  7,  '2024-01-01', 'CA-BC', 'Active', 'org_techflow_us', 'pst', NOW(), NOW()),
  ('tax_ca_pst6',  'PST 6%',  'CAPST6',  6,  '2024-01-01', 'CA-SK', 'Active', 'org_techflow_us', 'pst', NOW(), NOW()),
  -- tax_rate is Int in schema; store 10 as demo stand-in for QST 9.975%
  ('tax_ca_qst9975', 'QST 9.975% (demo 10%)', 'CAQST9975', 10, '2024-01-01', 'CA-QC', 'Active', 'org_techflow_us', 'qst', NOW(), NOW()),
  ('tax_ca_exempt', 'Tax exempt', 'CAEXEMPT', 0, '2024-01-01', 'CA', 'Active', 'org_techflow_us', 'other', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
  SET tax_name = EXCLUDED.tax_name,
      tax_rate = EXCLUDED.tax_rate,
      geo = EXCLUDED.geo,
      component_type = EXCLUDED.component_type,
      status = EXCLUDED.status,
      modified_at = NOW();

INSERT INTO tax_group (id, name, code, country_code, status, org_id, created_at, modified_at) VALUES
  ('txgrp_ca_on_hst13', 'ON HST 13%', 'ON_HST13', 'CA', 'Active', 'org_techflow_us', NOW(), NOW()),
  ('txgrp_ca_ns_hst15', 'NS HST 15%', 'NS_HST15', 'CA', 'Active', 'org_techflow_us', NOW(), NOW()),
  ('txgrp_ca_bc_gst_pst', 'BC GST 5% + PST 7%', 'BC_GST_PST', 'CA', 'Active', 'org_techflow_us', NOW(), NOW()),
  ('txgrp_ca_sk_gst_pst', 'SK GST 5% + PST 6%', 'SK_GST_PST', 'CA', 'Active', 'org_techflow_us', NOW(), NOW()),
  ('txgrp_ca_mb_gst_pst', 'MB GST 5% + PST 7%', 'MB_GST_PST', 'CA', 'Active', 'org_techflow_us', NOW(), NOW()),
  ('txgrp_ca_qc_gst_qst', 'QC GST 5% + QST 9.975%', 'QC_GST_QST', 'CA', 'Active', 'org_techflow_us', NOW(), NOW()),
  ('txgrp_ca_ab_gst5', 'AB GST 5%', 'AB_GST5', 'CA', 'Active', 'org_techflow_us', NOW(), NOW()),
  ('txgrp_ca_exempt', 'Exempt 0%', 'CA_EXEMPT', 'CA', 'Active', 'org_techflow_us', NOW(), NOW())
ON CONFLICT (org_id, code) DO UPDATE
  SET name = EXCLUDED.name, status = EXCLUDED.status, country_code = EXCLUDED.country_code, modified_at = NOW();

INSERT INTO tax_group_component (id, tax_group_id, tax_master_id, sequence, org_id, created_at, modified_at) VALUES
  ('txgc_ca_on_hst13', 'txgrp_ca_on_hst13', 'tax_ca_hst13', 1, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_ns_hst15', 'txgrp_ca_ns_hst15', 'tax_ca_hst15', 1, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_bc_gst', 'txgrp_ca_bc_gst_pst', 'tax_ca_gst5', 1, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_bc_pst', 'txgrp_ca_bc_gst_pst', 'tax_ca_pst7', 2, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_sk_gst', 'txgrp_ca_sk_gst_pst', 'tax_ca_gst5', 1, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_sk_pst', 'txgrp_ca_sk_gst_pst', 'tax_ca_pst6', 2, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_mb_gst', 'txgrp_ca_mb_gst_pst', 'tax_ca_gst5', 1, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_mb_pst', 'txgrp_ca_mb_gst_pst', 'tax_ca_pst7', 2, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_qc_gst', 'txgrp_ca_qc_gst_qst', 'tax_ca_gst5', 1, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_qc_qst', 'txgrp_ca_qc_gst_qst', 'tax_ca_qst9975', 2, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_ab_gst', 'txgrp_ca_ab_gst5', 'tax_ca_gst5', 1, 'org_techflow_us', NOW(), NOW()),
  ('txgc_ca_exempt', 'txgrp_ca_exempt', 'tax_ca_exempt', 1, 'org_techflow_us', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO entity_tax_settings (
  id, legal_entity_id, org_id, tax_country_pack, require_classification_on_taxable, enable_tax_responsibility, created_at, modified_at
)
SELECT 'enttax_techflow_us', 'org_techflow_us', 'org_techflow_us', 'CA', false, false, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM entity e WHERE e.id = 'org_techflow_us')
ON CONFLICT (legal_entity_id) DO UPDATE
  SET tax_country_pack = EXCLUDED.tax_country_pack,
      org_id = EXCLUDED.org_id,
      enable_tax_responsibility = EXCLUDED.enable_tax_responsibility,
      modified_at = NOW();

UPDATE entity SET default_tax_region_id = 'txreg_ca_on', tax_treatment = 'registered', modified_at = NOW()
WHERE id = 'org_techflow_us'
  AND (default_tax_region_id IS NULL OR default_tax_region_id = '');
