# Kernel

Metadata-driven CRUD, workflows, and the agent runtime. The app UI is `frontend-0`.

Start at [docs/README.md](./docs/README.md). A new model, its table, its view, and its form are in [docs/kernel/adding-a-model.md](./docs/kernel/adding-a-model.md).

| | |
|---|---|
| Backend | `backend/`, port 4000 |
| Frontend | `frontend-0/`, port 5174 |
| Database setup | `cd backend && npm run setup:kernel` |
| Login | `admin@example.com` / `admin123` |

Do not run `prisma db push` or `prisma migrate`. New databases are created by `npm run setup:kernel`, which applies generated schema SQL and seeds `org_system`. After `organizations` exists, apply later tables with the SQL diff in `docs/kernel/adding-a-model.md`.

## Cursor Cloud specific instructions

### Railway deploy debug (logs)

This monorepo deploys via root `Dockerfile` → GHCR → Railway Docker Image services.

To fetch live logs and debug a deployed service:

1. Ensure Cursor secret `RAILWAY_TOKEN` is set (Railway project token).
2. Follow [`.cursor/skills/railway-debug/SKILL.md`](.cursor/skills/railway-debug/SKILL.md).
3. Prefer non-streaming commands, for example:

```bash
npx -y @railway/cli@latest logs --service b82e07e5-9532-43f3-b15a-797403b7fc92 -n 200
```

- dev service: `b82e07e5-9532-43f3-b15a-797403b7fc92`
- prod service: `36f474f5-fc9f-4ab7-866b-61800eb3c318`

Do not redeploy or restart prod unless the user explicitly asks. Never commit or echo the token.
