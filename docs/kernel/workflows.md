# Workflow engine

Definitions live in `workflow_flow`, `workflow_state`, and `workflow_action`. A running record is a `workflow_instance` plus `workflow_history`. Code is `backend/src/workflow-engine/`. The router is mounted at `/api/workflow` and sits behind `authMiddleware`.

`workflow_flow.name` is globally unique. `model_name` is not unique. Two flows may name the same model if their `name` values differ. The seed does not insert a flow. [examples.md](./examples.md) creates one.

## Definition rows

`workflow_flow` (`metadata.prisma`): `name` (`@unique`), `model_name`, `description`, `is_active`, `org_id` (optional in Prisma). Shareable. A default uses `org_id` `org_system`. A tenant copy uses the tenant org and a different `name`.

`workflow_state`: `flow_id`, `name`, `sequence`, `is_initial`, `is_final`, `is_active`, `skip`, `skip_target_state_id`, `entry_conditions`, `exit_conditions`. Assignment is required: `assigned_for` is `USER`, `ROLE`, or `EXPRESSION`. `ROLE` uses `assigned_role_id`. `USER` uses `assigned_user_id`. `EXPRESSION` uses `assigned_expression`. `assigned_for` is a required `String` in Prisma.

`workflow_action`: `name`, `source_state_id`, `target_state_id`, `conditions`, `side_effects`, `org_id`. `side_effects` is JSON. A database effect names a function in `workflowActionMap` in `backend/src/domain/actions.ts`. That map is empty on this branch. Registering a handler is a domain extension; the kernel only calls the name.

`GET /api/workflow/flows` returns flows whose `org_id` is the caller org or `org_system`. It does not hide the system row when a tenant row exists, and it does not prefer the tenant row.

Any other method under `/api/workflow/flows` requires a platform admin.

| Method | Path |
|---|---|
| POST | `/api/workflow/flows` |
| GET | `/api/workflow/flows` and `/api/workflow/flows/:flowId` |
| POST | `/api/workflow/flows/:flowId/states` |
| PUT | `/api/workflow/flows/:flowId/states/:stateId` |
| PUT | `/api/workflow/flows/:flowId/states` |
| POST | `/api/workflow/flows/:flowId/actions` |
| PUT | `/api/workflow/flows/:flowId/states/:stateId/actions/:actionId` |
| DELETE | `/api/workflow/flows/:flowId/states/:stateId/actions/:actionId` |

`GET /api/workflow/flows/:flowId` returns 404 unless the flow's `org_id` is the caller org or `org_system`.

## Instances

`workflow_instance.org_id` is a required `String`. The row belongs to the caller. It is private. It is not a shared default.

`POST /api/workflow/instances` with `{ flow_id, model_id }` calls `startWorkflow`. That passes `flow_id` into `createWorkflowInstance`, which loads the flow by `findFirst({ where: { model_name } })` using that string as `model_name`. It does not query `workflow_flow.id` and it does not filter by org. Pass the model name. If two flows share it, the row is whichever `findFirst` returns.

The instance stores `flow_id`, `model_id`, `current_state`, `current_state_id`, `assigned_user_id`, `status` (`active`, `completed`, or `cancelled`), and `org_id` from the caller.

`startWorkflow` then runs the first transition. History is a `workflow_history` row: `instance_id`, `action_id`, `from_state`, `to_state`, `performed_by`, and a required `org_id`.

| Method | Path |
|---|---|
| POST | `/api/workflow/instances` |
| GET | `/api/workflow/instances/:instanceId` |
| GET | `/api/workflow/instances/:instanceId/actions` |
| POST | `/api/workflow/instances/:instanceId/actions/:actionId` |
| GET | `/api/workflow/instances/:instanceId/history` |
| GET | `/api/workflow/instances/:instanceId/comments` |
| POST | `/api/workflow/instances/:instanceId/comments` |
| GET | `/api/workflow/instances/state/:stateId` |
| GET | `/api/workflow/instances/:modelName/state` |

Reads and transitions require `instance.org_id === caller.org_id`. A miss is 404.

## Assignment

`assignmentDenial` in `backend/src/workflow-engine/core/assignment.ts` denies the transition when:

- `assigned_for` is missing, blank, or not `USER`, `ROLE`, or `EXPRESSION`
- `ROLE` and `assigned_role_id` is null, or the caller does not have that role
- `USER` and the caller is neither `assigned_user_id` nor the record's `created_by`

## Which models start a workflow

`backend/src/domain/workflowModels.ts` exports `DOMAIN_WORKFLOW_MODELS`. It is empty. A domain appends a model name there after the flow exists. The kernel does not start an instance for an unlisted model on create.

The shell page for definitions is `/settings/workflows`, behind `SuperAdminGuard`.
