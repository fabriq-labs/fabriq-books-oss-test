-- Phase B demo identity: tax regions, GSTINs, HSN codes for indian-demo.
-- Seller HQ (org_indian_demo entity) is Karnataka → same-state vs MH/GJ/TS customers.

-- Entity default regions
UPDATE entity SET default_tax_region_id = 'txreg_in_ka', tax_treatment = 'registered', modified_at = NOW()
WHERE id = 'org_indian_demo';
UPDATE entity SET default_tax_region_id = 'txreg_in_mh', tax_treatment = 'registered', modified_at = NOW()
WHERE id = 'org_mumbai_branch';
UPDATE entity SET default_tax_region_id = 'txreg_in_ka', tax_treatment = 'registered', modified_at = NOW()
WHERE id = 'org_bangalore_office';

-- Customer default regions (from address state)
UPDATE customers SET default_tax_region_id = 'txreg_in_mh', tax_treatment = 'registered', modified_at = NOW()
WHERE id IN (
  'cust_tata_consultancy','cust_reliance_industries','cust_hdfc_bank',
  'cust_icici_bank','cust_mahindra_group','cust_bajaj_auto'
);
UPDATE customers SET default_tax_region_id = 'txreg_in_ka', tax_treatment = 'registered', modified_at = NOW()
WHERE id IN ('cust_infosys','cust_wipro');
UPDATE customers SET default_tax_region_id = 'txreg_in_ts', tax_treatment = 'registered', modified_at = NOW()
WHERE id = 'cust_dr_reddy_labs';
UPDATE customers SET default_tax_region_id = 'txreg_in_gj', tax_treatment = 'registered', modified_at = NOW()
WHERE id = 'cust_sun_pharma';

-- Seller GSTIN (Karnataka — state code 29)
INSERT INTO party_tax_registration (
  id, party_type, party_id, scheme, registration_number, tax_region_id, is_primary, org_id, created_at, modified_at
) VALUES
  ('ptxr_seller_hq', 'entity', 'org_indian_demo', 'GSTIN', '29AABCD1234A1Z5', 'txreg_in_ka', true, 'org_indian_demo', NOW(), NOW()),
  ('ptxr_cust_infosys', 'customer', 'cust_infosys', 'GSTIN', '29AAACI1234A1Z2', 'txreg_in_ka', true, 'org_indian_demo', NOW(), NOW()),
  ('ptxr_cust_wipro', 'customer', 'cust_wipro', 'GSTIN', '29AAACW5678B1Z9', 'txreg_in_ka', true, 'org_indian_demo', NOW(), NOW()),
  ('ptxr_cust_tcs', 'customer', 'cust_tata_consultancy', 'GSTIN', '27AAACT2702Q1ZW', 'txreg_in_mh', true, 'org_indian_demo', NOW(), NOW()),
  ('ptxr_cust_ril', 'customer', 'cust_reliance_industries', 'GSTIN', '27AAACR5055K1Z7', 'txreg_in_mh', true, 'org_indian_demo', NOW(), NOW()),
  ('ptxr_cust_hdfc', 'customer', 'cust_hdfc_bank', 'GSTIN', '27AAACH2702H1Z0', 'txreg_in_mh', true, 'org_indian_demo', NOW(), NOW()),
  ('ptxr_cust_reddy', 'customer', 'cust_dr_reddy_labs', 'GSTIN', '36AABCD9876C1Z3', 'txreg_in_ts', true, 'org_indian_demo', NOW(), NOW()),
  ('ptxr_cust_sun', 'customer', 'cust_sun_pharma', 'GSTIN', '24AAACS1234D1Z8', 'txreg_in_gj', true, 'org_indian_demo', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
  SET registration_number = EXCLUDED.registration_number,
      tax_region_id = EXCLUDED.tax_region_id,
      modified_at = NOW();

-- HSN / SAC on items
UPDATE item_master SET
  hsn_code = '8471',
  classification_code = '8471',
  classification_scheme = 'HSN',
  item_tax_category = 'goods',
  modified_at = NOW()
WHERE id IN (
  'item_dell_laptop','item_dell_desktop','item_hp_laptop','item_lenovo_laptop','item_lenovo_tablet'
);
UPDATE item_master SET
  hsn_code = '8528',
  classification_code = '8528',
  classification_scheme = 'HSN',
  item_tax_category = 'goods',
  modified_at = NOW()
WHERE id IN ('item_dell_monitor');
UPDATE item_master SET
  hsn_code = '8443',
  classification_code = '8443',
  classification_scheme = 'HSN',
  item_tax_category = 'goods',
  modified_at = NOW()
WHERE id = 'item_hp_printer';
UPDATE item_master SET
  hsn_code = '8711',
  classification_code = '8711',
  classification_scheme = 'HSN',
  item_tax_category = 'goods',
  modified_at = NOW()
WHERE id IN ('item_tvs_motorcycle','item_tvs_three_wheeler');
UPDATE item_master SET
  hsn_code = '8704',
  classification_code = '8704',
  classification_scheme = 'HSN',
  item_tax_category = 'goods',
  modified_at = NOW()
WHERE id IN ('item_ashok_truck','item_maruti_car');
UPDATE item_master SET
  hsn_code = '3004',
  classification_code = '3004',
  classification_scheme = 'HSN',
  item_tax_category = 'goods',
  tax_group_id = 'txgrp_demo_gst12',
  tax_group_interstate_id = 'txgrp_demo_igst18',
  modified_at = NOW()
WHERE id IN ('item_cipla_medicine','item_lupin_tablets','item_torrent_injection');
-- Note: demo has no IGST12 group wired as interstate for pharma; use IGST18 group only if exists —
-- prefer creating IGST12 mapping: already have tax_demo_igst12. Fix interstate for 12% items:
UPDATE item_master SET tax_group_interstate_id = 'txgrp_demo_igst18'
WHERE id IN ('item_cipla_medicine','item_lupin_tablets','item_torrent_injection');

-- Add IGST12 group if missing
INSERT INTO tax_group (id, name, code, country_code, status, org_id, created_at, modified_at) VALUES
  ('txgrp_demo_igst12', 'IGST 12%', 'IGST12', 'IN', 'Active', 'org_indian_demo', NOW(), NOW())
ON CONFLICT (org_id, code) DO NOTHING;
INSERT INTO tax_group_component (id, tax_group_id, tax_master_id, sequence, org_id, created_at, modified_at) VALUES
  ('txgc_demo_igst12', 'txgrp_demo_igst12', 'tax_demo_igst12', 1, 'org_indian_demo', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
UPDATE item_master SET tax_group_interstate_id = 'txgrp_demo_igst12', modified_at = NOW()
WHERE id IN ('item_cipla_medicine','item_lupin_tablets','item_torrent_injection');

UPDATE item_master SET
  hsn_code = '9983',
  classification_code = '9983',
  classification_scheme = 'SAC',
  item_tax_category = 'services',
  modified_at = NOW()
WHERE id IN (
  'item_it_consulting','item_software_development','item_cloud_migration',
  'item_cybersecurity','item_network_setup'
);
UPDATE item_master SET
  hsn_code = '4011',
  classification_code = '4011',
  classification_scheme = 'HSN',
  item_tax_category = 'goods',
  modified_at = NOW()
WHERE id = 'item_apollo_tyres';
