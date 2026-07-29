-- Seed IN tax groups for org_indian_demo from existing tax_master demo rows.
-- Also stamp component_type on atomic rates.

UPDATE tax_master SET component_type = 'cgst', modified_at = NOW() WHERE id = 'tax_demo_cgst9';
UPDATE tax_master SET component_type = 'sgst', modified_at = NOW() WHERE id = 'tax_demo_sgst9';
UPDATE tax_master SET component_type = 'igst', modified_at = NOW() WHERE id = 'tax_demo_igst18';
UPDATE tax_master SET component_type = 'igst', modified_at = NOW() WHERE id = 'tax_demo_igst12';
UPDATE tax_master SET component_type = 'cess', modified_at = NOW() WHERE id = 'tax_demo_cess';
UPDATE tax_master SET component_type = 'other', modified_at = NOW() WHERE id IN ('tax_demo_gst18','tax_demo_gst12','tax_demo_gst5','tax_demo_gst0','tax_demo_tds');

INSERT INTO tax_group (id, name, code, country_code, status, org_id, created_at, modified_at) VALUES
  ('txgrp_demo_gst18', 'GST 18% (CGST+SGST)', 'GST18', 'IN', 'Active', 'org_indian_demo', NOW(), NOW()),
  ('txgrp_demo_igst18', 'IGST 18%', 'IGST18', 'IN', 'Active', 'org_indian_demo', NOW(), NOW()),
  ('txgrp_demo_gst12', 'GST 12% (flat)', 'GST12', 'IN', 'Active', 'org_indian_demo', NOW(), NOW()),
  ('txgrp_demo_gst5', 'GST 5% (flat)', 'GST5', 'IN', 'Active', 'org_indian_demo', NOW(), NOW()),
  ('txgrp_demo_gst0', 'GST 0%', 'GST0', 'IN', 'Active', 'org_indian_demo', NOW(), NOW())
ON CONFLICT (org_id, code) DO UPDATE
  SET name = EXCLUDED.name, status = EXCLUDED.status, modified_at = NOW();

INSERT INTO tax_group_component (id, tax_group_id, tax_master_id, sequence, org_id, created_at, modified_at) VALUES
  ('txgc_demo_gst18_cgst', 'txgrp_demo_gst18', 'tax_demo_cgst9', 1, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_gst18_sgst', 'txgrp_demo_gst18', 'tax_demo_sgst9', 2, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_igst18', 'txgrp_demo_igst18', 'tax_demo_igst18', 1, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_gst12', 'txgrp_demo_gst12', 'tax_demo_gst12', 1, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_gst5', 'txgrp_demo_gst5', 'tax_demo_gst5', 1, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_gst0', 'txgrp_demo_gst0', 'tax_demo_gst0', 1, 'org_indian_demo', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Point a few demo items at tax groups (keep old FKs)
UPDATE item_master
SET tax_group_id = 'txgrp_demo_gst18',
    tax_group_interstate_id = 'txgrp_demo_igst18',
    classification_code = COALESCE(NULLIF(hsn_code, ''), classification_code),
    classification_scheme = CASE WHEN hsn_code IS NOT NULL AND hsn_code <> '' THEN 'HSN' ELSE classification_scheme END,
    modified_at = NOW()
WHERE org_id = 'org_indian_demo'
  AND tax_group_id IS NULL;
