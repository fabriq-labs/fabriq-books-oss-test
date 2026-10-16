# Kernel

Metadata-driven CRUD, workflows, and the agent runtime. The app UI is `frontend-0`.

| | |
|---|---|
| Backend | `backend/`, port 4000 |
| Frontend | `frontend-0/`, port 5174 |
| Database setup | `cd backend && npm run setup:kernel` |
| Login | `admin@example.com` / `admin123` |

Kernel behavior is documented in `docs/kernel/`. Agent, workflow, auth, and metadata notes that are still in the older docs stay until they are consolidated:

- `docs/kernel/README.md`, `docs/kernel/BUILDING_A_DOMAIN.md`
- `docs/agent/`
- `docs/WORKFLOWS.md`
- `docs/AUTHENTICATION.md`, `docs/AUTHENTICATION_AND_AUTHORIZATION.md`
- `docs/ARCHITECTURE.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`
- `docs/FILTER_SYSTEM.md`, `docs/datagraph-builder/`, `docs/CHAT_THREADS.md`, `docs/IMPORT_FUNCTIONALITY.md`, `docs/AI_AGENT.md`

Do not run `prisma db push` or `prisma migrate`. New databases are created by `npm run setup:kernel`, which applies generated schema SQL and seeds `org_system`.
