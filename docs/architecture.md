# Architecture

Books is an application built on a metadata kernel. The kernel turns a description of a model into a permission-checked API and a list. Books supplies the models (accounts, invoices, connections), the seeds that describe their columns, and the forms that are too specific to generate. This page is that split. The engine, written so it still makes sense for a different application, is the [kernel index](./kernel/README.md).

You do not need this page to enter an entity or to import from QuickBooks. You need it before you add a screen.

## One description, two surfaces

A **view** names one model and the fields to load. The JSON for that, `data_graph`, is both the Prisma `select` and the column list. A column appears on the Master list when the field has a `displayName` and `isColumnShow`. A relation is a key with `type: "table"` and a nested `select`, which is how an invoice list can show the customer’s name without a custom query.

A **permission** grants read or write on the fields of a view. A **role** reaches a view through `role_view`, and a user reaches a role through `role_user`. The seeded Super Admin role can read and write the Books views because each seed inserts that link on `org_system`.

The generic API is `/api/{model}/view/{viewId}`. There is no parallel `/api/invoice` for ordinary create, read, and update. The Master list in the web shell calls the same route. Books lists that are “just a list” — suppliers, tax regions, exchange rates, connections — are that Master component pointed at a view. Lists with a custom path, such as Sales → Invoices, are a thin page that renders the same Master.

That is why a new list starts as a seed, not as a new router file. The procedure is [Adding a model](./kernel/adding-a-model.md). File locations for any product are in [Building a domain](./kernel/BUILDING_A_DOMAIN.md).

## Why the forms are written by hand

The list is generic. The form often is not. An entity form has five account dropdowns and a headquarters checkbox. An invoice page lays out a header and a line table. A connection form calls QuickBooks to test credentials before it will save, and it must not put those credentials into the view. A generated form that only walked `data_graph` would either be too blunt for those screens or would grow into a second framework.

So create and edit screens are React components under `frontend-0/src/domain/`. They load and save through the view API (`viewAPI.getById`, `viewAPI.create`, `viewAPI.update`). Routes for them are registered only in `frontend-0/src/domain/routes.tsx`. `App.tsx` renders that fragment and does not name a Books page. Adding a form means adding the component and a route, then restarting the web dev server. The API does not need a new route for the save.

Custom API routes exist only for actions a view cannot express. For connections those are the test, the extraction-config save, the import trigger, the expense-account fetch, and the redacted flags (`has_oauth`, company id, whether extraction settings exist). The handler lives under `backend/lib/integrations/` and is mounted from `backend/lib/domain.ts`. The kernel calls that file. It does not import the integrations folder itself.

## Where the Books code lives

The kernel’s rule is that product code sits behind a few entry files. Books follows it.

| Path | What Books puts there |
|---|---|
| `backend/prisma/schema/domain.prisma` | Ledger models: accounts, postings, entities, exchange rates. |
| `backend/prisma/schema/sales.prisma` | Customers, suppliers, items, invoices, payment receipts, credit notes, applications. |
| `backend/prisma/schema/tax.prisma` | Tax rates, groups, and regions. |
| `backend/prisma/schema/integrations.prisma` | `source_system`, the connection. |
| `backend/lib/domain.ts` | The only backend file that imports Books libraries. It registers models, tenancy, and routes. |
| `backend/lib/gl/` | Reports, opening balances, chart seed. |
| `backend/lib/integrations/` | Connection actions and the call into the sync service. |
| `backend/src/utils/setup/seed*.ts` | Idempotent views. `seedKernel.ts` is the shell. The others are Books. |
| `frontend-0/src/domain/navigation.ts` | Sidebar groups. |
| `frontend-0/src/domain/routes.tsx` | Books routes. |
| `frontend-0/src/domain/home.tsx` | The count cards on `/`. |
| `frontend-0/src/domain/gl/`, `sales/`, `connections/` | Screens. |

The import pipeline is Python under `backend/integrations/` (sync service and QuickBooks dbt). It is not a metadata view. It writes the same tables the views read. Operator detail is in [Connections setup](./operations/connections-setup.md).

## Tenancy

Every Books business row carries `org_id`. The signed-in user on a fresh seed is on `org_kernel`. Shared defaults — views, roles, the US dollar — are on `org_system`. A read of a private model (an invoice, an account, a connection) returns only the caller’s organization. A read of a shareable model (a view, a role, a currency) also returns `org_system`, which is why a view seeded once is visible to the tenant.

Writes stay on the caller’s organization. A platform admin, which the seeded Super Admin is, may write `org_system` on a shareable model. That is how the seeds install views for everyone without copying them into each tenant.

The full contract, including which kernel models are shareable, is [Tenancy](./kernel/tenancy.md). Postgres row-level security is not what enforces this. The filter is in the data access layer.

## Secrets stay out of the view

`data_graph` is the select. If a view names `connection_config`, every list response includes it. The connections seed therefore omits `connection_config` and `extraction_config`. The detail page asks a separate route for flags: whether OAuth is stored, the company id, the environment, and whether extraction settings exist. The encrypted blobs stay in the row for the sync process, which decrypts them with `ERP_CONFIG_ENCRYPTION_KEY`.

The same rule applies to the next model you add. If a field must not appear in the browser, leave it out of the graph. Do not add a second list API whose only job is to hide a field the view selected.

## What has to restart

The API registers a route per Prisma model when the process starts. After you add a model and run `npx prisma generate`, restart the API. Adding or editing a view is a database write. Refresh the browser. The dev server for the UI picks up a new form route on its own reload.

`setup:kernel` will not alter tables once `organizations` exists. Schema changes after that are SQL files. [Database](./operations/database.md) is the operator side of that rule. [Adding a model](./kernel/adding-a-model.md) is the contributor side.
