-- Email ingest tables: run on DB then run: npx prisma generate

CREATE TABLE IF NOT EXISTS instance_email_ingest (
  id                 VARCHAR(50) PRIMARY KEY DEFAULT ('emig_' || gen_random_uuid()),
  org_id             VARCHAR(50),
  gmail_message_id   VARCHAR(255),
  gmail_thread_id    VARCHAR(255),
  from_email         VARCHAR(255),
  to_email           VARCHAR(255),
  subject            TEXT,
  received_at        TIMESTAMP(3),
  body_snippet       TEXT,
  model_name         VARCHAR(50),
  status             VARCHAR(50),
  error_message      TEXT,
  created_by         VARCHAR(50),
  created_at         TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  modified_by        VARCHAR(50),
  modified_at        TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  processed_at       TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS idx_instance_email_ingest_org_gmail ON instance_email_ingest(org_id, gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_instance_email_ingest_status ON instance_email_ingest(status);

CREATE TABLE IF NOT EXISTS instance_email_ingest_item (
  id                         VARCHAR(50) PRIMARY KEY DEFAULT ('emig_item_' || gen_random_uuid()),
  instance_email_ingest_id   VARCHAR(50) NOT NULL REFERENCES instance_email_ingest(id),
  model_name                 VARCHAR(50),
  attachment_filename        VARCHAR(255),
  extracted_data             JSONB,
  instance_id                VARCHAR(50),
  status                     VARCHAR(50),
  staged_path                VARCHAR(500),
  rejection_reason           TEXT,
  created_at                 TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  modified_at                TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instance_email_ingest_item_ingest_id ON instance_email_ingest_item(instance_email_ingest_id);
CREATE INDEX IF NOT EXISTS idx_instance_email_ingest_item_status ON instance_email_ingest_item(status);
