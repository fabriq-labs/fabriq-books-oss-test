-- Add api_key column to user table for programmatic API access
-- The column stores a bcrypt-hashed API key
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS api_key VARCHAR(255);
