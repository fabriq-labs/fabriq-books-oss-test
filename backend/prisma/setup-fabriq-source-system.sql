-- Setup Fabriq source system record
-- This script inserts the Fabriq source system record for internal Fabriq-created records
-- NOTE: The source_system table is now managed by Prisma in public schema

-- Create datalake schema if it doesn't exist (still needed for other tables)
CREATE SCHEMA IF NOT EXISTS datalake;

-- Insert Fabriq source system record if it doesn't exist
-- This is used for records created directly in Fabriq (not synced from external systems)
-- NOTE: connection_config is required but empty for Fabriq (no OAuth needed)
-- NOTE: org_id is required, using 'org_default' for system-wide Fabriq source system
INSERT INTO public.source_system (id, org_id, system_type, name, connection_config, is_active) 
VALUES ('srcsys_fabriq', 'org_default', 'fabriq', 'Fabriq Internal', '{}'::jsonb, true)
ON CONFLICT (org_id, system_type) DO UPDATE
SET 
    name = EXCLUDED.name,
    is_active = EXCLUDED.is_active,
    modified_at = now();

