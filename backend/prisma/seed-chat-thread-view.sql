-- chat_thread table + view permissions + role assignments.
-- Run after: npm run sync-metadata  (imports chat_thread_chat_thread_view.json)
-- Scoped by org_id (DAL) + user_id (chat-store / API filters).

CREATE TABLE IF NOT EXISTS chat_thread(
  id VARCHAR(255) PRIMARY KEY,
  org_id VARCHAR(255),
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'New Financial Inquiry',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_used VARCHAR(255),
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  created_by VARCHAR(255),
  modified_by VARCHAR(255),
  assigned_to VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_user_id ON chat_thread(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_thread_org_user ON chat_thread(org_id, user_id);

-- Idempotent for databases that already ran an earlier version of this script
ALTER TABLE chat_thread ADD COLUMN IF NOT EXISTS org_id VARCHAR(255);
ALTER TABLE chat_thread ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE chat_thread ADD COLUMN IF NOT EXISTS modified_by VARCHAR(255);
ALTER TABLE chat_thread ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);

INSERT INTO permission (id, view_id, field_name, access, created_at, updated_at)
VALUES ('perm_chat_thread_001', 'view_chat_thread_001', '*', 'write', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_view (id, role_id, view_id, created_at, updated_at) VALUES
  ('rovi_chat_thread_sa', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_chat_thread_001', NOW(), NOW()),
  ('rovi_chat_thread_admin', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_chat_thread_001', NOW(), NOW()),
  ('rovi_chat_thread_fin', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_chat_thread_001', NOW(), NOW()),
  ('rovi_chat_thread_emp', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_chat_thread_001', NOW(), NOW()),
  ('rovi_chat_thread_exp', 'role_0919d752-97df-4123-97d8-083d92cb273d', 'view_chat_thread_001', NOW(), NOW()),
  ('rovi_chat_thread_buy', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_chat_thread_001', NOW(), NOW()),
  ('rovi_chat_thread_del', 'role_f0f5d683-09cc-4bf4-8f99-70ca4769859d', 'view_chat_thread_001', NOW(), NOW()),
  ('rovi_chat_thread_demo', 'role_demo1', 'view_chat_thread_001', NOW(), NOW()),
  ('rovi_chat_thread_mgr', 'role_manager1', 'view_chat_thread_001', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
