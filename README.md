# Fabriq Books

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/fabriq-books-oss-template)

One-click deploy uses the Docker image `ghcr.io/fabriq-labs/fabriq-books-oss-test:latest` plus Postgres. After deploy, open the app URL, wait for first-boot setup, then sign in as `admin@example.com` / `admin123`.

Fabriq Books is a multi-entity accounting application. It keeps a chart of accounts, journal postings, and financial reports for each legal entity, and it keeps a sales subledger — customers, suppliers, items, tax, invoices, payment receipts, and credit notes — in one model that does not belong to any single outside product. When you connect an external bookkeeping system, Books imports that system's records into these same screens. QuickBooks Online is the connector that ships today.

The application is meant for someone who already knows bookkeeping and wants the books in a database they can run themselves: one organization, several entities, one chart and one set of reports that can span those entities when exchange rates are present.

## What Books does

You sign in, pick an entity from the bar at the top of the window, and work from the sidebar.

**Accounting.** Entities carry a name, an address, a currency, and a headquarters flag. Each entity also stores ledger default accounts (receivable, income, undeposited funds, foreign-exchange gain or loss, and discounts) and an optional ledger start date. Those are values you edit and save on the entity. They record which accounts belong to that entity. The chart of accounts, manual journal postings, and an opening-balances screen sit beside the entities. Reports cover the trial balance, income statement, balance sheet, cash flow, and a posting list, with a period, a reporting currency, and one or more entities.

**Sales.** Customers, suppliers, items, and tax rates, groups, and regions have their own lists and forms. Invoices, payment receipts, and credit notes have lists of their own. An invoice opens onto its header, amounts, open balance, and lines. A payment receipt records cash received and how much of it is still unapplied. Applications carry a signed amount: a positive amount settles an invoice, and a negative amount consumes a credit. A direct credit-note application (credit applied straight onto an invoice) is part of the same model. Documents may be keyed into Books where a form exists, or they may arrive through a connection. Balances on the lists are the balances stored on the documents.

**Connections.** A connection is a link to an external bookkeeping system for one organization. You create it, test it, choose how to run the import, and then read the imported customers, invoices, payments, and the rest in the Books screens above. The QuickBooks connection is the one implemented today. The steps that create an Intuit app and an Airbyte workspace are operator setup, written separately from the day-to-day import story.

Local sign-in uses a demo user created by the database seed. The window title in a fresh checkout reads “Kernel” until you apply the Fabriq Books brand; [getting started](docs/getting-started.md) shows that one command.

## Built on a metadata kernel

Lists, permissions, and the generic API are not hand-built once per screen. A **view** names a model and the fields to show. A **permission** grants read or write on those fields. A **role** reaches a view through `role_view`. The same description drives `GET/POST /api/{model}/view/{view}` and the Master list in the web shell. Forms are ordinary React screens that call that API, which is why a form can be specific (an invoice with its lines, an entity with account dropdowns) while the list stays generic.

Every business row carries `org_id`. Shared defaults — roles, views, the seeded US dollar — live on an organization named `org_system`. A request sees the caller's organization plus those shared rows. Writes stay on the caller's organization.

That engine is documented on its own, for anyone building an application on it, whether or not the application is Books. Start at the [kernel index](docs/kernel/README.md).

## Run it locally

You need Node.js 20 or newer, npm, a PostgreSQL server, and the `psql` client on your `PATH`. Postgres runs outside this repository. The example URL expects a role that can create a database.

```bash
npm run install:all
cp backend/.env.example backend/.env
cd backend && npm run setup:kernel
cd .. && npm run dev
```

Edit `DATABASE_URL` and `JWT_SECRET` in `backend/.env` before setup if the example role does not match your Postgres. `setup:kernel` creates the application database when it is missing, applies SQL generated from the Prisma schema, and seeds the shell: a system organization, a tenant organization, the Super Admin role, and the demo user. It does not use `prisma db push` or `prisma migrate`. Those commands are outside the workflow this repository uses; schema changes are reviewed SQL, and a push would skip that review.

API: http://localhost:4000 · UI: http://localhost:5174 · Login: `admin@example.com` / `admin123`

The shell lists are empty until you run the Books view seeds and, if you want sample numbers in the reports, the demo chart. The commands and the first clicks are in [getting started](docs/getting-started.md).

## Documentation

| Question | Document |
|---|---|
| Where do I start? | [Docs hub](docs/README.md) |
| How do I install and sign in? | [Getting started](docs/getting-started.md) |
| What do the accounting words mean here? | [Concepts](docs/concepts.md) |
| Ledger, sales, or connections? | [Ledger](docs/modules/ledger.md) · [Sales and receivables](docs/modules/sales-ar.md) · [Connections](docs/modules/connections.md) |
| Database, deploy, or connector setup? | [Operations](docs/operations/database.md) |
| How does the app use the engine? | [Architecture](docs/architecture.md) |
| How do I contribute? | [Contributing](CONTRIBUTING.md) |

## Future map

A few directions are visible from the model that is already in the tree. Further bookkeeping and ERP connectors can sit beside QuickBooks, mapping into the same customers, invoices, receipts, and credit notes. Sales documents can be posted into the general ledger from the default accounts stored on each entity. More of those documents can be entered directly in Books, next to the records a connection imports. This list is only a map. The pages above describe the software as it runs today.

## License

This repository does not yet contain a `LICENSE` file. Maintainers need to choose a license before the project can be reused under one. Until that file exists, do not assume a license from the presence of the source.
