# Tenancy

**Review this document again before writing any RLS policy.** The rules below are the contract. The SQL in the row-level security section is a sketch to review, not a migration.

Application tenancy is in `backend/src/tenancy/orgScope.ts`, the data access layer, the auth middleware, the workflow engine, and the agent runtime. Postgres row-level security is not implemented.

## The contract

Every model the engine stores carries `org_id`. Setup seeds one system organization. Its id is `org_system`. Rows owned by that org are the shared defaults: default workflow definitions, default roles, default views, and the platform rows in [examples.md](./examples.md).

The seeded tenant org is `org_kernel`. Logging in as `org_system` does not reveal tenant data. The system id is another org id, not a bypass.

`workflow_instance` always belongs to the tenant that owns the record. It is never a shared default on `org_system`. The engine stamps `org_id` from the caller. The seeded admin user is on `org_kernel`.

Rows whose `org_id` is null are not returned. A read matches the caller org, or `org_system` on a shareable model, by equality.

## What the schema actually declares

Do not read the contract as a `NOT NULL` constraint on every column.

| `org_id` in Prisma | Models |
|---|---|
| Required `String` | `currency`, `workflow_instance`, `workflow_history`, `comment`, and the agent tables that declare it required (`agent_session`, `pending_action`, `llm_trace`, `chat_thread`, and the others in `agent.prisma`) |
| Optional `String?` | `user`, `role`, `view`, `permission`, `role_view`, `role_user`, `workflow_flow`, `workflow_state`, `workflow_action`, `prompt_template`, `attachment`, `base_model` |
| No `org_id` column | `org`, `agent_model_tool_config` |

`role.name` and `workflow_flow.name` are each `String @unique`. The name is unique in the whole database. It is not unique per org. A tenant flow cannot reuse the system flow's name.

## Reads and writes

`modelTenancy` in `orgScope.ts` classifies a model:

| Kind | Models | Read | Write |
|---|---|---|---|
| Shareable | `role`, `workflow_flow`, `workflow_state`, `workflow_action`, `view`, `permission`, `role_view`, `prompt_template`, `currency` | Caller org or `org_system` | Caller org. A platform admin may also write `org_system`. |
| Unscoped | `org`, `agent_model_tool_config` | No org predicate | No org predicate. `org_id` is stripped if a caller sends it. |
| Private | Everything else that has `org_id`, including `workflow_instance`, `user`, `role_user`, and `chat_thread` | Caller org only | Caller org only |

A platform admin is a user whose role name contains `super admin` (`backend/src/auth/platformAdmin.ts`). On a shareable model, `writeOrgScope` is the caller org or `org_system`. On create, `applyOrgOnWrite` keeps `org_id = org_system` only when that caller is a platform admin and the payload already says `org_system`. Otherwise the stamp is the caller org. Updates cannot move a row to another org, except that same platform-admin case.

Workflow definition writes (any method except GET and HEAD under `/api/workflow/flows`) and `/api/agent/admin/*` also require `requirePlatformAdmin`. Instance reads and transitions require `instance.org_id` to equal the caller org.

## Prisma relations

Prisma requires both sides of a relation. A one-sided relation fails `prisma validate`. A plain string column with no `@relation` validates, and then `include` stops working.

This repo is one Prisma client. The relation that exists today is `org.basecurrency_id` to `currency`, with `currency.orgs` on the other side. A future domain model that points at `user` needs the matching array on `user` in `metadata.prisma`. The folder for that model is in [kernel/BUILDING_A_DOMAIN.md](./kernel/BUILDING_A_DOMAIN.md).

The setup script creates foreign keys in the database. Do not use `prisma db push`. Editing a relation in the schema does not create or drop a database foreign key until setup is changed on purpose.

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
3. **Choose the tenant row in application code.** RLS returns both the system default and the tenant override. It does not choose between them. The current engine does not choose either: `createWorkflowInstance` uses `findFirst` on `model_name` with no org filter. See [workflows.md](./workflows.md).
4. **Foreign keys ignore RLS.** A string column can store another tenant's id. The setup-script foreign key checks that the id exists. It does not check that the org matches. Add that check only where a cross-tenant reference is unacceptable.
5. **Keep `currency.org_id` on `org_system`.** The kernel seed already writes USD that way. An existing database that still has `org_id = 'system'` must be moved in the same change that turns RLS on.
