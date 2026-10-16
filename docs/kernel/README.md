# Kernel

**Status**: Application tenancy is in the data access layer, auth middleware, workflow engine, and agent runtime. Postgres row-level security is not implemented.

The shell branch has no books models. Domain code goes in the folders described in [BUILDING_A_DOMAIN.md](./BUILDING_A_DOMAIN.md). The work waiting for approval is [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

**Review this document again before writing any RLS policy.** The tenancy rules below are the contract. The SQL in the RLS section is a sketch to review, not a migration.

## What the kernel is

The kernel is the domain-neutral engine inside this repo. Books, reports, and the frontend stay in the repo and call the kernel. They are not part of it.

In scope:

- Data access, view-driven CRUD, search, permissions, and the model registry
- Auth middleware and the platform-admin check
- Workflow engine
- Agent runtime: sessions, tools, pending actions, prompts, Slack verification

Out of scope:

- Books actions, posting, reconciliation, and reports
- External system connectors
- The frontend

Books code may register a post-write hook and an agent executor. The kernel does not import `lib/actions`.

The agent ships inside the kernel. A books executor, such as reconcile-posting, stays in the books layer. The kernel decides whether a tool is allowed to run.

## Tenancy

Every model has `org_id`, and the column is required.

Setup seeds one system organization. Its id is `org_system`. Rows owned by that org are the shared defaults: default workflow definitions, default roles, shared reference data. `currency` rows today use `org_id = 'system'`. When tenancy is implemented, those rows move to `org_system` so there is a single sentinel.

Rules:

| Action | Which rows |
|---|---|
| Tenant read of a private table (`posting`, `workflow_instance`, `chat_thread`) | `org_id` of the caller |
| Tenant read of a shareable table (`workflow_flow`, `workflow_state`, `workflow_action`, `role`, `view`, `permission`) | Caller org, plus `org_system` |
| Tenant write | Caller org only |
| Platform-admin write of a default | `org_system` only, through an explicit admin path |

A tenant-specific workflow definition is a normal `workflow_flow` row with the tenant's `org_id`. The system-org row is the default. When both exist, the application uses the tenant row. Names are unique per org: `@@unique([org_id, name])` on `role` and `workflow_flow`.

`workflow_instance` always belongs to the tenant that owns the record. It is never stored under `org_system`.

Logging in as `org_system` does not reveal tenant data. The system id is another org id, not a bypass.

## Prisma relations

Keep cross-links between kernel models and books models (`user` to `purchase_requisition`, `workflow_instance` to `invoice`, and the others). Prisma requires both sides of a relation. A one-sided relation fails `prisma validate`. A plain string column with no `@relation` validates, and then `include` stops working.

This repo is one Prisma client, so the relations stay. The setup script creates the foreign keys in the database. Do not use `prisma db push`. Editing a relation in the schema does not create or drop a database foreign key until a migration is written on purpose.

Verified with Prisma 5.22 on a scratch schema: both sides validate, one side fails with P1012, and a scalar `created_by` with no relation validates.

## Row-level security

**Not implemented. Review this section before writing policies.**

Postgres row-level security will enforce the tenancy table above inside the database. The application filters stay as well.

`org_system` does not need a special mechanism. A shareable table has two policies:

- **Read.** The row's `org_id` is the caller's org, or it is `org_system`.
- **Write.** The row's `org_id` is the caller's org, for insert, update, and delete.

A private table has the write policy and a read policy with no `org_system` clause.

A tenant can read a default workflow and insert their own copy. They cannot update or delete the `org_system` row. Platform admin is a separate policy, turned on by a session flag for that path only. The setup role uses `BYPASSRLS`. The application role does not own the tables, and the tables are created with `FORCE ROW LEVEL SECURITY`, because a table owner skips RLS unless forced.

Sketch to review, not to run:

```sql
ALTER TABLE workflow_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_flow FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON workflow_flow
  FOR SELECT
  USING (
    org_id = current_setting('app.org_id', false)
    OR org_id = 'org_system'
  );

CREATE POLICY tenant_write ON workflow_flow
  FOR ALL
  USING (org_id = current_setting('app.org_id', false))
  WITH CHECK (org_id = current_setting('app.org_id', false));
```

`FOR ALL` covers insert, update, and delete. `SELECT` stays on `tenant_read`.

Check these points in the implementation review:

1. **One policy for every command would be wrong.** A read policy that includes `org_system` must not be reused as the update and delete policy, or a tenant can modify shared defaults.
2. **Set the org inside the transaction.** `SELECT set_config('app.org_id', $1, true)` so the value dies at commit. Prisma runs queries as autocommit, and the pool will reuse the connection. The kernel needs one wrapper that starts a transaction, sets the config, then runs the query. A missing setting must fail the query, not default to `org_system`.
3. **Prefer the tenant row in application code.** RLS returns both the system default and the tenant override. It does not choose between them.
4. **Foreign keys ignore RLS.** A string column can store another tenant's id. The setup-script foreign key checks that the id exists. It does not check that the org matches. Add that check only where a cross-tenant reference is unacceptable.
5. **Align `currency.org_id`.** Replace the existing `'system'` value with `org_system` in the same change that turns RLS on.

## Engine work now in code

1. Auth middleware fails closed except on `/api/auth/login`, `/api/health`, and `/api/agent/health`.
2. Data-access reads and mutations, including bulk delete and nested relations, filter on `org_id`.
3. Shareable reads include the caller org and `org_system`. Tenant writes stay on the caller org. A platform admin may write `org_system`.
4. Workflow instance reads and transitions require the instance org. Unknown `assigned_for` is denied.
5. Workflow definition writes and `/api/agent/admin/*` require platform admin. Pending-action updates and session turns require the caller org. Supervised mode drops mutating tools in `ToolManager`.
6. Raw SQL runs in `services/analytics/sqlExecutor.ts`, which allowlists tables and requires the caller org id on tenant tables.

Rows whose `org_id` is null are not returned. Setup should store shared defaults as `org_system`. Row-level security is still the later review in the section above.
