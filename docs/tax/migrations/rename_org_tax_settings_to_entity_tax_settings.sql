-- ============================================================================
-- Migrate org_tax_settings → entity_tax_settings (pack per legal entity).
-- Use when an environment already created org_tax_settings (Phase A name).
-- Fresh installs: skip this and use prod-hilka/01_ddl (or prisma db push) instead.
-- Review before apply. Prefer sandbox first.
-- ============================================================================

BEGIN;

-- Create new table if missing
CREATE TABLE IF NOT EXISTS entity_tax_settings (
  id                                VARCHAR(50) PRIMARY KEY DEFAULT concat('enttax_', gen_random_uuid()),
  legal_entity_id                   VARCHAR(50) NOT NULL,
  org_id                            TEXT        NOT NULL,
  tax_country_pack                  TEXT        NOT NULL DEFAULT 'GENERIC',
  require_classification_on_taxable BOOLEAN     NOT NULL DEFAULT false,
  enable_tax_responsibility         BOOLEAN     NOT NULL DEFAULT false,
  created_by                        TEXT,
  created_at                        TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  modified_by                       TEXT,
  modified_at                       TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  assigned_to                       TEXT,
  CONSTRAINT entity_tax_settings_legal_entity_id_key UNIQUE (legal_entity_id)
);
CREATE INDEX IF NOT EXISTS entity_tax_settings_org_id_idx ON entity_tax_settings (org_id);

-- Copy rows from legacy table: treat old org_id as legal_entity_id when an entity
-- with that id exists; otherwise skip (tenant-only keys without matching LE).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_tax_settings'
  ) THEN
    INSERT INTO entity_tax_settings (
      id, legal_entity_id, org_id, tax_country_pack,
      require_classification_on_taxable, enable_tax_responsibility,
      created_by, created_at, modified_by, modified_at, assigned_to
    )
    SELECT
      CASE
        WHEN o.id LIKE 'orgtax_%' THEN replace(o.id, 'orgtax_', 'enttax_')
        ELSE o.id
      END,
      o.org_id,
      COALESCE(e.org_id, o.org_id),
      o.tax_country_pack,
      o.require_classification_on_taxable,
      o.enable_tax_responsibility,
      o.created_by,
      o.created_at,
      o.modified_by,
      o.modified_at,
      o.assigned_to
    FROM org_tax_settings o
    LEFT JOIN entity e ON e.id = o.org_id
    WHERE EXISTS (SELECT 1 FROM entity e2 WHERE e2.id = o.org_id)
    ON CONFLICT (legal_entity_id) DO UPDATE
      SET tax_country_pack = EXCLUDED.tax_country_pack,
          org_id = EXCLUDED.org_id,
          enable_tax_responsibility = EXCLUDED.enable_tax_responsibility,
          modified_at = NOW();

    DROP TABLE org_tax_settings;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_tax_settings_legal_entity_id_fkey'
  ) THEN
    ALTER TABLE entity_tax_settings
      ADD CONSTRAINT entity_tax_settings_legal_entity_id_fkey
      FOREIGN KEY (legal_entity_id) REFERENCES entity(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- Drop legacy view metadata row if present (re-sync from JSON after deploy)
DELETE FROM role_view WHERE view_id = 'view_org_tax_settings_001';
DELETE FROM permission WHERE view_id = 'view_org_tax_settings_001';
DELETE FROM view WHERE id = 'view_org_tax_settings_001';

COMMIT;
