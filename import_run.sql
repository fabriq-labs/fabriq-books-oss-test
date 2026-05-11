-- DDL for import_run table (PostgreSQL)
-- Based on backend/prisma/schema/data.prisma model: import_run

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_run_status') THEN
        CREATE TYPE import_run_status AS ENUM (
            'RECEIVED',
            'PROCESSING',
            'SUCCESS',
            'FAILED',
            'PARTIAL_SUCCESS',
            'ABANDONED'
        );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS import_run (
    id VARCHAR(50) PRIMARY KEY DEFAULT ('impr_' || gen_random_uuid()),
    created_by TEXT NULL,
    modified_by TEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
    modified_at TIMESTAMP(3) NOT NULL DEFAULT now(),
    org_id TEXT NOT NULL,
    target_model TEXT NOT NULL,
    target_view TEXT NULL,
    import_channel TEXT NOT NULL,
    source_file_name TEXT NOT NULL,
    source_mime_type TEXT NULL,
    source_file_size_bytes INTEGER NULL,
    storage_path TEXT NULL,
    status import_run_status NOT NULL,
    started_at TIMESTAMP(3) NOT NULL,
    completed_at TIMESTAMP(3) NULL,
    is_dry_run BOOLEAN NOT NULL DEFAULT false,
    records_total INTEGER NULL,
    records_success INTEGER NULL,
    records_failed INTEGER NULL,
    error_summary TEXT NULL,
    error_details JSONB NULL,
    request_context JSONB NULL,
    source_sha256 TEXT NULL,
    discard_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS import_run_org_id_created_at_idx
    ON import_run (org_id, created_at);

CREATE INDEX IF NOT EXISTS import_run_org_id_status_idx
    ON import_run (org_id, status);

CREATE INDEX IF NOT EXISTS import_run_target_model_created_at_idx
    ON import_run (target_model, created_at);
