# Kernel implementation plan

**Status: waiting for review. Do not start the code changes in this document until they are approved.**

The shell branch `agentc/kernel-shell-53fb` is the domain-neutral tree. It contains this plan, the tenancy notes in [README.md](./README.md), and empty domain folders. Books models, books services, and the books route table are not on that branch. Some unreferenced books UI files are still in `frontend-1` and are not mounted. The security work below is not implemented.

## Goal

A kernel an agent can extend into a new application, with tenant isolation that will later be backed by Postgres row-level security. Books stays on `prod`. New domains are built on the shell branch.

## What is already decided

Recorded in [README.md](./README.md):

- The agent runtime ships inside the kernel.
- Every model has `org_id`. Shared defaults use the setup-seeded org `org_system`.
- Workflow definitions may be system-wide or tenant-specific. `workflow_instance` always belongs to the tenant.
- Prisma relations stay two-sided. The setup script creates foreign keys. Do not use `prisma db push`.
- Row-level security is a later review. The SQL in the kernel README is a sketch.

## Phase 1 — Fail closed

`authMiddleware` returns 401 unless the path is on an explicit public list (`/api/auth/login`, `/api/health`, and any other route we name in that list).

Workflow definition writes and `/api/agent/admin/*` require a platform-admin role. A tenant user who is only logged in cannot change flows, templates, or tool assignments.

## Phase 2 — One org rule in the data access layer

Add `scopedWhere(model, where, context)` and use it on every mutation, including `deleteMany`, `updateChild`, `addChildrenToParent`, and `deleteRelation`.

`deleteMany` accepts `{ ids: string[] }`, applies `org_id`, and returns `{ count }`.

Read rules:

| Table kind | Read | Write |
|---|---|---|
| Private (`workflow_instance`, `chat_thread`, domain rows) | caller `org_id` | caller `org_id` |
| Shareable (`workflow_flow`, `workflow_state`, `workflow_action`, `role`, `view`, `permission`, `prompt_template`) | caller `org_id` or `org_system` | caller `org_id`, or `org_system` when the caller is a platform admin |

`SKIP_PERMISSION_CHECKS=true` is refused when `NODE_ENV=production`.

## Phase 3 — Workflow and agent authorization

- Loading a workflow instance, its history, or running a transition requires `instance.org_id === caller.org_id`.
- `validateTransition` denies when `assigned_for` is missing, empty, or not `USER`, `ROLE`, or `EXPRESSION`. `ROLE` with a null `assigned_role_id` denies.
- `AgentService.handleRequest` rejects a session whose `org_id` is not the caller's.
- Pending-action PATCH and bulk approve filter on `org_id`.
- Supervised mode removes mutating tools in `ToolManager`. The prompt text is not the control.
- Slack signature failure returns 401.
- `executeSqlQuery` moves out of `ModelService` into an analytics executor that injects `org_id` and allowlists tables.

## Phase 4 — Tests the next agent extends

Kernel tests live under `backend/src/__tests__/kernel/` and run with `npm test -- --testPathPattern=kernel`. They do not use the books coverage gate.

Each file starts with the same fixture comment: two orgs, act as org A, assert org B is unchanged.

| Layer | Sample cases |
|---|---|
| Unit, no database | Public login path calls `next`. Any other path with a bad token returns 401. Unknown `assigned_for` denies. Supervised tool set has no `createRecord`. SQL without an org predicate on a tenant table is rejected. |
| Data access, two orgs | Org A `deleteMany` of org B's id deletes nothing. Nested child update on org B's parent writes nothing. Search returns only org A. Shareable read includes `org_system`. |
| HTTP | No cookie on `POST /api/workflow/flows` is 401. Tenant user is 403. Platform admin is allowed. Tenant A reading org B's instance is 404. Tenant A patching org B's pending action is 404. |

LLM calls stay out of this suite.

## Phase 5 — Row-level security

Start only after a fresh read of [README.md](./README.md). The review checklist there is the gate: separate read and write policies, `set_config('app.org_id', ..., true)` inside the transaction, application choice of the tenant override, and moving `currency.org_id` from `system` to `org_system`.

## Explicitly not in this plan

- Report SQL, posting correctness, and the sales-invoice one-legged journal. Those stay on the books tree.
- Frontend session-cookie hardening.
- Renaming existing books tables.
