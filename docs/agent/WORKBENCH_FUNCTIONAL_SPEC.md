# Fabriq Workbench — Functional Specification

**Version**: 1.2
**Date**: 2026-03-30
**Status**: Phases 1–3 complete. Phase 4 (polish) not started.

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Agent Templates](#2-agent-templates)
3. [Session Lifecycle & Live Events (SSE)](#3-session-lifecycle--live-events-sse)
4. [Workbench Layout](#4-workbench-layout)
5. [Global Action Inbox](#5-global-action-inbox)
6. [Action Type Registry](#6-action-type-registry)
7. [Navigation & Routing](#7-navigation--routing)
8. [Out of Scope](#8-out-of-scope)

---

## 1. Overview & Goals

### What is the Workbench?

The Fabriq Workbench is the place where AI agents do financial work on your behalf.

You give the agent a goal — "Reconcile last month's HDFC transactions" or "Categorise uncategorised expenses for the Checking Account" — and the agent goes to work in the background. It queries your data, applies financial logic, and either produces a report or prepares a set of actions for you to review and approve.

You do not need to stay on the screen while it works. You can set a goal, close the browser, come back an hour later, and find the agent's work ready for your review. If the agent needs your approval before making any changes to your books, it waits — nothing is written to your financial records without your sign-off.

### The Core Idea: A Financial Assistant That Works in the Background

Think of it like giving a task to a skilled finance team member:

- You tell them what to do and how much latitude they have
- They go away and do the work
- They come back with either a completed report or a set of proposed actions for you to approve
- You review, approve or reject, and the changes are made

The Workbench is the screen where all of this happens.

### What the Workbench is NOT

- It is **not a chat interface**. You do not have a back-and-forth conversation with the agent while it is running. You give it a goal, it works, and it reports back.
- It is **not a real-time system that requires your presence**. The agent runs as a background process. Your browser can be closed.
- It is **not autonomous by default**. In the default mode (Supervised), the agent always asks for your approval before writing anything to your books. You are always in control.

> **Known limitation (v1)**: If the agent needs to ask a clarifying question mid-run (e.g. multiple accounts match the user's description), it currently completes the step with that message and the session stalls. The agent is designed to work around this by using broad keyword search and processing all matching accounts — but it is not yet a guaranteed recovery path. A proper `waiting_for_input` session state with a reply mechanism is planned but out of scope for this phase.

### The Three Modes

Every agent session runs in one of three modes. You choose the mode when you start the session.

| Mode | What it means |
|------|--------------|
| **Supervised** | The agent prepares all proposed actions and waits for your review before doing anything. You approve or reject each one. This is the default and the safest mode. |
| **Semi-Auto** | The agent automatically approves actions it is highly confident about (e.g. exact matches) and brings only the uncertain ones to you for review. |
| **Autonomous** | The agent executes everything it determines is correct without waiting for approval. Use only for low-risk, well-understood tasks. |

### What You Can Do in the Workbench

1. **Start a new agent session** by picking an agent type and describing your specific goal
2. **Watch the agent work** through a live activity feed showing each step as it happens
3. **Switch between sessions** — multiple agents can run at the same time
4. **Review and approve pending actions** — the full queue of actions waiting for your sign-off, across all sessions
5. **See completed results** — reports, analysis, and a summary of what was done
6. **Come back to unfinished work** — the workbench remembers everything, including sessions from previous days

---

## 2. Agent Templates

### The Problem with Free-Form Goals

If a user types "reconcile my bank transactions", the agent has to figure out from scratch: which accounts, which rules, what counts as a match, what to do with unmatched items. This produces inconsistent, often incomplete results.

Agent Templates solve this by giving the agent a pre-written expert brief for common financial tasks — the agent knows exactly what it is doing, and the user only needs to supply the specifics.

### What a Template Is

A template is a pre-defined agent configuration that includes:

- A **name** and **description** visible to the user (e.g. "Reconcile Transactions")
- An **expert system prompt** (invisible to the user) that tells the agent precisely how to approach the task — what steps to follow, what rules to apply, what to do in edge cases
- A **default model context** — which part of the financial data is most relevant (e.g. bank postings, invoices)
- A **default mode** — what level of autonomy makes sense for this task type
- A **user hint** — a short prompt shown in the UI to help the user provide the right specifics ("Which account or date range? e.g. HDFC account, March 2024")

### System-Level vs Org-Level Templates

- **System-level templates** are built into the product and available to all organisations. These cover the standard financial tasks: reconciliation, expense categorisation, spending analysis.
- **Org-level templates** can be created by an admin for that organisation — customised for their specific chart of accounts, rules, or workflows.

### Account Name Resilience

Template prompts are written to handle approximate account names from the user. If the user says "HDFC checking" but the actual account is "Checking Account", the agent:
1. Tries a broad keyword search using `ILIKE` on each word
2. Falls back to listing all asset/bank accounts if no match
3. Processes all matching accounts rather than stopping to ask

This is enforced in the system prompt of every template.

### The "Custom" Option

A "Custom" option is always available for free-form goals. This is equivalent to no template — the agent works from the user's description alone.

### Currently Seeded Templates

| ID | Name | goal_model | default_mode | Status |
|----|------|-----------|--------------|--------|
| `atpl_book_transactions` | Book Transactions | posting | supervised | ✅ Seeded, tested |
| `atpl_reconcile` | Reconcile Transactions | posting | supervised | ✅ Seeded |
| `atpl_spending_analysis` | Analyse Spending | posting | autonomous | ✅ Seeded |
| `atpl_categorise` | Categorise Expenses | posting | supervised | ✅ Seeded, tested |
| `atpl_custom` | Custom | — | supervised | ✅ Seeded |

Templates are seeded via `backend/prisma/seed-agent-templates.sql`. Apply with:
```bash
psql $DATABASE_URL < backend/prisma/seed-agent-templates.sql
```

### How It Works in the Backend

When a session is created with a template:

1. The template's `system_prompt` is loaded from the database on each agent call
2. It is prepended to the base agent system prompt: `template.system_prompt + "\n\n---\n\n" + basePrompt`
3. The session `goal_model` defaults to the template's setting
4. The merged prompt is NOT stored — the template is always loaded fresh, so updates take effect immediately

---

## 3. Session Lifecycle & Live Events (SSE)

### Session States

An agent session moves through a defined set of states:

```
planning → executing → awaiting_approval → executing → ... → completed
                                                          ↘ failed
```

| State | What it means |
|-------|--------------|
| `planning` | The agent has received the goal and is creating its step-by-step plan |
| `executing` | The agent is actively running a step (querying data, analysing, building actions) |
| `awaiting_approval` | The agent has created actions and is waiting for the user to review them |
| `completed` | All steps are done and all actions are resolved |
| `failed` | An error occurred that the agent could not recover from |

### How the Agent Runs (Background Process)

1. User submits a goal in GoalSetter → session created (`planning`)
2. GoalSetter navigates to `/workbench/:sessionId`
3. `SessionView` mounts, detects `status=planning` with no plan → fires POST to streaming endpoint
4. Agent creates plan, session moves to `executing`
5. Agent runs steps server-side via `setImmediate` auto-continuation — no browser required
6. When agent creates pending actions, session moves to `awaiting_approval`
7. User approves/rejects actions in `AwaitingApprovalView` or the Global Inbox
8. When all actions are resolved, server resumes the agent or marks session `completed`

**The browser does not need to be open for the agent to run.** Navigation away is safe — returning to `/workbench/:sessionId` re-loads current state from the backend and reconnects SSE.

### The Hybrid Dispatcher

Not every plan step requires an LLM call. When `completeStep` is called, a built-in dispatcher checks the next steps:

- **Deterministic action step** (builder registered in `ActionBuilderRegistry`): runs the builder synchronously, creates pending actions, transitions to `awaiting_approval` — no LLM round-trip
- **Deterministic report step** (formatter registered in `ReportFormatterRegistry`): generates the report text, marks session `completed` — no LLM round-trip
- **Other steps**: breaks out of the dispatcher, the LLM handles the next step via auto-continuation

Currently registered builders/formatters:

| Type | Trigger | Builder/Formatter |
|------|---------|-------------------|
| `action` | `match_results` present in `accumulated_context` | `ReconciliationActionBuilder` — creates `reconcile_posting` actions |
| `report` | posting model + plan has action step | `ReconciliationReportFormatter` |

The categorise expenses flow intentionally does NOT use a builder — the agent calls `categorizePostings` and `queueActionBatch` itself.

### Live Events via Server-Sent Events (SSE)

When the user's browser is open and viewing a session, it connects to a live event stream.

- Browser opens `GET /api/agent/sessions/:id/events` (via `useSessionEvents` hook with auth header)
- Server pushes a `snapshot` immediately (full session state + trace)
- Events stream in real time as the agent works
- 30-second heartbeat keeps the connection alive through proxies
- On reconnect, snapshot replays current state so the UI is caught up
- `SessionView` also polls every 5 seconds while `planning`/`executing` as a fallback

**SSE wire format**: All events are sent as `data: {JSON}\n\n`. The JSON envelope has shape:
```json
{ "id": "evt_abc123", "type": "session_status_changed", "sessionId": "...", "orgId": "...", "timestamp": "...", "data": { ... } }
```
The `event:` SSE protocol field is NOT used — event type is always embedded in the JSON body.

**Events:**

| Event | When it fires | Key data |
|-------|--------------|----------|
| `snapshot` | Immediately on connect | `{ session, trace }` |
| `step_started` | Agent begins a plan step | `step_index`, `title`, `type` |
| `step_completed` | Agent finishes a step | `step_index`, `result_preview` |
| `tool_called` | Agent calls a tool | `tool_name`, `step_index`, `args_preview` |
| `action_queued` | Pending action created | `action_id`, `action_type`, `title`, `confidence` |
| `session_status_changed` | Session state changes | `status` |
| `inbox_count_changed` | Any pending action created/resolved | (org-level) |
| `heartbeat` | Every 30 seconds | — |

---

## 4. Workbench Layout

### Overall Structure (Implemented)

Two-column layout: fixed left sidebar (240px) + main area rendered via React Router `<Outlet>`.

```
┌── Left Sidebar (240px) ─────────┬── Main Area (Outlet) ───────────────────┐
│                                  │                                          │
│  [+ New Session]   [Inbox 🔴]   │  /workbench        → GoalSetter         │
│  ─────────────────────────────   │  /workbench/inbox  → InboxPage          │
│  Sessions                        │  /workbench/:id    → SessionView        │
│   ● HDFC Reconciliation ⟳       │                                          │
│     Step 2 of 4                  │                                          │
│   ⏸ Expense Categorisation       │                                          │
│     14 actions pending           │                                          │
│   ✓ Q1 Spending Analysis         │                                          │
│     Completed 2h ago             │                                          │
└──────────────────────────────────┴──────────────────────────────────────────┘
```

The sidebar shows session `name` (auto-generated) or truncated goal. Inbox button has pending-action badge (sum across all sessions). There is no ConversationPanel — the agent loop is driven entirely by SSE.

### Main Area — State-Aware Content

| Route / State | Component shown |
|---------------|----------------|
| `/workbench` (no session) | `GoalSetter` — template card grid → goal input |
| `/workbench/inbox` | `InboxPage` — paginated pending actions across all sessions |
| `/workbench/:sessionId` — `planning` | Spinner: "Agent is creating a plan…" |
| `/workbench/:sessionId` — `executing` | `ExecutingView` — live activity feed |
| `/workbench/:sessionId` — `awaiting_approval` | `AwaitingApprovalView` — inline approve/reject |
| `/workbench/:sessionId` — `completed` | `CompletedView` — plan summary + lazy trace |
| `/workbench/:sessionId` — `failed` | Error message |

### SessionHeader

Shows session name (or goal), mode badge, and a step progress bar:
```
● Fetch account ✓ ──── ● Categorise ⟳ ──── ○ Report
```

Each dot: green check (completed), amber spinner (current), gray circle (pending). Connecting lines turn green when the preceding step completes.

### GoalSetter v2

Two screens:
1. **Template grid** — cards loaded from `GET /api/agent/templates` with icon, name, description
2. **Goal input** — shown after selecting a template; uses template's `user_hint` as input placeholder; mode dropdown (Supervised / Semi-Auto / Autonomous)

Custom option allows free-form goals with no template.

---

## 5. Global Action Inbox

### Purpose

A global queue of all pending actions across all sessions. The primary place for the finance team to process agent-proposed changes.

### Access Points

1. **Inbox button** in the sidebar — badge shows total unresolved count (sum of `pending_actions_count` across all sessions)
2. **Session view** (`awaiting_approval`) — links to inbox; also shows inline approve/reject for the current session's actions

### The Inbox Table (Implemented)

| Column | Description |
|--------|-------------|
| Checkbox | Multi-select for bulk operations |
| Type | Action type badge (Categorise, Book, Reconcile, etc.) from registry |
| Description | Primary + secondary text from `renderRowSummary` |
| Amount | Formatted currency amount (if in payload) |
| Confidence | High / Medium / Low with colour coding |
| Age | Relative time |
| Status | Pending / Approved / Executed / Rejected |

### Filters (in-page, not URL-synced)

- Type (all / Categorise / Book / Reconcile)
- Confidence (all / High / Medium / Low)
- Status (default: Pending; all / Approved / Executed / Rejected)

### Bulk Operations (Implemented)

| Operation | How triggered |
|-----------|--------------|
| Approve selected | Select rows → "Approve selected (N)" |
| Reject selected | Select rows → "Reject selected (N)" |
| Approve high-confidence | "Approve N high-confidence" button always visible when applicable — no selection needed |

Defer is not implemented.

### Action Detail Drawer

Clicking a row opens a right-side drawer (420px):
- Header: type badge + action title
- Body: `DetailComponent` from action type registry (scrollable)
- Footer: Approve + Reject buttons (pending only); resolved banner for already-processed actions
- URL updates to `/workbench/inbox/:actionId` on open, `/workbench/inbox` on close
- Close via backdrop click, Escape key, or X button

### Paginated Backend Endpoint

`GET /api/agent/pending-actions/paginated` — supports:
- `page`, `pageSize` (default 25)
- `session_id`, `action_type`, `confidence`, `status` filters
- Returns `{ items, total, page, pageSize, totalPages }`

---

## 6. Action Type Registry

### Frontend Registry (`frontend-1/src/components/workbench/actions/registry.ts`)

Each entry:
- `label` — display name for badges
- `icon` — Lucide icon component
- `badgeClass` — Tailwind classes for the type badge
- `renderRowSummary(action)` — returns `{ primary, secondary?, amount? }` for table rows and approval lists
- `DetailComponent` — React component shown in the drawer body

Fallback for unknown types: shows title + raw JSON payload.

### Action Type Status

| Type | Label | Backend executor | Row summary | Detail component |
|------|-------|-----------------|-------------|-----------------|
| `categorize_transaction` | Categorise | ✅ `CategorizeTransactionExecutor` | Description + amount + `→ predicted account` | ✅ Full (transaction card + prediction card with confidence bar + reasoning) |
| `create_posting` | Book | ✅ `CreatePostingExecutor` | Description + amount + account | Generic JSON fallback |
| `reconcile_posting` | Reconcile | ✅ `ReconcilePostingExecutor` | Title | Generic JSON fallback |
| `invoice_match` | Invoice Match | Placeholder | Generic | Generic |
| `send_email` | Email | Placeholder | Generic | Generic |

### `CategorizeTransactionDetail` Component

Two cards:
1. **Transaction** — description, formatted date, amount
2. **AI Prediction** — predicted account name, confidence bar (visual width indicates level), score percentage, reasoning text from the model

No editing — approve/reject only.

### How Executors Work

When a pending action is approved:
1. `PendingActionService.resolvePendingAction` checks if an executor exists for the action type
2. If yes, calls `PendingActionExecutor.execute(action, auth)`
3. The executor performs the side effect (DB write, API call, etc.)
4. Action status updates to `executed` on success
5. After all pending actions for a session are resolved, checks whether to resume the agent or complete the session

---

## 7. Navigation & Routing

### Current Routes

| Route | Component | Notes |
|-------|-----------|-------|
| `/workbench` | `GoalSetter` | index route inside WorkbenchPage |
| `/workbench/inbox` | `InboxPage` | must be before `:sessionId` |
| `/workbench/inbox/:actionId` | `InboxPage` (drawer open) | same component, reads `actionId` from params |
| `/workbench/:sessionId` | `SessionView` | loads session from backend on mount |

### Session Persistence Across Navigation

When a user navigates away from `/workbench/:sessionId` to another page and returns:
- `SessionView` fetches fresh session state from the backend on mount
- SSE connection reconnects and receives a new snapshot
- Agent may have advanced several steps — the UI reflects current state
- The 5-second fallback poll ensures state is always fresh even if SSE drops

---

## 8. Out of Scope

| Feature | Status |
|---------|--------|
| Agent clarification / `waiting_for_input` state | Not implemented. Agent uses broad search to avoid needing clarification. |
| Job queue / worker processes | Agent runs in-process with `setImmediate`. BullMQ planned separately. |
| Real-time collaborative review | Not handled. |
| Agent scheduling | Not implemented. |
| Custom org templates via UI | Templates seeded via SQL only. |
| Notifications (email/Slack) | Not implemented. |
| `create_posting` detail component | Generic JSON fallback used. Full UI deferred. |
| `reconcile_posting` detail component | Generic JSON fallback used. Full UI deferred. |
| Edit-on-approve for any action type | Not implemented — approve/reject only. |
| Inbox filter URL sync | In-page state only. URL sync deferred. |
| Defer action | Not implemented. |
| Inbox count real-time via `inbox_count_changed` SSE | Sidebar count uses 60s poll. Real-time update deferred. |
| Delete old components (ConversationPanel, etc.) | Still in codebase, no longer routed. Cleanup deferred. |

---

*End of document.*
