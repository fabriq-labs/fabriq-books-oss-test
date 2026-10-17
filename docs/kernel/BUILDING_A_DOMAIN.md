# Building a domain on the kernel

This file says where a domain's files go. Behavior of the engine is in [../README.md](../README.md). This branch has no product models. Copy `seedKernel.ts` for the view seed.

| Path | What goes here |
|---|---|
| `backend/prisma/schema/domain.prisma` | Domain models. Every model has `org_id`. Names are `snake_case`. See [adding-a-model.md](./adding-a-model.md). |
| `backend/src/utils/setup/seed<Domain>.ts` | Idempotent view, permission, and `role_view` rows. `data_graph` is required. Copy `seedKernel.ts`. |
| `frontend-0/src/domain/navigation.ts` | Sidebar entries. Paths are `/master/app/{model}` when the view is `{model}_view`. |
| `frontend-0/src/domain/` and `frontend-0/src/App.tsx` | Form components and both routes `/{model}/view/:viewId` and `/{model}/:id/view/:viewId`. |
| `frontend-0/src/domain/home.tsx` | Home screen rendered at `/` |
| `backend/lib/domain.ts` | Optional product hooks. A list and a form do not read this file. |

The app UI is `frontend-0` (port 5174). `/` mounts `DomainHome` from `home.tsx`. Keep that export if you replace the page. See [frontend.md](./frontend.md).

A list appears when four things exist: the table, a view named `{model}_view` whose `data_graph` marks columns with `displayName` and `isColumnShow`, a `*` permission, and a `role_view` to Super Admin. Then restart the backend so the new model is registered. Forms are a separate step. The order is [adding-a-model.md](./adding-a-model.md). What the graph selects is in [metadata.md](./metadata.md).

`backend/lib/domain.ts` is where a workflow model, a post-write hook, or a report handler goes. `DOMAIN_SQL_TABLES` is not read by the analytics gate. That allowlist is `KNOWN_TABLES` in `backend/src/services/analytics/sqlExecutor.ts`. Adding a name only in `domain.ts` does not create an API.

`backend/prisma/metadata/views/` is a JSON catalog from the books setup. `setup:kernel` does not load it. Do not sync the whole folder into this database.

`domain.prisma` and `domainNavigation` are empty on this branch. A domain seed is a second command after `setup:kernel`. The kernel seed does not insert those rows.

## Platform models

`backend/prisma/schema/platform.prisma` is not a place for a product catalog. A model stays there only when both are true:

1. Kernel code reads or writes it when no domain is installed.
2. It is not a catalog of product objects.

| Model | Why it is here | Seed |
|---|---|---|
| `currency` | `org.basecurrency_id` points at it. | One USD row, `curr_kernel_usd`, on `org_system`. |
| `attachment` | Upload and download routes write it. | None. |

Further currencies are more rows on `currency`, not a new model.

## Rules the engine already applies

Follow [tenancy.md](./tenancy.md) and [examples.md](./examples.md).

- Put `org_id` on the model. Match the Prisma nullability you intend. Several kernel metadata models still use `String?`. `currency` and `workflow_instance` use a required `String`.
- Shared defaults use `org_system`. A tenant row uses the caller org.
- A Prisma relation has two sides. The existing example is `org.currency` and `currency.orgs`.
- Do not run `prisma db push`. Apply new tables with the SQL diff in [adding-a-model.md](./adding-a-model.md), then run `npx prisma generate`. `npm run setup:kernel` applies the full schema only when `organizations` is missing.
- The generic API is `/api/{model}/view/{viewId}`, not a bare `/api/{model}`.
- The list is `/master/app/{model}` when the view is named `{model}_view`. The view of the `view` model is named `view`, and its screen is `/settings/views`.
- `view.data_graph` is required. It is the Prisma `select` and the column list. A relation key needs `type: "table"` and `select`.
- Create and edit forms are routes you add. See [adding-a-model.md](./adding-a-model.md).

Deploy the finished app with [../infrastructure/BUILD_AND_DEPLOY.md](../infrastructure/BUILD_AND_DEPLOY.md). That builds one image from the root `Dockerfile` and creates a new Railway service in the project that `RAILWAY_TOKEN` belongs to.
