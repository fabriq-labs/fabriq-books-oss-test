-- Datalake bootstrap for ERP forward sync (Airbyte landing + dbt sync_batch).
-- Safe to re-run. Does not create qb_* raw tables (Airbyte owns those).

CREATE SCHEMA IF NOT EXISTS datalake;

CREATE TABLE IF NOT EXISTS datalake.sync_batch (
  id              VARCHAR(50) PRIMARY KEY DEFAULT ('syncb_' || gen_random_uuid()::text),
  org_id          TEXT NOT NULL,
  source_system_id TEXT,
  system_type     TEXT,
  stream_name     TEXT,
  airbyte_job_id  TEXT,
  status          TEXT,
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  row_count       INTEGER,
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_batch_org_id_idx ON datalake.sync_batch (org_id);
CREATE INDEX IF NOT EXISTS sync_batch_airbyte_job_id_idx ON datalake.sync_batch (airbyte_job_id);
CREATE INDEX IF NOT EXISTS sync_batch_source_system_id_idx ON datalake.sync_batch (source_system_id);
