-- Setup schemas for QuickBooks integration
-- Run this before first DBT run if schemas don't exist

-- Create datalake schema (for raw QuickBooks data, staging views, and metadata)
CREATE SCHEMA IF NOT EXISTS datalake;

-- Create public schema (should already exist, but just in case)
CREATE SCHEMA IF NOT EXISTS public;

-- Grant permissions (adjust as needed for your database user)
-- GRANT ALL ON SCHEMA datalake TO your_user;
-- GRANT ALL ON SCHEMA public TO your_user;

-- Verify schemas exist
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name IN ('datalake', 'public');


