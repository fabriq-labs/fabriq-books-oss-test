# Books

This is the product file. Kernel instructions stay in the root [AGENTS.md](../../AGENTS.md).

Follow [../kernel/PORTING_A_DOMAIN.md](../kernel/PORTING_A_DOMAIN.md) for every later migration from prod. The books lessons are [KERNEL_PORT.md](./KERNEL_PORT.md). The task-sized plan is [AGENT_PLAN.md](./AGENT_PLAN.md). Run one module from that plan, then stop.

## Metadata-driven models first

If it is a Prisma model (including `source_system` / ERP connections), the **first** option is the kernel metadata path:

1. Seed `{model}_view` with `data_graph` (list columns + relations).
2. List with frontend `Master` (`type` + `view`) against `GET/POST /api/{model}/view/{view}`.
3. Create/edit forms call the same view API.

Do **not** invent a parallel REST surface (`/api/{model}/connections`, custom list DTOs) for ordinary list/detail CRUD. Custom routes are only for actions the view API cannot do — for connections that means `test-connection`, `extraction-config`, and `sync` (and similar side effects). Secrets in `connection_config` / `extraction_config` stay out of `data_graph` (omit those keys); do not build a second list API just to redact them.
