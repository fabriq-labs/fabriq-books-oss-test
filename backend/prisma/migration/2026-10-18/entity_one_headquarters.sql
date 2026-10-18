-- At most one headquarters entity per organization.
-- Prisma cannot emit a partial unique index, so this follows the schema diff.
CREATE UNIQUE INDEX IF NOT EXISTS entity_one_headquarters_per_org
  ON entity (org_id)
  WHERE is_headquarters = true;
