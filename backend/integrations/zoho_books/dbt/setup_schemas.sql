-- Create required schemas for DBT pipeline
-- Note: staging views are now in datalake schema (no separate staging schema)

-- Grant permissions to postgres user (adjust as needed)
GRANT ALL ON SCHEMA datalake TO postgres;
GRANT ALL ON SCHEMA public TO postgres;

-- Note: Integration tables (source_system, sync_batch) and staging views (stg_*) 
-- are all managed by DBT in datalake schema
-- Use setup_datalake_tables.sql for initial seed data if needed
