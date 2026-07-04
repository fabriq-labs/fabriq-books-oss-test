-- chat_thread: scope threads by org_id + user_id (commit cd3c19c, 2026-06-16)
-- Prisma: backend/prisma/schema/data.prisma — model chat_thread
--
-- Run on databases that already have chat_thread from an earlier add_chat_threads.sql
-- (before org_id was added). Idempotent — safe to re-run.
--
-- After applying: npx prisma generate

-- 1. Add org_id column
ALTER TABLE chat_thread
  ADD COLUMN IF NOT EXISTS org_id VARCHAR(255);

-- 2. Backfill org_id from the owning user (existing rows created before org scoping)
UPDATE chat_thread ct
SET org_id = u.org_id
FROM "user" u
WHERE ct.user_id = u.id
  AND ct.org_id IS NULL
  AND u.org_id IS NOT NULL;

-- 3. Composite index for org + user list queries
CREATE INDEX IF NOT EXISTS idx_chat_thread_org_user ON chat_thread(org_id, user_id);
