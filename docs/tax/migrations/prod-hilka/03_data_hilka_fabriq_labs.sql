-- ============================================================================
-- Data migration for Hilka Digital Private Limited
--   legal_entity_id = org_f42159ce-658b-4152-8841-7c1b6f9e881a
--   tenant org_id    = org_fabriq-labs-inc
--
-- Creates IN tax_master + tax_group rows on the TENANT (required by schema).
-- Stamps entity/customers/items for Hilka usage.
-- Does NOT rewrite historical invoice_line_tax by default (see optional section).
--
-- Review before apply. Prefer sandbox clone first.
-- ============================================================================

BEGIN;

-- Constants (for readability in comments):
-- LE      = org_f42159ce-658b-4152-8841-7c1b6f9e881a
-- TENANT  = org_fabriq-labs-inc
-- Knack   = cust_e0256bf3-84bd-4a56-a12e-7e2279d501cd
-- Unity   = cust_23ad37e0-fc2e-46c4-b0ce-7a4d27de8776

-- ---------------------------------------------------------------------------
-- 1) Tax country pack PER LEGAL ENTITY (not tenant)
-- ---------------------------------------------------------------------------
INSERT INTO entity_tax_settings (
  id, legal_entity_id, org_id, tax_country_pack, require_classification_on_taxable, enable_tax_responsibility, created_at, modified_at
) VALUES
  -- Hilka Digital (India)
  ('enttax_hilka', 'org_f42159ce-658b-4152-8841-7c1b6f9e881a', 'org_fabriq-labs-inc', 'IN', false, true, NOW(), NOW()),
  -- Sibling Canada LEs under same tenant (explicit so they do not inherit IN)
  ('enttax_fabriq_labs_ca', 'ent_596eb799-858f-4f61-883f-888672024e7d', 'org_fabriq-labs-inc', 'CA', false, false, NOW(), NOW()),
  ('enttax_prasanna_ca', 'ent_3850e52e-1b10-439a-b8bd-29e492c9fd9a', 'org_fabriq-labs-inc', 'CA', false, false, NOW(), NOW()),
  ('enttax_prasanna_in', 'ent_f687b778-cfdf-4a7f-9883-c3a1217bb3e2', 'org_fabriq-labs-inc', 'IN', false, true, NOW(), NOW())
ON CONFLICT (legal_entity_id) DO UPDATE
  SET tax_country_pack = EXCLUDED.tax_country_pack,
      org_id = EXCLUDED.org_id,
      enable_tax_responsibility = EXCLUDED.enable_tax_responsibility,
      modified_at = NOW();

-- ---------------------------------------------------------------------------
-- 2) tax_master components for tenant (none exist today)
-- ---------------------------------------------------------------------------
INSERT INTO tax_master (
  id, tax_name, tax_code, tax_rate, effective_from, geo, status, org_id, component_type, created_at, modified_at
) VALUES
  ('tax_fl_cgst9',  'CGST 9%',  'FL_CGST9',  9,  '2024-01-01', 'IN', 'Active', 'org_fabriq-labs-inc', 'cgst', NOW(), NOW()),
  ('tax_fl_sgst9',  'SGST 9%',  'FL_SGST9',  9,  '2024-01-01', 'IN', 'Active', 'org_fabriq-labs-inc', 'sgst', NOW(), NOW()),
  ('tax_fl_igst18', 'IGST 18%', 'FL_IGST18', 18, '2024-01-01', 'IN', 'Active', 'org_fabriq-labs-inc', 'igst', NOW(), NOW()),
  ('tax_fl_gst0',   'GST 0% (zero-rated / export)', 'FL_GST0', 0, '2024-01-01', 'IN', 'Active', 'org_fabriq-labs-inc', 'other', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
  SET tax_name = EXCLUDED.tax_name,
      tax_rate = EXCLUDED.tax_rate,
      component_type = EXCLUDED.component_type,
      status = EXCLUDED.status,
      modified_at = NOW();

-- ---------------------------------------------------------------------------
-- 3) tax_group compositions
-- ---------------------------------------------------------------------------
INSERT INTO tax_group (id, name, code, country_code, status, org_id, created_at, modified_at) VALUES
  ('txgrp_fl_gst18',  'GST 18% (CGST+SGST)', 'GST18',  'IN', 'Active', 'org_fabriq-labs-inc', NOW(), NOW()),
  ('txgrp_fl_igst18', 'IGST 18%',            'IGST18', 'IN', 'Active', 'org_fabriq-labs-inc', NOW(), NOW()),
  ('txgrp_fl_gst0',   'GST 0% (export / overseas)', 'GST0', 'IN', 'Active', 'org_fabriq-labs-inc', NOW(), NOW())
ON CONFLICT (org_id, code) DO UPDATE
  SET name = EXCLUDED.name,
      status = EXCLUDED.status,
      country_code = EXCLUDED.country_code,
      modified_at = NOW();

INSERT INTO tax_group_component (id, tax_group_id, tax_master_id, sequence, org_id, created_at, modified_at) VALUES
  ('txgc_fl_gst18_cgst', 'txgrp_fl_gst18',  'tax_fl_cgst9',  1, 'org_fabriq-labs-inc', NOW(), NOW()),
  ('txgc_fl_gst18_sgst', 'txgrp_fl_gst18',  'tax_fl_sgst9',  2, 'org_fabriq-labs-inc', NOW(), NOW()),
  ('txgc_fl_igst18',     'txgrp_fl_igst18', 'tax_fl_igst18', 1, 'org_fabriq-labs-inc', NOW(), NOW()),
  ('txgc_fl_gst0',       'txgrp_fl_gst0',   'tax_fl_gst0',   1, 'org_fabriq-labs-inc', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Hilka legal entity (seller) — Tamil Nadu
-- ---------------------------------------------------------------------------
UPDATE entity
SET tax_treatment = 'registered',
    default_tax_region_id = 'txreg_in_tn',
    modified_at = NOW()
WHERE id = 'org_f42159ce-658b-4152-8841-7c1b6f9e881a';

-- Seller GSTIN unknown in prod today — uncomment and set number when confirmed:
-- INSERT INTO party_tax_registration (
--   id, party_type, party_id, scheme, registration_number, tax_region_id, is_primary, org_id, created_at, modified_at
-- ) VALUES (
--   'ptxr_hilka_gstin', 'entity', 'org_f42159ce-658b-4152-8841-7c1b6f9e881a',
--   'GSTIN', 'REPLACE_WITH_HILKA_GSTIN', 'txreg_in_tn', true, 'org_fabriq-labs-inc', NOW(), NOW()
-- )
-- ON CONFLICT (id) DO UPDATE
--   SET registration_number = EXCLUDED.registration_number,
--       tax_region_id = EXCLUDED.tax_region_id,
--       modified_at = NOW();

-- ---------------------------------------------------------------------------
-- 5) Customers used with Hilka
-- ---------------------------------------------------------------------------
-- Knack: India / Punjab (GSTIN state code 03), domestic registered
UPDATE customers
SET tax_treatment = 'registered',
    default_tax_region_id = 'txreg_in_pb',
    country = COALESCE(NULLIF(country, ''), 'India'),
    state = COALESCE(NULLIF(state, ''), 'Punjab'),
    modified_at = NOW()
WHERE id = 'cust_e0256bf3-84bd-4a56-a12e-7e2279d501cd'
  AND org_id = 'org_fabriq-labs-inc';

INSERT INTO party_tax_registration (
  id, party_type, party_id, scheme, registration_number, tax_region_id, is_primary, org_id, created_at, modified_at
) VALUES (
  'ptxr_knack_gstin', 'customer', 'cust_e0256bf3-84bd-4a56-a12e-7e2279d501cd',
  'GSTIN', '03AADCK2783N1ZA', 'txreg_in_pb', true, 'org_fabriq-labs-inc', NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
  SET registration_number = EXCLUDED.registration_number,
      tax_region_id = EXCLUDED.tax_region_id,
      modified_at = NOW();

-- Unity 7ai: overseas (Singapore address) — zero-rated export treatment
UPDATE customers
SET tax_treatment = 'export',
    default_tax_region_id = NULL,
    country = COALESCE(NULLIF(country, ''), 'Singapore'),
    modified_at = NOW()
WHERE id = 'cust_23ad37e0-fc2e-46c4-b0ce-7a4d27de8776'
  AND org_id = 'org_fabriq-labs-inc';

-- ---------------------------------------------------------------------------
-- 6) Item masters on tenant (used on Hilka invoices)
--     Default intra GST18; interstate/default suggestion IGST18 for TN→other states
--     For Unity/export invoices: select GST0 on the line (not auto yet)
-- ---------------------------------------------------------------------------
UPDATE item_master
SET tax_group_id = 'txgrp_fl_gst18',
    tax_group_interstate_id = 'txgrp_fl_igst18',
    classification_scheme = COALESCE(classification_scheme, 'SAC'),
    item_tax_category = COALESCE(item_tax_category, 'services'),
    modified_at = NOW()
WHERE org_id = 'org_fabriq-labs-inc'
  AND id IN (
    'prod_53f5734a-9c2c-40fc-940e-0b4a4651eb0e',
    'prod_4b31974e-fc94-4b4c-9d8a-f7feb9e009df',
    'prod_03dd0aa9-25ad-440f-beb6-518a59f2d4e2'
  );

COMMIT;

-- ============================================================================
-- OPTIONAL (commented): stamp Hilka historical invoices for structured tax display.
-- Does not create invoice_line_tax rows; re-open/edit + CA-1 would expand components.
-- Totals already match flat 18% — finance should approve before enabling.
-- ============================================================================
-- BEGIN;
-- UPDATE invoice
-- SET seller_tax_region_id = 'txreg_in_tn',
--     tax_region_id = 'txreg_in_pb',
--     modified_at = NOW()
-- WHERE legal_entity_id = 'org_f42159ce-658b-4152-8841-7c1b6f9e881a'
--   AND customer_id = 'cust_e0256bf3-84bd-4a56-a12e-7e2279d501cd';
--
-- UPDATE invoice_line_item li
-- SET tax_group_id = 'txgrp_fl_igst18',
--     classification_scheme = COALESCE(li.classification_scheme, 'SAC'),
--     modified_at = NOW()
-- FROM invoice i
-- WHERE li.instance_id = i.id
--   AND i.legal_entity_id = 'org_f42159ce-658b-4152-8841-7c1b6f9e881a'
--   AND COALESCE(li.tax_rate, 0) = 18;
-- COMMIT;
