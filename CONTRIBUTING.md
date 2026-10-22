# Contributing to Fabriq Books

Thank you for spending time on this project. Books is the accounting application in this repository: a general ledger, a sales subledger, and connections that import an external bookkeeping system into those same records. Under it sits a metadata kernel that other applications can use. This page is how to propose a change. How to run the app is [Getting started](docs/getting-started.md). What the screens do is the [docs hub](docs/README.md).

A license file is not in the tree yet. Maintainers need to add one before contributions can be accepted under a named license. Until `LICENSE` exists, open an issue or ask in your pull request rather than assuming a license from the source.

## Where a change belongs

`fabriq-books` is the line that contains Books. Branch from `fabriq-books` and open the pull request against `fabriq-books`.

`main` is the kernel line. It is the metadata engine without the Books product docs. A change that only improves the engine, and that still makes sense with no Books tables in the explanation, can be aimed at `main`. A change to invoices, connections, the Books screens, or the Books guides belongs on `fabriq-books`. Mixing a Books feature into a kernel pull request makes that pull request harder to take.

## Set up

Follow [Getting started](docs/getting-started.md): Node.js 20 or newer, PostgreSQL, `psql`, `npm run install:all`, `backend/.env` from the example, `npm run setup:kernel`, the Books view seeds, then `npm run dev` from the repository root. The UI is http://localhost:5174 and the API is http://localhost:4000. The seeded user is `admin@example.com` / `admin123`. Change that password on any machine other people can reach.

Copy `.env.example` files. Do not commit `.env`. The example database URL and the demo password are local placeholders, not credentials for a shared environment.

## How a screen gets into the app

Lists and ordinary saves go through metadata, not a new REST resource. A view’s `data_graph` is both the Prisma `select` and the columns on the Master list. A permission and a `role_view` row decide who can read or write. The API is `/api/{model}/view/{viewId}`. Forms are React components that call that same API, registered from `frontend-0/src/domain/routes.tsx`.

The reason the form is hand-written is that a few screens are specific: an invoice with lines, an entity with account dropdowns, a connection that tests credentials before save. The list stays generic so a new model does not need a new list component. [Architecture](docs/architecture.md) is the Books-side of this. [Adding a model](docs/kernel/adding-a-model.md) is the engine procedure, and it applies to any product on the kernel, not only Books.

If you are adding a Prisma model:

1. Put it in the product schema (`backend/prisma/schema/domain.prisma`, or a file beside it such as `sales.prisma`) with `org_id` and the audit fields.
2. Apply the table as reviewed SQL. `setup:kernel` creates a database from the schema only when `organizations` is missing. After that, add a SQL file and apply it with `psql`. Do not use `prisma db push` or `prisma migrate` for this. Those commands skip the reviewed SQL this repository relies on, including partial indexes Prisma does not emit. [Database](docs/operations/database.md) explains both cases.
3. Seed a view, a permission, and a `role_view` in an idempotent script next to `backend/src/utils/setup/seedKernel.ts`. Leave secrets out of `data_graph`. The connections view omits `connection_config` and `extraction_config` because a view returns every field it names.
4. Restart the API. Routes are registered only at process start.
5. Add a sidebar entry and, when the Master list is not enough, a form route.

Run one coherent change and stop. A pull request that also rewrites unrelated kernel docs or an unrelated module is harder to review.

## Secrets

Do not commit tokens, private keys, real `DATABASE_URL` values, Airbyte client secrets, Intuit client secrets, refresh tokens, or customer company ids (realm ids). `.env.example` stays a template of empty or local-only values. `railway variable list` prints secrets; do not paste that output into a pull request, a log committed to the tree, or a doc.

Connection secrets in the database are encrypted with `ERP_CONFIG_ENCRYPTION_KEY`. The list API does not select them. Keep it that way.

## Tests and checks

From `backend/`, `npm test` runs the Jest suite that is already in the tree. Run the tests that cover the area you touched. A maintainer note for a broader kernel-plus-Books harness is [docs/domain/OSS_TEST_PLAN.md](docs/domain/OSS_TEST_PLAN.md). That note is the plan for the harness. It is not a second test command in this tree.

If you rename a public module guide (`ledger`, `sales-ar`, `connections`), update the module names in that test plan in the same pull request so the two stay aligned.

## Docs

User-facing pages are the root README, `docs/README.md`, getting started, concepts, `docs/modules/`, `docs/operations/`, and `docs/architecture.md`. Write them as prose for a person who knows accounting and has not seen this repository. Describe what the software does now. Design history and later work stay in `docs/domain/`, linked from the hub under “Design notes and agent plans,” and out of the guides.

`docs/kernel/` stays domain-neutral. It has to remain usable for someone building a different app on the engine. A Books model may appear there only as a labeled example. Prefer to put Books-only explanation in `docs/architecture.md` or a module guide.

## Reporting vulnerabilities

Use [SECURITY.md](SECURITY.md). Do not file a public issue for a vulnerability.

## Pull requests

Say what changed and how you checked it. Include a screenshot or a short trace only when the change is visible in the UI and a reader cannot see the behavior from the diff. Keep service ids, tokens, and customer identifiers out of the description.
