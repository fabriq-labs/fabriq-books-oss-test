# Worked examples

These steps use tables and routes that exist on this branch. The seed is `backend/src/utils/setup/seedKernel.ts`, run by `cd backend && npm run setup:kernel`.

Seeded rows:

| Thing | Id | Org |
|---|---|---|
| System org | `org_system` | — |
| Tenant org | `org_kernel` | — |
| Role | `role_kernel_super_admin`, name `Super Admin` | `org_system` |
| User | `user_kernel_admin`, `admin@example.com` | `org_kernel` |
| Role assignment | `rous_kernel_admin` | `org_kernel` |
| Currency | `curr_kernel_usd`, code `USD` | `org_system` |

Both orgs set `basecurrency_id` to `curr_kernel_usd`. `attachment` is platform storage and has no seed row.

Views the seed inserts, all on `org_system`, each with a `data_graph`, a `*` write permission, and a `role_view` to Super Admin. The currency graph shows Code, Name, and Symbol. User shows Name, Email, Manager, Department, and Roles. Department shows Name. Role shows Name and Views. The view model shows Name and Model Name. Permission shows Access, View, and Name. Prompt template shows Context, Version, Priority, Is Default, and Prompt Type. Workflow shows Name, Model, Description, and Active.

| View id | `name` | `model_name` |
|---|---|---|
| `view_kernel_user` | `user_view` | `user` |
| `view_kernel_department` | `department_view` | `department` |
| `view_kernel_role` | `role_view` | `role` |
| `view_kernel_view` | `view` | `view` |
| `view_kernel_permission` | `permission_view` | `permission` |
| `view_kernel_prompt` | `prompt_template_view` | `prompt_template` |
| `view_kernel_currency` | `currency_view` | `currency` |
| `view_kernel_flow` | `workflow_flow_view` | `workflow_flow` |
| `view_kernel_llm_trace` | `llm_trace_view` | `llm_trace` |
| `view_kernel_llm_trace_step` | `llm_trace_step_view` | `llm_trace_step` |
| `view_kernel_workflow_instance` | `workflow_instance_view` | `workflow_instance` |
| `view_kernel_chat_thread` | `chat_thread_view` | `chat_thread` |
| `view_kernel_import_run` | `import_run_view` | `import_run` |
| `view_kernel_agent_tools` | `agent_model_tool_config_view` | `agent_model_tool_config` |

Login is `admin@example.com` / `admin123`. That user is a platform admin because the role name contains `super admin`. Calls below assume that session.

## A model and the other side of a relation

`currency` stays in `backend/prisma/schema/platform.prisma` because kernel code reads it when no domain is installed (`org.basecurrency_id`) and it is not a product catalog. The seed inserts one USD row on `org_system`.

The relation has two sides. On `org`:

```prisma
basecurrency_id String?
currency        currency? @relation(fields: [basecurrency_id], references: [id])
```

On `currency`:

```prisma
orgs org[]
```

A model stays in `platform.prisma` only when both are true: kernel code reads or writes it with no domain installed, and it is not a product catalog. `attachment` meets that test. The upload routes write a row. There is no seed row.

A new model for a future application does not go in `platform.prisma`. The steps are in [adding-a-model.md](./adding-a-model.md). The same two-sided rule applies: a relation to `user` needs the matching field on `user` in `metadata.prisma`.

`currency.org_id` is a required `String`. Read it as a shareable model: the caller org or `org_system`.

## A view

The currency screen is the seeded view, not a custom route.

- List API: `GET /api/currency/view/currency_view`
- Create API: `POST /api/currency/view/currency_view`
- Search API: `POST /api/currency/view/currency_view/search`
- Shell list: `/accounting/currency` (Super Admin), which mounts Master with `type="currency"` and `view="currency_view"`
- Generic list shape: `/master/app/currency` also loads view `currency_view`, because `DomainMaster` uses `{model}_view`

Creating another view is a row in `view`: `name`, `model_name`, `org_id`, and a `data_graph`. The column is required. As a platform admin, `POST /api/view/view/view` with `org_id` `org_system` stores the shared default. A tenant view uses `org_kernel`. The graph is the Prisma `select` and the column list. See [metadata.md](./metadata.md).

## A permission and a role_view

The seed already attaches currency to Super Admin:

- `permission` `perm_view_kernel_currency`: `view_id` `view_kernel_currency`, `field_name` `*`, `access` `write`, `org_id` `org_system`
- `role_view` `rovi_view_kernel_currency`: `role_id` `role_kernel_super_admin`, `view_id` `view_kernel_currency`, `org_id` `org_system`

`permission` is unique on `(view_id, field_name)`. `role_view` is unique on `(role_id, view_id)`.

To grant a narrower field, insert a `permission` row with that `field_name` and `access` `read` or `write`. The API is `POST /api/permission/view/permission_view`. The shell screen is `/settings/permissions`.

Then link the view to the role with a `role_view` row. The seed writes that row with Prisma. The view named `role_view` is the role list. The join model `role_view` has no view, so the shell has no list page for the link itself. The role form at `/settings/roles` is where an admin attaches views.

## A role on org_system and a role_user on the tenant

This is what the seed does. Copy the shape for another role.

1. Create the role on `org_system`. `name` must be new in the whole database (`role.name` is `@unique`).

   `POST /api/role/view/role_view`

   ```json
   { "name": "Kernel Reviewer", "org_id": "org_system" }
   ```

   A platform admin writing a shareable model may set `org_id` to `org_system`. Anyone else is stamped with the caller org.

2. Attach views with `role_view` rows, as above.

3. Assign the role to the tenant user with `role_user`. `role_user` is private: the row's org is the caller org, `org_kernel`, even when the role row lives on `org_system`.

   The seed row is `rous_kernel_admin` with `role_id` `role_kernel_super_admin`, `user_id` `user_kernel_admin`, `org_id` `org_kernel`.

`role_user` is unique on `(role_id, user_id)`.

## A workflow definition

The seed does not insert a flow. Definitions are shareable. Writes require a platform admin (`requirePlatformAdmin` on non-GET `/api/workflow/flows`).

`workflow_flow.name` is globally unique. A default and a tenant copy need different names.

Default flow on `org_system`:

`POST /api/workflow/flows`

```json
{
  "name": "Currency review",
  "model_name": "currency",
  "description": "Shared default",
  "org_id": "org_system"
}
```

Tenant flow on `org_kernel`, different name, same `model_name`:

```json
{
  "name": "Currency review (kernel)",
  "model_name": "currency",
  "description": "Tenant copy",
  "org_id": "org_kernel"
}
```

`GET /api/workflow/flows` returns both. The caller org or `org_system` matches. The engine does not pick the tenant row when both exist.

Add a state. `assigned_for` must be `USER`, `ROLE`, or `EXPRESSION`. `ROLE` needs `assigned_role_id`. Unknown or empty `assigned_for` is denied at transition time. Prisma requires `assigned_for` on the row.

`POST /api/workflow/flows/{flowId}/states` forwards only `name`, `description`, `is_initial`, `is_final`, `entry_conditions`, and `exit_conditions`. It drops `assigned_for`. Set assignment with the update route after the row exists.

`POST /api/workflow/flows/{flowId}/states`

```json
{ "name": "Draft", "is_initial": true, "is_final": false }
```

`PUT /api/workflow/flows/{flowId}/states/{stateId}`

```json
{
  "assigned_for": "ROLE",
  "assigned_role_id": "role_kernel_super_admin"
}
```

Add an action between two states:

`POST /api/workflow/flows/{flowId}/actions`

```json
{
  "name": "Submit",
  "source_state_id": "{draftStateId}",
  "target_state_id": "{nextStateId}"
}
```

`side_effects` is optional JSON. A `database` effect names a handler in `workflowActionMap` in `backend/src/domain/actions.ts`. That map is empty until a domain registers a handler.

## An instance on a tenant record

`POST /api/workflow/instances` accepts `{ "flow_id", "model_id" }`.

`startWorkflow` passes `flow_id` into `createWorkflowInstance`. That method loads the flow with `findFirst({ where: { model_name: <that string> } })`. It does not look up `workflow_flow.id`, and it does not filter by org. Pass the flow's `model_name` (`currency` in the example above). If two flows share `model_name`, which row is used is undefined.

The new `workflow_instance.org_id` is the caller's org. For `admin@example.com` that is `org_kernel`. The instance is not written to `org_system` unless the caller org is `org_system`.

Move it:

`POST /api/workflow/instances/{instanceId}/actions/{actionId}`

Reading the instance, its history, or its actions requires `instance.org_id` to equal the caller org. Another org gets 404.

`GET /api/workflow/instances/{instanceId}/history` is the audit trail in `workflow_history`. `org_id` on that table is required and is the caller org.
