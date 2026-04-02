# Session: Agentic Features — Workbench (Sessions, SSE & Approvals)

**Duration**: 2–3 hours  
**Objective**: Understand the Fabriq **Workbench** — background agent sessions, live activity via SSE, agent templates, pending actions, and how backend pieces connect to the frontend routes under `/workbench`.

**Prerequisites**:

- [ ] [Agentic basics workbook](./ONBOARDING_SESSION_AGENTIC_BASICS_WORKBOOK.md) completed or skimmed
- [ ] Frontend runs (`cd frontend-1 && npm run dev`, port 5173)

**Canonical specs (read for detail)**:

- [docs/WORKBENCH_FUNCTIONAL_SPEC.md](../WORKBENCH_FUNCTIONAL_SPEC.md) — product behaviour, modes, layout, inbox
- [docs/WORKBENCH_IMPLEMENTATION_PLAN.md](../WORKBENCH_IMPLEMENTATION_PLAN.md) — phases, file locations, test commands

---

## 1. What the Workbench is (and is not)

From the functional spec:

- **Is**: A place to give the agent a **goal**, let it run **in the background**, then **review and approve** proposed changes to the books (default: **Supervised** mode).
- **Is not**: A synchronous chat UI; the browser can be closed while the agent runs.

Three **modes**: Supervised (all writes need approval), Semi-Auto (high-confidence auto-approved), Autonomous (execute without waiting — use with care).

---

## 2. Data model essentials

| Concept | Storage / notes |
|---------|------------------|
| **Agent templates** | `agent_template` — system prompts, `goal_model`, `default_mode`, `user_hint`; seeded via `backend/prisma/seed-agent-templates.sql` |
| **Agent session** | `agent_session` — links to `template_id`, has `goal_model`, `name` (auto-generated), `status`, plan JSON, etc. |
| **Pending actions** | Queued proposals (`queueAction` / `queueActionBatch`); resolved by user approve/reject → **executors** apply real writes |

Template text is **merged at request time** (not stored merged): `template.system_prompt + "\n\n---\n\n" + basePrompt` in `AgentService`.

---

## 3. Session lifecycle (states)

Typical flow:

```
planning → executing → awaiting_approval → executing → … → completed
                                              ↘ failed
```

| State | Meaning |
|-------|---------|
| `planning` | Agent forming a plan |
| `executing` | Running steps (tools, LLM) |
| `awaiting_approval` | Pending actions need human decision |
| `completed` | Done; deterministic report path may skip extra LLM |
| `failed` | Unrecoverable error |

**Background execution**: After the user submits a goal, the UI creates a session and triggers streaming; the server continues with **`setImmediate`**-style continuation — no open tab required.

---

## 4. Live updates: SSE and `SessionEventBus`

- **Bus**: `backend/src/agent/services/SessionEventBus.ts` — in-process events (per session / org).
- **HTTP**: `GET /api/agent/sessions/:id/events` — sends an initial **`snapshot`**, then JSON events (`data: {json}\n\n`), heartbeat ~30s.
- **Emitters** include `AgentService` (e.g. `step_started`, `tool_completed`, `tool_called`), session updates, and queue tools (`action_queued`, `inbox_count_changed`).

Frontend: `useSessionEvents` (`frontend-1/src/hooks/useSessionEvents.ts`) with reconnect backoff.

**Exercise**: Open `routes.ts`, find the SSE handler, and confirm it subscribes to `sessionEventBus`.

---

## 5. Hybrid dispatcher (deterministic vs LLM steps)

When a plan step completes via `completeStep`, the server can:

- Run a **registered action builder** synchronously (e.g. reconciliation actions from accumulated context) — **no LLM round-trip**.
- Run a **registered report formatter** for a deterministic completion.
- Otherwise **fall back to the LLM** for the next step.

Example from the implementation plan: **`ReconciliationActionBuilder`** triggers when `accumulated_context.match_results` is present; the **categorise** flow intentionally uses the LLM + `categorizePostings` + `queueActionBatch` instead of a builder.

**Gotcha (documented in implementation plan)**: `ActionBuilderRegistry` matchers must be precise — a overly broad `matches` once caused the reconciliation builder to steal categorise steps. The fix passes **`accumulated_context`** into `matches` so reconciliation only runs when `match_results` exists.

---

## 6. Pending actions → executors

Flow:

1. Tool enqueues an action with a **type** (e.g. `categorize_transaction`, `create_posting`, `reconcile_posting`).
2. User approves in **Session** view or **Global Inbox** (`/workbench/inbox`).
3. `PendingActionService.resolvePendingAction` runs the **executor** if registered (`backend/src/agent/executors/PendingActionExecutor.ts`).
4. When **all** pending actions for the session are resolved, logic decides: emit completion, resume agent (`shouldAutoContinue`), or finish with a deterministic report.

**Frontend registry**: `frontend-1/src/components/workbench/actions/registry.ts` — labels, row summaries, detail drawers per action type.

---

## 7. UI routes (mental map)

| Route | Purpose |
|-------|---------|
| `/workbench` | GoalSetter — template grid + goal + mode |
| `/workbench/:sessionId` | SessionView — state-specific (executing, awaiting approval, completed, …) |
| `/workbench/inbox` | Global inbox — paginated pending actions |
| `/workbench/inbox/:actionId` | Same page with drawer open |

Sidebar lists sessions with **auto-generated `name`** (from `AgentService` when `createPlan` is detected — see implementation plan §1.3).

---

## 8. API touchpoints (developer checklist)

- [ ] `POST /api/agent/sessions` — create session (with `templateId`, `goal`, mode, `goalModel`)
- [ ] Chat/stream endpoints used to start or continue the agent (see `routes.ts`)
- [ ] `GET /api/agent/templates` — GoalSetter template cards
- [ ] `GET /api/agent/pending-actions/paginated` — inbox table
- [ ] `GET /api/agent/sessions/:id/events` — SSE

---

## 9. Phase status & known gaps

The **implementation plan** is the source of truth for phase completion. As of spec v1.2, Phases 1–3 are largely complete; Phase 4 lists polish items (e.g. real-time inbox badge via SSE, cleanup of legacy components).

**Out of scope / limitations** (from functional spec): e.g. `waiting_for_input` mid-run, job queue workers, org template UI — read §8 of [WORKBENCH_FUNCTIONAL_SPEC.md](../WORKBENCH_FUNCTIONAL_SPEC.md).

---

## 10. Hands-on exercises

1. **Seed templates** (if not already):  
   `psql $DATABASE_URL < backend/prisma/seed-agent-templates.sql`

2. **Trace session creation**: From `GoalSetter` submit → `createSession` in frontend → backend route → DB row.

3. **Watch SSE**: Open DevTools → Network → `events` → confirm `snapshot` then streamed events during a run.

4. **Approve one action**: From inbox or session view; trace `resolvePendingAction` in the backend.

5. **Run E2E** (optional, requires LLM + DB):  
   See Phase 1 test table in [WORKBENCH_IMPLEMENTATION_PLAN.md](../WORKBENCH_IMPLEMENTATION_PLAN.md) (`v2-create-posting-e2e.test.ts`, `v2-categorise-expenses-e2e.test.ts`).

---

## 11. Relationship to “basics” session

- **Basics** workbook: `ToolManager`, `ModelService`, `advancedSqlQuery`, `categorizePostings`.
- **This** workbook: how those tools sit inside **long-running sessions**, **approval**, and **UI** — same backend `AgentService`, different product surface (`/workbench`).

---

**Back to**: [Agentic basics workbook](./ONBOARDING_SESSION_AGENTIC_BASICS_WORKBOOK.md)
