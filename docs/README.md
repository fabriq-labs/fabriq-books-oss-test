# Fabriq Books

This is the documentation for Fabriq Books, the accounting application in this repository. Books keeps a general ledger and a sales subledger for an organization that has more than one legal entity, and it can import those same records from an external bookkeeping system. QuickBooks Online is the connector that ships today. The objects you see in the app — invoice, payment receipt, credit note, connection — are Books objects. A connector maps an outside system into them.

If you want to run the app, start with [Getting started](./getting-started.md). If you want the vocabulary before you click, read [Concepts](./concepts.md). The [root README](../README.md) is the short version of what the project is.

## Guides

**[Getting started](./getting-started.md).** Install Node and Postgres, create the database, seed the screens, sign in, and make the first entity. For a container first-boot (Compose, Railway, or Fly) with the in-app org/chart wizard, use [Deploy](./operations/deploy.md).

**[Concepts](./concepts.md).** Organization, entity, account, posting, customer, invoice, payment receipt, credit note, application, and connection, in the sense Books uses those words.

**[Architecture](./architecture.md).** How this application uses views, permissions, the Master list, hand-written forms, and `org_id`. Read this when you are about to change the product, not when you are about to enter an invoice.

## Modules

These pages describe the screens and the behavior behind them.

| Guide | What it covers |
|---|---|
| [Ledger](./modules/ledger.md) | Entities and their ledger defaults, the chart of accounts, postings, opening balances, exchange rates, and financial reports. |
| [Sales and receivables](./modules/sales-ar.md) | Customers, suppliers, items, tax, invoices, payment receipts, credit notes, and how applications settle them. |
| [Connections](./modules/connections.md) | What a connection is, how you run an import, and where the imported rows show up in Books. |

A bookkeeper can follow the connections guide without setting up Airbyte. The administrator who creates the Intuit app and the extraction pipeline uses [Connections setup](./operations/connections-setup.md).

## Operations

| Guide | What it covers |
|---|---|
| [Database](./operations/database.md) | `setup:kernel`, why routine work does not use `prisma db push`, and how later SQL files are applied. |
| [Deploy](./operations/deploy.md) | The single Docker image, `AUTO_SETUP` onboarding, local Compose, Railway, and Fly.io. |
| [Connections setup](./operations/connections-setup.md) | Intuit app credentials, Airbyte, extraction settings, and the stream list for the QuickBooks path. |

The longer operator note that the deploy guide is written from is [infrastructure/BUILD_AND_DEPLOY.md](./infrastructure/BUILD_AND_DEPLOY.md).

## Metadata engine

Books is an application on a metadata-driven kernel that also lives in this repository. A view names a model and its fields, a permission grants read or write, and the generic API and the Master list render from that metadata. People who only run Books do not need the engine. People who add a screen, or who build a different application on the same engine, do.

The engine reference is [docs/kernel/](./kernel/README.md). It is written so it still makes sense for an application that is not Books. Books models appear there only as labeled examples. Tenancy rules are in [kernel/tenancy.md](./kernel/tenancy.md). Adding a model is in [kernel/adding-a-model.md](./kernel/adding-a-model.md). Where a product's files go is in [kernel/BUILDING_A_DOMAIN.md](./kernel/BUILDING_A_DOMAIN.md).

## Design notes and agent plans (maintainers)

The files below are working notes for people changing the product. They are not the manual. Some of them discuss design history and later work; the guides in this hub describe the software that runs today.

| Note | What it is |
|---|---|
| [domain/AGENTS.md](./domain/AGENTS.md) | Instructions for a coding agent working on Books. |
| [domain/SALES_MODEL.md](./domain/SALES_MODEL.md) | Coverage matrix for the universal sales schema. |
| [domain/AR_SETTLEMENT_AND_LEDGER.md](./domain/AR_SETTLEMENT_AND_LEDGER.md) | Settlement and ledger design, including worked amount examples. |
| [domain/AR_PHASE_3_4_IMPLEMENTATION.md](./domain/AR_PHASE_3_4_IMPLEMENTATION.md) | Implementation notes that accompany the settlement design. |
| [domain/QUICKBOOKS_FORWARD_SYNC.md](./domain/QUICKBOOKS_FORWARD_SYNC.md) | Operator detail for the QuickBooks transform. |
| [domain/QBO_INTEGRATION_PLAN.md](./domain/QBO_INTEGRATION_PLAN.md) | Integration design notes for that connector. |
| [domain/KERNEL_PORT.md](./domain/KERNEL_PORT.md) | Lessons from moving Books onto this shell. |
| [domain/AGENT_PLAN.md](./domain/AGENT_PLAN.md) | Task-sized plan for product work. |
| [domain/OSS_DOCS_PLAN.md](./domain/OSS_DOCS_PLAN.md) | Plan for these public docs. |
| [domain/OSS_TEST_PLAN.md](./domain/OSS_TEST_PLAN.md) | Plan for the open-source test harness. |

## Contributing and security

How to propose a change is [CONTRIBUTING.md](../CONTRIBUTING.md). How to report a vulnerability is [SECURITY.md](../SECURITY.md). Policy PDFs shipped with the repository are in [security/](./security/): `DATA_POLICY.pdf` and `INFORMATION_SECURITY_POLICY.pdf`.

## Future map

Further bookkeeping and ERP connectors can sit beside QuickBooks and map into the same Books records. Sales documents can be posted into the general ledger from the default accounts already stored on each entity. More of those documents can be entered directly in Books, next to records a connection imports. The guides above stay with what the application does now.
