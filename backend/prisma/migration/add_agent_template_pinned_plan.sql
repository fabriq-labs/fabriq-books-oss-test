-- Pinned playbook + intake schema for Workbench agent templates (tax package skill).
-- Idempotent. Run: npx prisma db execute --schema prisma/schema --file prisma/migration/add_agent_template_pinned_plan.sql

ALTER TABLE agent_template ADD COLUMN IF NOT EXISTS pinned_plan JSONB;
ALTER TABLE agent_template ADD COLUMN IF NOT EXISTS intake_schema JSONB;
