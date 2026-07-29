-- ============================================================================
-- Tax architecture DDL for environments that only have legacy tax_master.
-- Idempotent where practical. DO NOT auto-run against prod — review first.
-- Matches Prisma models in backend/prisma/schema/tax.prisma + extensions in zeiv.prisma
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tax_region (
  id           VARCHAR(50) PRIMARY KEY DEFAULT concat('txreg_', gen_random_uuid()),
  country_code VARCHAR(2)  NOT NULL,
  code         VARCHAR(16) NOT NULL,
  name         TEXT        NOT NULL,
  region_type  VARCHAR(32),
  org_id       TEXT        NOT NULL DEFAULT 'system',
  created_by   TEXT,
  created_at   TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  modified_by  TEXT,
  modified_at  TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  assigned_to  TEXT,
  CONSTRAINT tax_region_country_code_code_org_id_key UNIQUE (country_code, code, org_id)
);
CREATE INDEX IF NOT EXISTS tax_region_country_code_idx ON tax_region (country_code);

CREATE TABLE IF NOT EXISTS tax_group (
  id           VARCHAR(50) PRIMARY KEY DEFAULT concat('txgrp_', gen_random_uuid()),
  name         TEXT        NOT NULL,
  code         TEXT        NOT NULL,
  country_code VARCHAR(2),
  status       TEXT        DEFAULT 'Active',
  org_id       TEXT        NOT NULL,
  created_by   TEXT,
  created_at   TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  modified_by  TEXT,
  modified_at  TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  assigned_to  TEXT,
  CONSTRAINT tax_group_org_id_code_key UNIQUE (org_id, code)
);
CREATE INDEX IF NOT EXISTS tax_group_org_id_idx ON tax_group (org_id);

CREATE TABLE IF NOT EXISTS tax_group_component (
  id            VARCHAR(50) PRIMARY KEY DEFAULT concat('txgc_', gen_random_uuid()),
  tax_group_id  TEXT        NOT NULL,
  tax_master_id TEXT        NOT NULL,
  sequence      INTEGER     NOT NULL DEFAULT 1,
  org_id        TEXT,
  created_by    TEXT,
  created_at    TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  modified_by   TEXT,
  modified_at   TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  assigned_to   TEXT,
  CONSTRAINT tax_group_component_tax_group_id_tax_master_id_key UNIQUE (tax_group_id, tax_master_id)
);
CREATE INDEX IF NOT EXISTS tax_group_component_tax_group_id_idx ON tax_group_component (tax_group_id);

CREATE TABLE IF NOT EXISTS party_tax_registration (
  id                  VARCHAR(50) PRIMARY KEY DEFAULT concat('ptxr_', gen_random_uuid()),
  party_type          TEXT        NOT NULL,
  party_id            VARCHAR(50) NOT NULL,
  scheme              TEXT        NOT NULL,
  registration_number TEXT        NOT NULL,
  tax_region_id       TEXT,
  is_primary          BOOLEAN     NOT NULL DEFAULT true,
  effective_from      TIMESTAMP(3),
  effective_to        TIMESTAMP(3),
  org_id              TEXT        NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  modified_by         TEXT,
  modified_at         TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  assigned_to         TEXT
);
CREATE INDEX IF NOT EXISTS party_tax_registration_org_id_idx ON party_tax_registration (org_id);
CREATE INDEX IF NOT EXISTS party_tax_registration_party_type_party_id_idx
  ON party_tax_registration (party_type, party_id);

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

CREATE TABLE IF NOT EXISTS invoice_line_tax (
  id                   VARCHAR(50) PRIMARY KEY DEFAULT concat('inltx_', gen_random_uuid()),
  invoice_line_item_id TEXT             NOT NULL,
  tax_master_id        TEXT             NOT NULL,
  tax_group_id         TEXT,
  rate                 DOUBLE PRECISION NOT NULL,
  amount               DOUBLE PRECISION NOT NULL,
  component_type       TEXT,
  org_id               TEXT,
  created_by           TEXT,
  created_at           TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  modified_by          TEXT,
  modified_at          TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  assigned_to          TEXT
);
CREATE INDEX IF NOT EXISTS invoice_line_tax_invoice_line_item_id_idx
  ON invoice_line_tax (invoice_line_item_id);

-- ---------------------------------------------------------------------------
-- Alter existing tables (add columns if missing)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tax_master' AND column_name='component_type') THEN
    ALTER TABLE tax_master ADD COLUMN component_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tax_master' AND column_name='is_recoverable') THEN
    ALTER TABLE tax_master ADD COLUMN is_recoverable BOOLEAN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='entity' AND column_name='tax_treatment') THEN
    ALTER TABLE entity ADD COLUMN tax_treatment TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='entity' AND column_name='default_tax_region_id') THEN
    ALTER TABLE entity ADD COLUMN default_tax_region_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='tax_treatment') THEN
    ALTER TABLE customers ADD COLUMN tax_treatment TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='default_tax_region_id') THEN
    ALTER TABLE customers ADD COLUMN default_tax_region_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_master' AND column_name='tax_group_id') THEN
    ALTER TABLE item_master ADD COLUMN tax_group_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_master' AND column_name='tax_group_interstate_id') THEN
    ALTER TABLE item_master ADD COLUMN tax_group_interstate_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_master' AND column_name='classification_code') THEN
    ALTER TABLE item_master ADD COLUMN classification_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_master' AND column_name='classification_scheme') THEN
    ALTER TABLE item_master ADD COLUMN classification_scheme TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_master' AND column_name='item_tax_category') THEN
    ALTER TABLE item_master ADD COLUMN item_tax_category TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice' AND column_name='tax_region_id') THEN
    ALTER TABLE invoice ADD COLUMN tax_region_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice' AND column_name='seller_tax_region_id') THEN
    ALTER TABLE invoice ADD COLUMN seller_tax_region_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice' AND column_name='tax_responsibility') THEN
    ALTER TABLE invoice ADD COLUMN tax_responsibility TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_line_item' AND column_name='tax_group_id') THEN
    ALTER TABLE invoice_line_item ADD COLUMN tax_group_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_line_item' AND column_name='classification_code') THEN
    ALTER TABLE invoice_line_item ADD COLUMN classification_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_line_item' AND column_name='classification_scheme') THEN
    ALTER TABLE invoice_line_item ADD COLUMN classification_scheme TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_line_item' AND column_name='taxable_amount') THEN
    ALTER TABLE invoice_line_item ADD COLUMN taxable_amount DOUBLE PRECISION;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Foreign keys (skip if already present)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_group_component_tax_group_id_fkey') THEN
    ALTER TABLE tax_group_component
      ADD CONSTRAINT tax_group_component_tax_group_id_fkey
      FOREIGN KEY (tax_group_id) REFERENCES tax_group(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_group_component_tax_master_id_fkey') THEN
    ALTER TABLE tax_group_component
      ADD CONSTRAINT tax_group_component_tax_master_id_fkey
      FOREIGN KEY (tax_master_id) REFERENCES tax_master(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'party_tax_registration_tax_region_id_fkey') THEN
    ALTER TABLE party_tax_registration
      ADD CONSTRAINT party_tax_registration_tax_region_id_fkey
      FOREIGN KEY (tax_region_id) REFERENCES tax_region(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_default_tax_region_id_fkey') THEN
    ALTER TABLE entity
      ADD CONSTRAINT entity_default_tax_region_id_fkey
      FOREIGN KEY (default_tax_region_id) REFERENCES tax_region(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_default_tax_region_id_fkey') THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_default_tax_region_id_fkey
      FOREIGN KEY (default_tax_region_id) REFERENCES tax_region(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_master_tax_group_id_fkey') THEN
    ALTER TABLE item_master
      ADD CONSTRAINT item_master_tax_group_id_fkey
      FOREIGN KEY (tax_group_id) REFERENCES tax_group(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_master_tax_group_interstate_id_fkey') THEN
    ALTER TABLE item_master
      ADD CONSTRAINT item_master_tax_group_interstate_id_fkey
      FOREIGN KEY (tax_group_interstate_id) REFERENCES tax_group(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_tax_region_id_fkey') THEN
    ALTER TABLE invoice
      ADD CONSTRAINT invoice_tax_region_id_fkey
      FOREIGN KEY (tax_region_id) REFERENCES tax_region(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_seller_tax_region_id_fkey') THEN
    ALTER TABLE invoice
      ADD CONSTRAINT invoice_seller_tax_region_id_fkey
      FOREIGN KEY (seller_tax_region_id) REFERENCES tax_region(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_item_tax_group_id_fkey') THEN
    ALTER TABLE invoice_line_item
      ADD CONSTRAINT invoice_line_item_tax_group_id_fkey
      FOREIGN KEY (tax_group_id) REFERENCES tax_group(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_tax_invoice_line_item_id_fkey') THEN
    ALTER TABLE invoice_line_tax
      ADD CONSTRAINT invoice_line_tax_invoice_line_item_id_fkey
      FOREIGN KEY (invoice_line_item_id) REFERENCES invoice_line_item(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_tax_tax_master_id_fkey') THEN
    ALTER TABLE invoice_line_tax
      ADD CONSTRAINT invoice_line_tax_tax_master_id_fkey
      FOREIGN KEY (tax_master_id) REFERENCES tax_master(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_tax_tax_group_id_fkey') THEN
    ALTER TABLE invoice_line_tax
      ADD CONSTRAINT invoice_line_tax_tax_group_id_fkey
      FOREIGN KEY (tax_group_id) REFERENCES tax_group(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_tax_settings_legal_entity_id_fkey') THEN
    ALTER TABLE entity_tax_settings
      ADD CONSTRAINT entity_tax_settings_legal_entity_id_fkey
      FOREIGN KEY (legal_entity_id) REFERENCES entity(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
