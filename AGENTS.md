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
3. List services, then pass the id you need. Prefer non-streaming commands:

```bash
npx -y @railway/cli@latest service list
npx -y @railway/cli@latest logs --service <service-id> -n 200
```

The deploy workflows pass that id as `service_id`. Do not copy service ids into this file.

Do not redeploy or restart prod unless the user explicitly asks. Never commit or echo the token.
