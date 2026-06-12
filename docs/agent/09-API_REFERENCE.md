# Fabriq Agent — API Reference

**Audience**: Frontend developers wiring up agent UI, or anyone tracing a
request from HTTP down into `AgentService`.
**File**: `backend/src/agent/routes.ts`

All routes are prefixed with `/api/agent` and require `authMiddleware`
(JWT — see [docs/AUTHENTICATION.md](../AUTHENTICATION.md)). Every handler
re-checks `resource.org_id === auth.user.org_id` before returning a record —
a session or pending action from another org returns `404`, not `403`, to
avoid leaking existence.

---

## Session Management

### `POST /api/agent/sessions`

Create a new agent session. This is the entry point for goal-based sessions
(GoalSetter UI) — see [03-SESSION_LIFECYCLE.md — Phase 1](./03-SESSION_LIFECYCLE.md#phase-1-planning).

**Request body**:
```json
{
  "goal": "Reconcile all unmatched HDFC transactions for March",
  "mode": "supervised",
  "goal_model": "posting",
  "template_id": "atpl_reconcile"
}
```

If `template_id` is provided and `goal_model` is omitted, the session
inherits `goal_model` from `agent_template.goal_model`.

**Response** (`201`): `{ data: <agent_session> }` with `status: 'planning'`.

---

### `GET /api/agent/sessions`

List sessions for the current user within their org.

**Response**: `{ data: [<agent_session>...] }`

---

### `GET /api/agent/sessions/:id`

Get a single session by ID.

**Response**: `{ data: <agent_session> }` — `404` if the session belongs to a
different org.

---

### `PATCH /api/agent/sessions/:id`

Update session fields directly. Body accepts any of: `status`, `mode`,
`plan`, `current_step_index`, `accumulated_context`. Used for manual
intervention (e.g. an admin force-completing a stuck session) — normal
session progression happens via tool calls (`createPlan`, `completeStep`),
not this endpoint.

**Response**: `{ data: <agent_session> }`

---

### `POST /api/agent/sessions/:id/clarify`

Submit the user's answer to a `requestClarification` question. Only valid
when `session.status === 'awaiting_input'`. Full flow:
[03-SESSION_LIFECYCLE.md — Phase 2b](./03-SESSION_LIFECYCLE.md#phase-2b-awaiting-input-requestclarification).

**Request body**:
```json
{ "response": "HDFC Current Account" }
```

**Side effects**:
- Appends `{ step_index, question, answer, context, input_schema }` to
  `accumulated_context.clarifications[]`
- Persists `response` as a `role: 'user'` `agent_message`
- Clears `clarification_request`, sets `status = 'executing'`
- Emits `session_status_changed`
- `setImmediate`s a continuation call into `agentService.handleRequest()`

**Response**: `{ success: true }`

**Errors**: `400` if `status !== 'awaiting_input'` or `response` missing/not
a string; `404` if the session belongs to another org.

---

### `GET /api/agent/sessions/:id/messages`

List all `agent_message` rows for a session, in creation order.

**Response**: `{ data: [<agent_message>...] }`

---

### `GET /api/agent/sessions/:id/trace`

Full audit trace: messages + `llm_trace` rows + pending actions. Used by the
trace/debug UI — see [11-OBSERVABILITY.md](./11-OBSERVABILITY.md).

**Response**: `{ data: { session, messages: [], traces: [], pendingActions: [] } }`

---

### `GET /api/agent/sessions/:id/events`

SSE stream. Sends a `snapshot` event immediately on connect, then live
session events as they occur.

**Auth**: `Authorization: Bearer <token>` header, or `?token=<jwt>` query
param (for `EventSource`, which can't set custom headers).

**Wire format**: `data: ${JSON.stringify(event)}\n\n`

**Event envelope**:
```json
{ "id": "evt_abc123", "type": "session_status_changed", "sessionId": "...", "orgId": "...", "timestamp": "...", "data": { ... } }
```

**Event types**: `snapshot`, `step_started`, `step_completed`, `tool_called`,
`action_queued`, `session_status_changed`, `inbox_count_changed`, `heartbeat`.
Full schema per type: [03-SESSION_LIFECYCLE.md — SSE Event System](./03-SESSION_LIFECYCLE.md#sse-event-system).

---

## Agent Invocation

### `POST /api/agent/chat/stream`

Streaming agent call — used by conversational chat (no `sessionId` required)
and as the transport for the first turn of a goal-based session.

**Request body**:
```json
{
  "message": "Categorise all uncategorised HDFC expenses for March 2025",
  "sessionId": "ses_abc123",
  "context": {
    "modelName": "posting",
    "viewName": "posting_view",
    "recordId": null
  }
}
```

**Response**: `Content-Type: text/event-stream`. Tokens stream in real time.

---

### `POST /api/agent/chat`

Non-streaming agent call. Used by tests and internal auto-continuation
(`setImmediate` calls inside `completeStep` / `/clarify` / pending-action
resolution use `agentService.handleRequest()` directly, not this HTTP route —
this route exists for external/test callers).

**Request body**: same shape as `/chat/stream`.

**Response**:
```json
{
  "choices": [{ "message": { "role": "assistant", "content": "...", "id": "msg_..." } }],
  "steps": [{ "type": "tool-use", "toolCalls": [...] }]
}
```

---

### `POST /api/agent/request`

Legacy/simple invocation — `{ message, previousMessages?, context? }` →
`{ response }`. Calls `agentService.handleRequest()` directly with no
session tracking. Prefer `/chat` or `/chat/stream` for new integrations.

---

## Pending Actions

### `GET /api/agent/pending-actions`

List pending actions for the current org. Optional filters via query params:
`session_id`, `status`, `action_type`.

**Response**: `{ data: [<pending_action>...] }`

---

### `GET /api/agent/pending-actions/paginated`

Paginated list with filters. Used by the Global Inbox.

**Query params**:
- `page` (default `1`), `pageSize` (default `25`, max `100`)
- `session_id`, `action_type`, `confidence` (`high`/`medium`/`low`)
- `status` — defaults to `pending` if omitted; pass `all` to remove the filter
- `sort` — `confidence_desc` sorts by `confidence_score`; otherwise sorts by
  `created_at`, both descending

**Response**: `{ data: { items: [], total, page, pageSize, totalPages } }`

---

### `GET /api/agent/pending-actions/:id`

Get a single pending action.

**Response**: `{ data: <pending_action> }` — `404` if it belongs to another
org.

---

### `PATCH /api/agent/pending-actions/:id`

Resolve (approve/reject) a pending action — this is the approval endpoint,
see [06-BUILDERS_AND_EXECUTORS.md — Approval Flow](./06-BUILDERS_AND_EXECUTORS.md#approval-flow-end-to-end).

**Request body**:
```json
{
  "status": "approved",
  "resolution_note": "Looks correct",
  "edited_payload": null,
  "defer_until": null
}
```

`resolved_by` is set server-side from `auth.user.id`. If `status ===
'approved'` and `PendingActionExecutor.hasExecutor(action_type)` (or
`on_approve === 'execute_immediately'`), the matching executor runs
synchronously before the response is returned.

**Response**: `{ data: <pending_action> }` (with `status`, `execution_result`
or `execution_error` populated)

---

### `POST /api/agent/pending-actions/batch/:batchId/approve`

Bulk-approve all pending actions in a batch at or above a given confidence
level.

**Request body**:
```json
{ "confidence": "high" }
```

**Response**: `{ data: { approved_count: 18, approved_ids: ["pa_...", ...] } }`

Each approved action runs through the same executor path as the single
`PATCH` endpoint, including the `checkAllPendingActionsResolved()` →
auto-continuation chain described in
[06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md#approval-flow-end-to-end).

---

## Templates

### `GET /api/agent/templates`

List active templates available to the current org (system templates with
`org_id = null` plus org-specific ones). Used by GoalSetter to render
template cards.

**Response**: `{ templates: [{ id, name, description, icon, goal_model, default_mode, user_hint }] }`

---

## Admin — Templates

Requires super admin role. See
[02-ARCHITECTURE.md — Agent Template Management](./02-ARCHITECTURE.md#agent-template-management)
for the admin UI this backs.

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/agent/admin/templates` | List all templates including drafts |
| `GET` | `/api/agent/admin/templates/:id` | Get a single template |
| `POST` | `/api/agent/admin/templates` | Create a template |
| `PUT` | `/api/agent/admin/templates/:id` | Update a template |
| `DELETE` | `/api/agent/admin/templates/:id` | Delete a template |

---

## ERP / Direct Pipeline Endpoints

These call the same handlers as the agent tools
([05-TOOLS.md — ERP Handler Registry](./05-TOOLS.md#erp-handler-registry)) but
are invoked directly by the frontend, outside of an agent session — used by
the posting list's inline "Categorize"/"Reconcile" row actions.

### `POST /api/agent/erp/categorize-transaction`

Single transaction categorization (dry-run prediction, no DB write).

**Request body**: `{ posting_id: string }`

**Response**: `{ posting_id, predicted_account_id, predicted_account_name, confidence, confidence_score, reasoning }`

---

### `POST /api/agent/erp/categorize-transaction-batch`

Batch categorization — same handler `categorizePostings` calls internally
([05-TOOLS.md — categorizePostings](./05-TOOLS.md#categorizepostings)).

**Request body**: `{ posting_ids: string[], options?: { dry_run?: boolean } }`

**Response**: `{ results: [...predictions] }`

---

### `POST /api/agent/erp/reconcile-transaction`

Run the reconciliation matching pipeline on one or more postings — same logic
as `suggestReconciliationMatches`
([05-TOOLS.md — suggestReconciliationMatches](./05-TOOLS.md#suggestreconciliationmatches)).

**Request body**: `{ posting_ids: string[] }`

**Response**: `{ results: [{ posting, reconciliation: { status, best_match, alternatives } }] }`

Postings are returned with full `posting_view` data graph (account names,
etc.) so the frontend can merge rows in-place.

---

### `POST /api/agent/erp/confirm-reconciliation`

Confirm a reconciliation suggestion — creates a `payment_receipt` if the
match is an invoice, links the posting. Same `confirmReconciliation()` called
by `ReconcilePostingExecutor`
([06-BUILDERS_AND_EXECUTORS.md — ReconcilePostingExecutor](./06-BUILDERS_AND_EXECUTORS.md#reconcilepostingexecutor)).

**Request body**: `{ posting_id: string }`

**Response**: Full posting in `data_graph` shape (for in-place row update in
the frontend list)

---

## Misc

### `POST /api/agent/extract`

File upload + data extraction (invoice PDFs, images). Multipart form data,
any field name (`upload.any()`). Uses `AI.generateObject` to extract
structured invoice data — see
[05-TOOLS.md — processInvoiceFromPdf / extractInvoiceFromFile](./05-TOOLS.md#processinvoicefrompdf--extractinvoicefromfile).

---

### `POST /api/agent/process-email`

Email ingest + multi-file extraction — same extraction pipeline as
`/extract`, applied to all attachments on an inbound email.

---

### `GET /api/agent/health`

Unauthenticated health check.

**Response**: `{ status: 'healthy', provider: '<LLM_PROVIDER>', version: '1.0.0' }`

---

## What's Next

- **10-LIBRARIES_AND_PROVIDERS.md** — the AI SDK and `modelProvider.ts`
  abstraction backing `/chat`, `/chat/stream`, and `/request`
- **11-OBSERVABILITY.md** — what `/sessions/:id/trace` returns and how to
  read it
