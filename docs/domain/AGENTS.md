# Books

This is the product file for coding agents. Kernel instructions stay in the root [AGENTS.md](../../AGENTS.md). Human readers start at the [Books docs hub](../README.md), not here.

## Public docs (humans)

Write and read these in complete paragraphs. They describe the software that runs today. Agent-brief tone stays in this file and in the plans below.

| Audience | Document |
|---|---|
| Anyone evaluating or running Books | [docs/README.md](../README.md), [getting-started.md](../getting-started.md), [concepts.md](../concepts.md) |
| Ledger, sales, connections | [modules/ledger.md](../modules/ledger.md), [modules/sales-ar.md](../modules/sales-ar.md), [modules/connections.md](../modules/connections.md) |
| Database, deploy, connector setup | [operations/database.md](../operations/database.md), [operations/deploy.md](../operations/deploy.md) (Compose, Railway, Fly + `AUTO_SETUP` onboarding), [operations/connections-setup.md](../operations/connections-setup.md) |
| Onboarding requirements | [ONBOARDING_REQUIREMENTS.md](./ONBOARDING_REQUIREMENTS.md) |
| How Books uses the engine | [architecture.md](../architecture.md). The engine itself is [kernel/README.md](../kernel/README.md) and stays domain-neutral. |
| Contributors | [CONTRIBUTING.md](../../CONTRIBUTING.md), [SECURITY.md](../../SECURITY.md) |

When you change a public module name, update the module map in [OSS_TEST_PLAN.md](./OSS_TEST_PLAN.md) in the same change.

Follow [../kernel/PORTING_A_DOMAIN.md](../kernel/PORTING_A_DOMAIN.md) for every later migration from prod. The books lessons are [KERNEL_PORT.md](./KERNEL_PORT.md). The task-sized plan is [AGENT_PLAN.md](./AGENT_PLAN.md). Run one module from that plan, then stop.

AR Phase 3–4 (payments, credit memos, ledger): design [AR_SETTLEMENT_AND_LEDGER.md](./AR_SETTLEMENT_AND_LEDGER.md), implementation [AR_PHASE_3_4_IMPLEMENTATION.md](./AR_PHASE_3_4_IMPLEMENTATION.md). Run one work package (WP0–WP7), then stop.

## Open-source release plans

Hand these to coding agents as paired engagements (same current product surface on `fabriq-books`):

1. [OSS_DOCS_PLAN.md](./OSS_DOCS_PLAN.md) — Books-first public docs on `fabriq-books`; universal AR model; `docs/kernel/` domain-neutral (portable to `main`); setup vs end-user connections split; document only what exists; **WP-D6** cherry-picks kernel docs to `main` without Books product pages.
2. [OSS_TEST_PLAN.md](./OSS_TEST_PLAN.md) — Kernel test harness (API + Playwright) plus Books functional suites on top.

Public docs must be written for humans; agent-brief tone stays in plan files and this AGENTS file.

## Metadata-driven models first

If it is a Prisma model (including `source_system` / ERP connections), the **first** option is the kernel metadata path:

1. Seed `{model}_view` with `data_graph` (list columns + relations).
2. List with frontend `Master` (`type` + `view`) against `GET/POST /api/{model}/view/{view}`.
3. Create/edit forms call the same view API.

Do **not** invent a parallel REST surface (`/api/{model}/connections`, custom list DTOs) for ordinary list/detail CRUD. Custom routes are only for actions the view API cannot do — for connections that means `test-connection`, `extraction-config`, `sync`, `fetch-expense-accounts`, OAuth upsert when rotating secrets, and redacted flag reads (`has_oauth` / realm / Airbyte). Secrets in `connection_config` / `extraction_config` stay out of `data_graph` (omit those keys); do not build a second list API just to redact them.
