# Books

This is the product file. Kernel instructions stay in the root [AGENTS.md](../../AGENTS.md).

Follow [../kernel/PORTING_A_DOMAIN.md](../kernel/PORTING_A_DOMAIN.md) for every later migration from prod. The books lessons are [KERNEL_PORT.md](./KERNEL_PORT.md). The task-sized plan is [AGENT_PLAN.md](./AGENT_PLAN.md). Run one module from that plan, then stop.

AR Phase 3–4 (payments, credit memos, ledger): design [AR_SETTLEMENT_AND_LEDGER.md](./AR_SETTLEMENT_AND_LEDGER.md), implementation [AR_PHASE_3_4_IMPLEMENTATION.md](./AR_PHASE_3_4_IMPLEMENTATION.md). Run one work package (WP0–WP7), then stop.

## Open-source release plans

Hand these to coding agents as paired engagements (same current product surface on `fabriq-books`):

1. [OSS_DOCS_PLAN.md](./OSS_DOCS_PLAN.md) — Books-first public docs for humans; universal AR model (not QBO-shaped); `docs/kernel/` domain-neutral; setup (Airbyte/app credentials) separate from end-user narrative; document only what exists (optional Future map only).
2. [OSS_TEST_PLAN.md](./OSS_TEST_PLAN.md) — Kernel test harness (API + Playwright) plus Books functional suites on top.

Public docs must be written for humans; agent-brief tone stays in plan files and this AGENTS file.

## Metadata-driven models first

If it is a Prisma model (including `source_system` / ERP connections), the **first** option is the kernel metadata path:

1. Seed `{model}_view` with `data_graph` (list columns + relations).
2. List with frontend `Master` (`type` + `view`) against `GET/POST /api/{model}/view/{view}`.
3. Create/edit forms call the same view API.

Do **not** invent a parallel REST surface (`/api/{model}/connections`, custom list DTOs) for ordinary list/detail CRUD. Custom routes are only for actions the view API cannot do — for connections that means `test-connection`, `extraction-config`, `sync`, `fetch-expense-accounts`, OAuth upsert when rotating secrets, and redacted flag reads (`has_oauth` / realm / Airbyte). Secrets in `connection_config` / `extraction_config` stay out of `data_graph` (omit those keys); do not build a second list API just to redact them.
