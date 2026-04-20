---
name: Never run DDL or prisma db push
description: CRITICAL — never run prisma db push, migrate, or any DDL without user running it themselves
type: feedback
---

Never run `npx prisma db push`, `npx prisma migrate`, `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE`, or any other DDL commands autonomously. Always propose the schema change, show the command, and let the user run it.

**Why:** DDL against a production/shared database can destroy data or break running services. The user must be in control of when schema changes are applied.

**How to apply:** When a schema change is needed, write the prisma schema diff and tell the user to run `npx prisma db push` (or migrate) themselves. Never invoke these commands via Bash tool.
