-- Setup integration metadata tables in datalake schema
-- This script used to create the source_system table structure
-- Now source_system is managed by Prisma in public schema (public.source_system)

-- source_system is now in public schema, managed by Prisma
-- CREATE TABLE IF NOT EXISTS datalake.source_system ... (REMOVED)

-- Note: sync_batch table will be created by DBT model: models/integrations/sync_batch.sql
