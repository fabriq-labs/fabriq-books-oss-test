# Agent data models

Schema: `backend/prisma/schema/agent.prisma`. Comments in that file that name a product action are not a constraint. `status`, `action_type`, and `mode` are strings.

Org rules are in [../tenancy.md](../tenancy.md). `agent_session`, `pending_action`, `llm_trace`, and `chat_thread` have a required `org_id` and are private. `agent_model_tool_config` has no `org_id`.

## agent_template

Configures a session: `system_prompt`, `user_hint`, `default_mode` (default `supervised`), `focus_models`, `allowed_tools`, `goal_model`, `pinned_plan`, `intake_schema`. `org_id` is optional. Admin writes go through `/api/agent/admin/templates` and require a platform admin.

## agent_session

One goal for one user in one org. `org_id` and `user_id` are required.

| Field | Meaning |
|---|---|
| `goal`, `name`, `goal_model` | What the user asked, a short title, and an optional model name |
| `template_id` | Optional `agent_template` |
| `plan` | JSON plan |
| `status` | String. The column comment lists `planning`, `awaiting_approval`, `executing`, `paused`, `completed`, `failed`, `abandoned`. The lifecycle also uses `awaiting_input` when `requestClarification` pauses the session. None of these are a Prisma enum. |
| `mode` | `supervised` by default. Also `semi_auto` or `autonomous` |
| `current_step_index`, `accumulated_context`, `clarification_request` | Turn state |
| `pending_actions_count`, `completed_actions_count` | Counters |

Indexes: `(org_id, user_id)`, `(org_id, status)`.

## agent_message

`session_id`, `role` (`user`, `assistant`, or `tool`), `content`, `tool_calls`, `tool_results`, `step_index`. Deleted with the session.

## pending_action

A proposed write waiting for a person. `org_id` is required. `session_id` is optional.

| Field | Meaning |
|---|---|
| `action_type` | String. Not a fixed set in Prisma. |
| `title`, `description`, `payload` | What the person reviews |
| `confidence`, `confidence_score` | `confidence` is a required string |
| `status` | String. The column comment lists `pending`, `approved`, `approved_with_edits`, `rejected`, `deferred`, `executed`, `expired`. |
| `on_approve` | String. The column comment lists `execute_immediately`, `queue_for_batch`, `notify_only`. |
| `resolved_by`, `resolved_at`, `execution_result`, `execution_error` | Outcome |

Updates from another org are 404.

## llm_trace and llm_trace_step

One row per model call (`llm_trace`) and one per step (`llm_trace_step`). `llm_trace.org_id` is required. Steps are unique on `(trace_id, step_number)`. Token, cache, and cost columns are nullable. The shell list is `/settings/llm-traces`.

## chat_thread

Private transcript for the in-app chat. `org_id` and `user_id` are required. `messages` is JSON.
