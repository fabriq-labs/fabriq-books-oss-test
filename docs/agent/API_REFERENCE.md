# Fabriq Agent — API Reference

**Last Updated**: 2026-04-04  
**File**: `backend/src/agent/routes.ts`

All routes are prefixed with `/api/agent`. All routes require authentication.

---

## Session Management

### `POST /api/agent/sessions`

Create a new agent session.

**Request body**:
```json
{
  "goal": "Reconcile all unmatched HDFC transactions for March",
  "mode": "supervised",
  "goalModel": "posting",
  "templateId": "atpl_reconcile"
}
```

**Response**:
```json
{
  "id": "ses_abc123",
  "status": "planning",
  "goal": "...",
  "name": null,
  "plan": null,
  "current_step_index": null,
  "accumulated_context": null,
  "pending_actions_count": 0,
  "mode": "supervised",
  "started_at": "..."
}
```

---

### `GET /api/agent/sessions`

List all sessions for the current org, sorted by newest first.

**Query params**: `page`, `pageSize` (optional)

**Response**: `{ sessions: [...], total }`

---

### `GET /api/agent/sessions/:id`

Get a single session with its pending actions.

**Response**: Session object + `pending_actions: []`

---

### `GET /api/agent/sessions/:id/events`

SSE stream. Sends a `snapshot` event immediately on connect, then live session events.

**Headers required**: `Authorization: Bearer <token>` (passed as query param `token` for EventSource compatibility)

**Wire format**: `data: ${JSON.stringify(event)}\n\n`

**Event envelope**:
```json
{ "id": "evt_abc123", "type": "session_status_changed", "sessionId": "...", "orgId": "...", "timestamp": "...", "data": { ... } }
```

**Event types**: `snapshot`, `step_started`, `step_completed`, `tool_called`, `action_queued`, `session_status_changed`, `inbox_count_changed`, `heartbeat`

See [SESSION_LIFECYCLE.md](./SESSION_LIFECYCLE.md#sse-event-system) for full event schema.

---

### `GET /api/agent/sessions/:id/trace`

Full audit trace: messages + LLM calls + pending actions.

**Response**: `{ session, messages: [], traces: [], pendingActions: [] }`

---

### `GET /api/agent/messages`

Session messages filtered by `session_id`.

**Query params**: `session_id` (required), `page`, `pageSize`

---

## Agent Invocation

### `POST /api/agent/chat/stream`

Streaming agent call. Used by the frontend for the first turn.

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

**Response**: SSE stream (`Content-Type: text/event-stream`). Tokens stream in real time.

---

### `POST /api/agent/chat`

Non-streaming agent call. Used by tests and internal auto-continuation.

**Request body**: Same as `/chat/stream`

**Response**:
```json
{
  "choices": [{ "message": { "role": "assistant", "content": "...", "id": "msg_..." } }],
  "steps": [{ "type": "tool-use", "toolCalls": [...] }]
}
```

---

## Pending Actions

### `POST /api/agent/pending-actions/:id/resolve`

Approve or reject a single pending action.

**Request body**:
```json
{
  "status": "approved",
  "resolved_by": "user_abc",
  "resolution_note": "Looks correct",
  "edited_payload": null
}
```

**Response**: Updated `pending_action` object

---

### `POST /api/agent/pending-actions/bulk-approve`

Approve all high-confidence actions in a batch.

**Request body**: `{ "session_id": "ses_abc", "batch_id": "ses_abc-step-2" }`

---

### `GET /api/agent/pending-actions/paginated`

Paginated list with filters. Used by the Global Inbox.

**Query params**:
- `page` (default 1), `pageSize` (default 25)
- `session_id` — filter by session
- `action_type` — e.g. `categorize_transaction`
- `confidence` — `high` / `medium` / `low`
- `status` — `pending` / `approved` / `executed` / `rejected`

**Response**: `{ items: [], total, page, pageSize, totalPages }`

---

## Templates

### `GET /api/agent/templates`

List active templates available to the current org (system + org-specific). Used by GoalSetter.

**Response**: `{ templates: [{ id, name, description, icon, goal_model, default_mode, user_hint }] }`

---

## Admin — Templates

Requires super admin role.

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/agent/admin/templates` | List all templates including drafts |
| `POST` | `/api/agent/admin/templates` | Create a template |
| `PUT` | `/api/agent/admin/templates/:id` | Update a template |
| `DELETE` | `/api/agent/admin/templates/:id` | Delete a template |

---

## ERP Handlers

Direct API endpoints for the categorization and reconciliation pipelines (used outside of agent sessions).

### `POST /api/agent/erp/categorize-transaction`

Single transaction categorization.

**Request body**: `{ posting_id: string }`

**Response**: `{ posting_id, predicted_account_id, predicted_account_name, confidence, confidence_score, reasoning }`

---

### `POST /api/agent/erp/categorize-transaction-batch`

Batch categorization.

**Request body**: `{ posting_ids: string[], options?: { dry_run?: boolean } }`

**Response**: `{ results: [...predictions] }`

---

### `POST /api/agent/erp/reconcile-transaction`

Run reconciliation pipeline on one or more postings.

**Request body**: `{ posting_ids: string[] }`

**Response**: `{ results: [{ posting, reconciliation: { status, best_match, alternatives } }] }`

Postings are returned with full `posting_view` data graph (account names, etc.) so the frontend can merge rows in-place.

---

### `POST /api/agent/erp/confirm-reconciliation`

Confirm a reconciliation suggestion — creates payment receipt if match is an invoice, links posting.

**Request body**: `{ posting_id: string }`

**Response**: Full posting in data_graph shape (for in-place row update in the frontend list)

---

## Misc

### `POST /api/agent/extract`

File upload + data extraction (invoice PDFs, images). Uses `AI.generateObject`.

**Request body**: multipart form data with file

---

### `POST /api/agent/process-email`

Email ingest + multi-file extraction.
