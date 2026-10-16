# Kernel

Metadata-driven CRUD, workflows, and the agent runtime. The app UI is `frontend-0`.

Start at [docs/README.md](./docs/README.md).

| | |
|---|---|
| Backend | `backend/`, port 4000 |
| Frontend | `frontend-0/`, port 5174 |
| Database setup | `cd backend && npm run setup:kernel` |
| Login | `admin@example.com` / `admin123` |

Do not run `prisma db push` or `prisma migrate`. New databases are created by `npm run setup:kernel`, which applies generated schema SQL and seeds `org_system`.
