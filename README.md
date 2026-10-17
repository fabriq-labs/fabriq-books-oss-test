# Fabriq

Fabriq is a metadata framework for building a multi-tenant web app. You describe a model and who may see it. The kernel turns that description into a permission-checked API and a list screen. Product behavior lives in a small set of domain files; the engine stays the same from one app to the next.

A **view** names one model and the fields to show. A **permission** grants read or write on those fields. A **role** reaches a view through `role_view`, and a user reaches a role through `role_user`. The generic REST API is `/api/{model}/view/{viewId}`. The Master list is `/master/app/{model}` when the view is named `{model}_view`. Create and edit forms are components you write; they call the same view API.

Every business row carries `org_id`. Shared defaults are seeded on `org_system`. A request sees the caller’s org and those shared rows. Writes stay on the caller’s org unless a platform admin writes `org_system` on purpose.

| Package | Path | Role |
|---------|------|------|
| API | [`backend/`](backend/) | Express, Prisma, views, workflows, agent |
| Web app | [`frontend-0/`](frontend-0/) | React/Vite shell and the Master list |
| Domain | [`backend/lib/domain.ts`](backend/lib/domain.ts), [`frontend-0/src/domain/`](frontend-0/src/domain/) | Models, navigation, and home for one app |
| Docs | [`docs/`](docs/) | How the engine works and how to deploy it |

Start with the [docs index](docs/README.md).

## Run it locally

```bash
npm run install:all
cd backend && npm run setup:kernel
cd .. && npm run dev
```

`setup:kernel` applies the schema and seeds `org_system` when the database is empty. Do not run `prisma db push` or `prisma migrate`. Configure `DATABASE_URL` in `backend/.env` before setup. See [docs/infrastructure/BUILD_AND_DEPLOY.md](docs/infrastructure/BUILD_AND_DEPLOY.md).

API: http://localhost:4000 · UI: http://localhost:5174 · Login: `admin@example.com` / `admin123`

## Build an app

1. Add models in `backend/prisma/schema/domain.prisma`. Every model has `org_id`.
2. Register tables, workflow models, and hooks in `backend/lib/domain.ts`.
3. Seed a view, a permission, and a `role_view` row. The list and the API appear from that metadata.
4. Add sidebar entries in `frontend-0/src/domain/navigation.ts` and the home page in `frontend-0/src/domain/home.tsx`.
5. Add create and edit form routes. Forms are not generated.

The steps, SQL diff, and form conventions are in [docs/kernel/adding-a-model.md](docs/kernel/adding-a-model.md). File locations are in [docs/kernel/BUILDING_A_DOMAIN.md](docs/kernel/BUILDING_A_DOMAIN.md).

## Layout

```
├── package.json          # install:all, dev (API + UI)
├── Dockerfile            # one image: nginx, the UI, and the API
├── backend/
├── frontend-0/
└── docs/
```

## Documentation

| Question | Document |
|----------|----------|
| Where do I start? | [docs/README.md](docs/README.md) |
| How do views, permissions, and the API fit together? | [docs/kernel/metadata.md](docs/kernel/metadata.md) |
| How do I add a model? | [docs/kernel/adding-a-model.md](docs/kernel/adding-a-model.md) |
| How does tenancy work? | [docs/kernel/tenancy.md](docs/kernel/tenancy.md) |
| Worked requests on kernel tables | [docs/kernel/examples.md](docs/kernel/examples.md) |
| Approvals and state machines | [docs/kernel/workflows.md](docs/kernel/workflows.md) |
| Login and platform admin | [docs/kernel/auth.md](docs/kernel/auth.md) |
| Shell, navigation, and the Master list | [docs/kernel/frontend.md](docs/kernel/frontend.md) |
| Colors, type, and spacing | [docs/kernel/DESIGN_SYSTEM.md](docs/kernel/DESIGN_SYSTEM.md) |
| Agent sessions and tools | [docs/kernel/agent/README.md](docs/kernel/agent/README.md) |
| Where domain files go | [docs/kernel/BUILDING_A_DOMAIN.md](docs/kernel/BUILDING_A_DOMAIN.md) |
| Image and a new Railway service | [docs/infrastructure/BUILD_AND_DEPLOY.md](docs/infrastructure/BUILD_AND_DEPLOY.md) |
