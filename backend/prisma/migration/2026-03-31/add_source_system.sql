-- source_system: last sync metadata + Airbyte extraction_config
-- Matches prisma/schema/metadata.prisma model source_system

ALTER TABLE source_system ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP(3);
ALTER TABLE source_system ADD COLUMN IF NOT EXISTS last_sync_status JSONB;
ALTER TABLE source_system ADD COLUMN IF NOT EXISTS extraction_config JSONB;
