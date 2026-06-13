-- Add audit/user-tracking columns to agent_model_tool_config
-- Run manually, then: npx prisma generate

ALTER TABLE agent_model_tool_config ADD COLUMN IF NOT EXISTS created_by VARCHAR(50);
ALTER TABLE agent_model_tool_config ADD COLUMN IF NOT EXISTS modified_by VARCHAR(50);
ALTER TABLE agent_model_tool_config ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(50);
