-- Setup datalake tables for Xero integration
-- Run this before first DBT run to create required metadata tables

-- =============================================================================
-- Source System Table
-- Catalog of all source systems (ERPs/CRMs)
-- NOTE: Now managed by Prisma in public.source_system
-- =============================================================================
-- CREATE TABLE IF NOT EXISTS datalake.source_system ... (REMOVED)

-- =============================================================================
-- Sync Batch Table
-- Tracks each sync operation for audit and lineage
-- =============================================================================
CREATE TABLE IF NOT EXISTS datalake.sync_batch (
    id VARCHAR(50) PRIMARY KEY,
    source_system_id VARCHAR(50) REFERENCES public.source_system(id),
    stream_name VARCHAR(100),
    namespace VARCHAR(100),
    destination_table VARCHAR(100),
    load_type VARCHAR(50),
    status VARCHAR(50),
    row_count INTEGER,
    raw_min_emitted_at TIMESTAMP,
    raw_max_emitted_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    airbyte_connection_id VARCHAR(100),
    airbyte_job_id VARCHAR(100),
    dbt_run_id VARCHAR(100),
    notes JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    modified_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sync_batch_source_system 
    ON datalake.sync_batch(source_system_id);
CREATE INDEX IF NOT EXISTS idx_sync_batch_stream 
    ON datalake.sync_batch(stream_name);
CREATE INDEX IF NOT EXISTS idx_sync_batch_airbyte_job 
    ON datalake.sync_batch(airbyte_job_id);

-- =============================================================================
-- Verify setup
-- =============================================================================
SELECT 'source_system' as table_name, count(*) as row_count FROM public.source_system
UNION ALL
SELECT 'sync_batch', count(*) FROM datalake.sync_batch;
