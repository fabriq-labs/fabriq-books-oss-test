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

### Build an app and deploy it

Given a spec, add the domain with [docs/kernel/adding-a-model.md](./docs/kernel/adding-a-model.md) and [docs/kernel/BUILDING_A_DOMAIN.md](./docs/kernel/BUILDING_A_DOMAIN.md).

Deploy that app as a **new** Railway service with [docs/infrastructure/BUILD_AND_DEPLOY.md](./docs/infrastructure/BUILD_AND_DEPLOY.md). `RAILWAY_TOKEN` in the repo-root `.env` or `backend/.env` is a project token. Load it into the environment. Never print it or commit it. `railway add` creates the service in that token's project. `railway up` builds the root `Dockerfile`.

### Logs

To inspect a service that is already deployed, follow [`.cursor/skills/railway-debug/SKILL.md`](.cursor/skills/railway-debug/SKILL.md). List services, then pass the name or id from that list:

```bash
npx -y @railway/cli@latest service list
npx -y @railway/cli@latest logs --service <service-id> -n 200
```

Leave service ids out of this file. Do not redeploy or restart an existing production service unless the user explicitly asks.
