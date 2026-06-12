# Fabriq Agent — Shortfalls and Roadmap

**Audience**: Anyone deciding whether to build on top of a specific part of
the agent system, or wondering "is this intentional or a known gap?"

This doc is a snapshot, not a changelog — when an item here is resolved,
delete its entry rather than marking it "done" (git history is the record of
what changed and when).

---

## Deprecated Tools

**`queueAction`** and **`queueActionBatch`** (`tools/sessionTools.ts`) are
still exported and functional but are **not** added to any tool map by
`ToolManager` — no template or session can reach them. `queueActions` (plural,
merged) replaces both: it accepts `actions: [...]` with a minimum of one item,
so the single-action case is just a one-element array. See
[05-TOOLS.md — queueActions](./05-TOOLS.md#queueactions).

**Action**: Safe to delete once confirmed no external code imports them
directly (they predate the unified tool, used only by removed code paths).

---

## Reserved Session States

`agent_session.status` accepts `'paused'` and `'abandoned'` per the Prisma
schema comment, but **no code path ever sets either value** — no tool,
service, or timeout handler writes `status: 'paused'` or `status:
'abandoned'`. `awaiting_input` (set by `requestClarification`) is fully
implemented despite not appearing in the schema comment at all — the comment
is stale relative to the code.

**Action**: Either implement `paused` (e.g. a user-initiated "pause this
session" control, distinct from `awaiting_input`'s LLM-initiated pause) and
`abandoned` (e.g. auto-set by a future cleanup job for sessions stuck in
`awaiting_approval`/`awaiting_input` for >N days), or remove them from the
schema comment and this status enum to avoid implying they're reachable.

---

## In-Process Execution, No Crash Recovery

Auto-continuation (`setImmediate(() => agentService.handleRequest(...))`,
used by `completeStep`'s hybrid dispatcher Path B, `/clarify`, and
pending-action approval Path B — see
[06-BUILDERS_AND_EXECUTORS.md — Approval Flow](./06-BUILDERS_AND_EXECUTORS.md#approval-flow-end-to-end))
runs **in the same Node process** that handled the triggering HTTP request,
via `setImmediate`, not a job queue.

Consequences:
- If the process restarts/crashes between the `setImmediate` being scheduled
  and it running, the continuation is lost. The session stays in
  `executing`/`awaiting_approval` with no further progress until a user
  manually re-triggers it (e.g. by sending another chat message).
- Horizontal scaling: a continuation always runs on the instance that
  happened to handle the *triggering* request, not necessarily the instance
  that created the session — this is fine because all state is in Postgres,
  but it means continuation latency/failures aren't tied to "the instance the
  user is talking to" in any predictable way.
- No retry/backoff if `handleRequest()` throws inside a `setImmediate` —
  the error is logged (`logger.error('Clarification continuation failed', ...)`
  and similar) but nothing re-queues the work.

**Action**: A durable job queue (e.g. BullMQ/pg-boss) for continuations would
fix all three, at the cost of added infrastructure. Given session volume is
currently low, the "manually re-trigger" workaround (a user can always send
another message to nudge a stuck session) has been an acceptable trade-off so
far — but this is worth revisiting if session volume grows or if "agent runs
unattended overnight" becomes a real use case (it currently isn't, because of
this gap).

---

## Slack Integration — Functional but Unverified

`backend/src/agent/slack/` (`handle-app-mention.ts`, `handle-messages.ts`,
`routes.ts`, `slack-auth.ts`, `slack-utils.ts`) is mounted at `/api/slack` in
`index.ts` and appears feature-complete (Slack OAuth, mention handling,
message handling routed into `AgentService`). It is not covered by any test
in `__tests__/` and is not referenced by the narrative docs (01-07) — the
conversational entry points documented there are the HTTP/SSE endpoints in
[09-API_REFERENCE.md](./09-API_REFERENCE.md).

**Action**: If Slack is an active integration, it needs: (1) a test (at
minimum, that an inbound Slack event reaches `AgentService.handleRequest()`
with a correctly-scoped `AuthContext` — Slack workspace → org_id mapping is
the multi-tenancy-critical part), and (2) a doc section, likely as part of the
deferred `15-CONVERSATIONAL_CHAT.md`. If it's experimental/unused, note that
explicitly here or remove the mount.

---

## Placeholder Executors

`invoice_match`, `send_email`, and `escalate_collection` action types map to
`PlaceholderExecutor`
([06-BUILDERS_AND_EXECUTORS.md — Executor Registry](./06-BUILDERS_AND_EXECUTORS.md#executor-registry)),
which logs intent and returns `{ success: true }` without any real side
effect. An approved `send_email` pending action does **not** send an email.

**Action**: None required unless a template starts proposing these action
types to users — currently no seeded template's `allowed_tools`/prompt
references them, so they're unreachable in practice. If a template is added
that can produce these action types, implement the real executor first (see
[13-EXTENDING.md — Add a New Executor](./13-EXTENDING.md#recipe-add-a-new-executor))
or users will see "approved" actions silently do nothing.

---

## Migration Cleanup (Doc Restructure) — Remaining Items

The bulk of the doc restructure is done: `ARCHITECTURE.md`,
`SESSION_LIFECYCLE.md`, `PROMPT_SYSTEM.md`, `TOOLS_REFERENCE.md`,
`BUILDERS_EXECUTORS.md`, `DATA_MODELS.md`, `API_REFERENCE.md`,
`OBSERVABILITY.md`, `TESTING.md`, and `features/CATEGORIZATION.md`,
`RECONCILIATION.md`, `POSTING_DOMAIN.md` have been deleted (absorbed into
02-12, 01/06/07/08). `WORKBENCH_AGENT_LOOP.md`, `WORKBENCH_BACKEND.md`, and
`DOCS_REWRITE_PLAN.md` have been moved to `archive/` as superseded planning
and reference material.

Remaining:

- `docs/agent/MCP.md`, `docs/agent/CONVERSATION.md`,
  `docs/agent/README.md` — `CONVERSATION.md` will be absorbed by the deferred
  `15-CONVERSATIONAL_CHAT.md`; `MCP.md` and the old `README.md` can be
  archived or deleted once 15 lands and a new `README.md` index is written
- Top-level `docs/CLAUDE.md` and root `CLAUDE.md` — both link to non-existent
  `docs/agent/RECONCILIATION_TOOL.md`, `AI_Categorizer.md`,
  `END_USER_CONVERSATION_FLOW.md`; update both to point into this 01-14 set

---

## What's Next

This is the last doc in the 01-14 set. Second-pass work:

- **15-CONVERSATIONAL_CHAT.md** — in-app chat (history, `PageContext`, SDK,
  prompt selection), absorbing `CONVERSATION.md`
- New `README.md` — two-track index (narrative 01-07, reference 08-12, meta
  13-14) plus links to `debugging/SESSION_FAILURE_PATTERNS.md`
