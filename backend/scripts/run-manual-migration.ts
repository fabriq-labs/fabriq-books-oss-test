import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Running manual migration...');
    
    // 1. Create table
    console.log('Creating table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "public"."source_system" (
        "id" VARCHAR(50) NOT NULL DEFAULT 'srcsys_' || gen_random_uuid(),
        "org_id" VARCHAR(50) NOT NULL,
        "system_type" VARCHAR(255) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "region" VARCHAR(255),
        "connector_version" VARCHAR(255),
        "connection_config" JSONB NOT NULL,
        "is_active" BOOLEAN DEFAULT true,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_by" VARCHAR(255),
        "modified_by" VARCHAR(255),

        CONSTRAINT "source_system_pkey" PRIMARY KEY ("id")
      );
    `);

    // 2. Create index
    console.log('Creating index...');
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "source_system_org_id_system_type_key" ON "public"."source_system"("org_id", "system_type");
    `);

    // 3. Migrate data
    console.log('Migrating data...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'datalake' AND table_name = 'source_system') THEN
              INSERT INTO "public"."source_system" (
                  id, org_id, system_type, name, region, connector_version, is_active, created_at, modified_at, created_by, modified_by, connection_config
              )
              SELECT 
                  id, 
                  COALESCE(org_id, 'org_default'), -- Default org_id if null
                  system_type, 
                  name, 
                  region, 
                  connector_version, 
                  is_active, 
                  created_at, 
                  modified_at, 
                  created_by, 
                  modified_by,
                  '{}'::jsonb -- Empty config for migrated records
              FROM "datalake"."source_system"
              ON CONFLICT ("org_id", "system_type") DO NOTHING;
          END IF;
      END
      $$;
    `);

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
