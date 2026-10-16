# Agent API

All routes are under `/api/agent`. File: `backend/src/agent/routes.ts`.

Except `GET /api/agent/health`, every route uses `authMiddleware`. Session and pending-action handlers require the row's `org_id` to equal the caller org. A miss is 404. Admin routes also use `requirePlatformAdmin`. See [../auth.md](../auth.md).

## Sessions

| Method | Path | Role |
|---|---|---|
| POST | `/api/agent/sessions` | Create. Body includes `goal` and optional `mode`, `goal_model`, `template_id`. Status starts at `planning`. |
| GET | `/api/agent/sessions` | List for the caller org |
| GET | `/api/agent/sessions/:id` | One session |
| PATCH | `/api/agent/sessions/:id` | Direct field update |
| POST | `/api/agent/sessions/:id/clarify` | Answer a `requestClarification` pause |
| GET | `/api/agent/sessions/:id/messages` | `agent_message` rows |
| GET | `/api/agent/sessions/:id/trace` | Trace for that session |
| GET | `/api/agent/sessions/:id/events` | SSE |

`mode` defaults to `supervised` on the model.

## Turns

| Method | Path |
|---|---|
| POST | `/api/agent/chat` |
| POST | `/api/agent/chat/stream` |
| POST | `/api/agent/request` |
| POST | `/api/agent/extract` |

`/chat/stream` is what the workbench uses. The turn rejects a session whose org is not the caller's.

## Pending actions

| Method | Path |
|---|---|
| GET | `/api/agent/pending-actions` |
| GET | `/api/agent/pending-actions/paginated` |
| GET | `/api/agent/pending-actions/:id` |
| PATCH | `/api/agent/pending-actions/:id` |
| POST | `/api/agent/pending-actions/batch/:batchId/approve` |

PATCH body requires `status`. Resolution checks the caller org.

## Templates and model tools

`GET /api/agent/templates` is the caller's read.

These require a platform admin:

| Method | Path |
|---|---|
| GET, POST | `/api/agent/admin/templates` |
| GET, PUT, DELETE | `/api/agent/admin/templates/:id` |
| GET | `/api/agent/admin/model-tools` |
| GET | `/api/agent/admin/model-tools/catalog` |
| GET, PUT | `/api/agent/admin/model-tools/:modelName` |
| POST | `/api/agent/admin/model-tools/seed` |

## Health

`GET /api/agent/health` is public.
