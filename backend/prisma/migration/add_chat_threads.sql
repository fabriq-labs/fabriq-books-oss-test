-- Chat thread persistence for Vercel AI SDK useChat / UIMessage[] storage
-- Prefer seed-chat-thread-view.sql (run via setup-db.js) for new environments.

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

-- Idempotent for databases that already ran an earlier version of this migration
ALTER TABLE chat_thread ADD COLUMN IF NOT EXISTS org_id VARCHAR(255);
ALTER TABLE chat_thread ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE chat_thread ADD COLUMN IF NOT EXISTS modified_by VARCHAR(255);
ALTER TABLE chat_thread ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);
