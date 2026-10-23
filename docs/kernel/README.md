# Metadata kernel

The kernel is the domain-neutral metadata engine in this repository. A screen and an API appear from metadata: a view names a model and its fields, a permission grants read or write on those fields to a role, and the generic REST API and the Master screen render from that metadata.

These pages describe the engine. A product fills the slots in [BUILDING_A_DOMAIN.md](./BUILDING_A_DOMAIN.md) — schema, seeds, navigation, forms — and documents its own screens elsewhere. When this checkout is a product branch, that product’s guide is the [docs hub](../README.md). The engine reference stays here either way. Worked steps in [examples.md](./examples.md) use the kernel seed: users, roles, and currencies. A product model shows up only as a labeled example of a mechanism, or inside an engine note (the agent pages, for instance) that is not the product manual.

In scope:

- View-driven CRUD, the data access layer, and tenancy
- Auth and the platform-admin check
- The workflow engine
- The agent runtime: sessions, tools, prompts, pending actions, and supervised mode
- The app shell, `frontend-0`

Application tenancy is in the data access layer, auth middleware, workflow engine, and agent runtime. Postgres row-level security is not implemented. The row-level security section in [tenancy.md](./tenancy.md) is a sketch to review, not a migration that has been applied.

| | |
|---|---|
| Backend | `backend/`, port 4000 |
| Frontend | `frontend-0/`, port 5174 |
| Database setup | `cd backend && npm run setup:kernel` |
| Login | `admin@example.com` / `admin123` on org `org_kernel` |

Do not run `prisma db push` or `prisma migrate` as the way to change the schema. Setup applies generated schema SQL when `organizations` is missing, and seeds `org_system`. Each seeded view includes a `data_graph`. That JSON is the Prisma `select` and the Master columns. Read [metadata.md](./metadata.md) before writing one.

`setup:kernel` seeds the shell only: the system org, the kernel tenant, Super Admin, one US dollar, and the shell views. A product seed is a second command, run after setup. The kernel seed does not insert product rows.

To add a model, follow this order: [BUILDING_A_DOMAIN.md](./BUILDING_A_DOMAIN.md), [adding-a-model.md](./adding-a-model.md), [metadata.md](./metadata.md), [frontend.md](./frontend.md), [tenancy.md](./tenancy.md). Restart the backend after `prisma generate`. Routes are registered only at process start.

## Guides

| Document | What it teaches |
|---|---|
| [metadata.md](./metadata.md) | How a view, a permission, and a role produce an API and a list. Request path from HTTP to the data access layer. `data_graph` properties. Nested `updateChild` / `addChild` auth and returned parent graph. |
| [adding-a-model.md](./adding-a-model.md) | Add a model, apply its table without `db push`, seed its view and permission, and add the list route and form routes. |
| [tenancy.md](./tenancy.md) | Org scope, shareable and private reads, platform-admin writes, and the row-level security sketch to review. |
| [examples.md](./examples.md) | Worked steps on tables and routes that exist in the kernel seed: model, view, permission, role, workflow, instance. |
| [workflows.md](./workflows.md) | States, actions, assignment, history, and who may write a definition. |
| [auth.md](./auth.md) | Login, public paths, and the platform-admin check. |
| [frontend.md](./frontend.md) | The shell: home, Super Admin navigation, the profile menu, and a metadata list. |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Colors, type, and spacing used by the shell. |
| [agent/README.md](./agent/README.md) | Sessions, tools, prompts, pending actions, supervised mode. |
| [BUILDING_A_DOMAIN.md](./BUILDING_A_DOMAIN.md) | Where a product’s files go, and which entry files the kernel imports. |
| [PORTING_A_DOMAIN.md](./PORTING_A_DOMAIN.md) | What stays in the kernel when a feature is ported, and which hooks the product fills. |

Product instructions, when this checkout has a product, live in [domain/AGENTS.md](../domain/AGENTS.md). This index does not list that product’s screens.

## Infrastructure

| Document | What it covers |
|---|---|
| [infrastructure/BUILD_AND_DEPLOY.md](../infrastructure/BUILD_AND_DEPLOY.md) | The single image, and a new Railway service from `RAILWAY_TOKEN` |

## Security

Policy PDFs in [security/](../security/): `DATA_POLICY.pdf` and `INFORMATION_SECURITY_POLICY.pdf`.
