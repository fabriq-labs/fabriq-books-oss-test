-- BP-3 demo: tax groups for purchase suggestion smoke (intra / inter / zero-rated).
-- Safe to re-run. Org: org_indian_demo
-- Requires tax_master rows from indian-demo / phase-b seeds.
--
-- Note: GST 18% (CGST9+SGST9) lives in backend/prisma/seed-tax-groups-in.sql as
-- txgrp_demo_gst18. Do NOT attach cgst9/sgst9 to GST12 — that made 18% PDF extracts
-- match the wrongly labeled GST12 group.

-- Ensure GST18 exists (idempotent; same as seed-tax-groups-in.sql)
INSERT INTO tax_group (id, name, code, country_code, status, org_id, created_at, modified_at) VALUES
  ('txgrp_demo_gst18', 'GST 18% (CGST+SGST)', 'GST18', 'IN', 'Active', 'org_indian_demo', NOW(), NOW())
ON CONFLICT (org_id, code) DO UPDATE
  SET name = EXCLUDED.name,
      status = 'Active',
      modified_at = NOW();

INSERT INTO tax_group_component (id, tax_group_id, tax_master_id, sequence, org_id, created_at, modified_at) VALUES
  ('txgc_demo_gst18_cgst', 'txgrp_demo_gst18', 'tax_demo_cgst9', 1, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_gst18_sgst', 'txgrp_demo_gst18', 'tax_demo_sgst9', 2, 'org_indian_demo', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 12% / IGST / zero-rated for suggestion smoke
-- GST12 uses flat GST12 master (no CGST6/SGST6 in demo tax_master).
INSERT INTO tax_group (id, name, code, country_code, status, org_id, created_at, modified_at) VALUES
  ('txgrp_demo_gst12', 'GST 12%', 'GST12', 'IN', 'Active', 'org_indian_demo', NOW(), NOW()),
  ('txgrp_demo_igst12', 'IGST 12%', 'IGST12', 'IN', 'Active', 'org_indian_demo', NOW(), NOW()),
  ('txgrp_demo_igst18', 'IGST 18%', 'IGST18', 'IN', 'Active', 'org_indian_demo', NOW(), NOW()),
  ('txgrp_demo_gst0', 'GST 0% (zero-rated / export)', 'GST0', 'IN', 'Active', 'org_indian_demo', NOW(), NOW())
ON CONFLICT (org_id, code) DO UPDATE
  SET name = EXCLUDED.name,
      status = 'Active',
      modified_at = NOW();

-- Drop wrong GST12 components (cgst9/sgst9) if a prior seed revision attached them
DELETE FROM tax_group_component
WHERE tax_group_id = 'txgrp_demo_gst12'
  AND tax_master_id IN ('tax_demo_cgst9', 'tax_demo_sgst9');

INSERT INTO tax_group_component (id, tax_group_id, tax_master_id, sequence, org_id, created_at, modified_at) VALUES
  ('txgc_demo_gst12_flat', 'txgrp_demo_gst12', 'tax_demo_gst12', 1, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_igst12', 'txgrp_demo_igst12', 'tax_demo_igst12', 1, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_igst18', 'txgrp_demo_igst18', 'tax_demo_igst18', 1, 'org_indian_demo', NOW(), NOW()),
  ('txgc_demo_gst0', 'txgrp_demo_gst0', 'tax_demo_gst0', 1, 'org_indian_demo', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Stamp common catalog items used on Without-PO bills (12% intra / IGST12 inter for suggestion demos)
UPDATE item_master SET
  tax_group_id = 'txgrp_demo_gst12',
  tax_group_interstate_id = 'txgrp_demo_igst12',
  modified_at = NOW()
WHERE id IN (
  'item_hp_laptop', 'item_dell_laptop', 'item_lenovo_laptop',
  'item_dell_desktop', 'item_dell_monitor', 'item_hp_printer'
)
AND org_id = 'org_indian_demo';

UPDATE item_master SET
  tax_group_id = 'txgrp_demo_gst12',
  tax_group_interstate_id = 'txgrp_demo_igst12',
  modified_at = NOW()
WHERE id IN ('item_cipla_medicine', 'item_lupin_tablets', 'item_torrent_injection')
AND org_id = 'org_indian_demo';
