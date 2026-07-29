-- Tax Phase A: view permissions + role_view for new tax models.
-- Run after: npm run sync-metadata (imports view JSON files)

INSERT INTO permission (id, view_id, field_name, access, created_at, updated_at) VALUES
  ('perm_tax_region_001', 'view_tax_region_001', '*', 'write', NOW(), NOW()),
  ('perm_tax_group_001', 'view_tax_group_001', '*', 'write', NOW(), NOW()),
  ('perm_tax_group_comp_001', 'view_tax_group_component_001', '*', 'write', NOW(), NOW()),
  ('perm_party_tax_reg_001', 'view_party_tax_reg_001', '*', 'write', NOW(), NOW()),
  ('perm_invoice_line_tax_001', 'view_invoice_line_tax_001', '*', 'write', NOW(), NOW()),
  ('perm_entity_tax_settings_001', 'view_entity_tax_settings_001', '*', 'write', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Super Admin, Admin, Finance Team
INSERT INTO role_view (id, role_id, view_id, created_at, updated_at) VALUES
  ('rovi_tax_region_sa', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_tax_region_001', NOW(), NOW()),
  ('rovi_tax_region_admin', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_tax_region_001', NOW(), NOW()),
  ('rovi_tax_region_fin', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_tax_region_001', NOW(), NOW()),
  ('rovi_tax_group_sa', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_tax_group_001', NOW(), NOW()),
  ('rovi_tax_group_admin', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_tax_group_001', NOW(), NOW()),
  ('rovi_tax_group_fin', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_tax_group_001', NOW(), NOW()),
  ('rovi_tax_gc_sa', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_tax_group_component_001', NOW(), NOW()),
  ('rovi_tax_gc_admin', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_tax_group_component_001', NOW(), NOW()),
  ('rovi_tax_gc_fin', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_tax_group_component_001', NOW(), NOW()),
  ('rovi_party_tax_sa', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_party_tax_reg_001', NOW(), NOW()),
  ('rovi_party_tax_admin', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_party_tax_reg_001', NOW(), NOW()),
  ('rovi_party_tax_fin', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_party_tax_reg_001', NOW(), NOW()),
  ('rovi_iltax_sa', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_invoice_line_tax_001', NOW(), NOW()),
  ('rovi_iltax_admin', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_invoice_line_tax_001', NOW(), NOW()),
  ('rovi_iltax_fin', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_invoice_line_tax_001', NOW(), NOW()),
  ('rovi_enttax_sa', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_entity_tax_settings_001', NOW(), NOW()),
  ('rovi_enttax_admin', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_entity_tax_settings_001', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
