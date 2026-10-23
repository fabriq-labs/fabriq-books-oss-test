# Building a domain on the kernel

This file says where a product's files go. Behavior of the engine is in [README.md](./README.md). Product models live under `backend/prisma/schema/` (start with `domain.prisma`). A checkout with no product has no product models there. Copy `seedKernel.ts` when you write a view seed.

| Path | What goes here |
|---|---|
| `backend/prisma/schema/domain.prisma` | Domain models. Every model has `org_id`. Names are `snake_case`. See [adding-a-model.md](./adding-a-model.md). |
| `backend/src/utils/setup/seed<Domain>.ts` | Idempotent view, permission, and `role_view` rows. `data_graph` is required. Copy `seedKernel.ts`. |
| `frontend-0/src/domain/navigation.ts` | Sidebar entries. Paths are `/master/app/{model}` when the view is `{model}_view`. |
| `frontend-0/src/domain/<product>/` | Product screens and import extensions. |
| `frontend-0/src/domain/routes.tsx` | The only UI file that imports those screens. `App.tsx` renders `DomainRoutes`. |
| `frontend-0/src/domain/register.ts` | The only UI file that registers a product import extension. |
| `frontend-0/src/domain/home.tsx` | Home screen rendered at `/` |
| `backend/lib/<product>/` | Product handlers, extractors, and route modules. |
| `backend/lib/domain.ts` | The only kernel-facing file that imports `backend/lib/<product>/`. |

The app UI is `frontend-0` (port 5174). `/` mounts `DomainHome` from `home.tsx`. Keep that export if you replace the page. See [frontend.md](./frontend.md).

A list appears when four things exist: the table, a view named `{model}_view` whose `data_graph` marks columns with `displayName` and `isColumnShow`, a `*` permission, and a `role_view` to Super Admin. Then restart the backend so the new model is registered. Forms are a separate step. The order is [adding-a-model.md](./adding-a-model.md). What the graph selects is in [metadata.md](./metadata.md).

## How the kernel reaches a domain

A todo app and the ledger use the same entry files. The product fills the bodies. Kernel files keep the function names and do not import a product folder.

Product code lives in `backend/lib/<product>/` and `frontend-0/src/domain/<product>/`. These files are the only ones that import that folder:

| Entry | What it imports |
|---|---|
| `backend/lib/domain.ts` | `backend/lib/<product>/` |
| `frontend-0/src/domain/register.ts` | A product import extension |
| `frontend-0/src/domain/routes.tsx` | Product screens |
| `frontend-0/src/domain/navigation.ts` | Sidebar labels and paths |
| `frontend-0/src/domain/home.tsx` | The home page |

`App.tsx` imports `DomainHome`, `DomainMaster`, and `DomainRoutes`. It does not name a product page. `SidebarNavigation` imports `domainNavigation`. `frontend-0/src/features/import-extensions/init.ts` calls `registerDomainImportExtensions` from `domain/register.ts`.

On the backend, `backend/src` imports `backend/lib/domain.ts`, sometimes through a one-line file in `backend/src/domain/`. It does not import `backend/lib/<product>/`.

| Export on `backend/lib/domain.ts` | Kernel call site |
|---|---|
| `registerDomainImportExtensions()` | `initializeImportExtensions` in `backend/src/lib/import-extensions/index.ts` |
| `registerDomainExtractors(registry)` | `ExtractorRegistry` constructor |
| `registerDomainAgentRoutes(router)` | End of `createAgentRouter`. Paths are under `/api/agent` |
| `registerDomainRoutes(router)` | `backend/src/rest/routes.ts`, on the main `/api` router |
| `DOMAIN_SQL_TABLES` | Analytics allowlist in `sqlExecutor.ts`, added beside `KNOWN_TABLES` |
| `DOMAIN_IMPORT_FIELD_KEYS` | Import client that drops unknown fields before create |
| `functionMap`, `workflowActionMap` | `backend/src/domain/actions.ts`, then the data access layer, `ModelService`, and workflow side effects |
| `reportHandlers` | `backend/src/domain/reports.ts`, then `RestService` |
| `DOMAIN_WORKFLOW_MODELS` | `backend/src/domain/workflowModels.ts` |
| `registerDomainBuilders` | `backend/src/domain/agentBuilders.ts`, then the agent builder index |

An unused hook stays an empty function. `DomainRoutes` returns `null` when the product has no extra screens. A metadata list still needs a table, a view, a permission, and a `role_view`. Filling `domain.ts` does not create that API.

A seed command may import the product library. `backend/src/utils/setup/seed<Domain>.ts` runs after `setup:kernel`. It is not a request path.

`DEFAULT_GOAL_MODEL`, `RELATED_MODELS`, `PROMPT_EXAMPLES`, `DOMAIN_MODEL_REGISTRY`, and `normalizeAnalyticsSql` are declared on `domain.ts`. The agent still uses its own copies inside `AgentService.ts`. Product notes live in [../domain/AGENTS.md](../domain/AGENTS.md). The rule for a prod migration is [PORTING_A_DOMAIN.md](./PORTING_A_DOMAIN.md).

View graphs for the shell are written by `seedKernel.ts`. A domain adds its own graphs in a `seed<Domain>.ts` script. There is no JSON view catalog to sync.

On a checkout with no product, `domain.prisma` and `domainNavigation` are empty. A domain seed is a second command after `setup:kernel`. The kernel seed does not insert product rows.

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

Deploy the finished app with [../infrastructure/BUILD_AND_DEPLOY.md](../infrastructure/BUILD_AND_DEPLOY.md) (image) and the host file the human asked for: [DEPLOY_RAILWAY.md](../infrastructure/DEPLOY_RAILWAY.md) or [DEPLOY_FLY.md](../infrastructure/DEPLOY_FLY.md).
