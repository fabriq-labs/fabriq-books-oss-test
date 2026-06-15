# Fabriq Agent — Documentation Index

This directory documents the Fabriq agent system: workbench sessions, the
conversational chat panel, and the shared prompt/tool/model infrastructure
behind both. All documents reflect code in `backend/src/agent/` and
`frontend-1/src/components/chat/` unless noted otherwise.

The docs are organized in three tracks:

- **Narrative (01-07, 15)** — read in order for a conceptual understanding of
  the system, from motivation through worked examples to the chat UI.
- **Reference (08-12)** — look up data models, API endpoints, library usage,
  observability, and testing as needed.
- **Meta (13-14)** — extending the system and known gaps.

---

## Narrative Track

| Doc | Covers |
|---|---|
| [01-OVERVIEW.md](./01-OVERVIEW.md) | Why an agent layer exists, bookkeeping domain primer (postings, contra-accounts, money direction), multi-tenancy |
| [02-ARCHITECTURE.md](./02-ARCHITECTURE.md) | Components and file map: `AgentService`, `ToolManager`, `DynamicPromptManager`, builders/executors |
| [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md) | Session states, auto-continuation, `requestClarification`/`awaiting_input`, completion paths |
| [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md) | Prompt assembly layers, `DynamicPromptManager`, template merging, question routing for chat |
| [05-TOOLS.md](./05-TOOLS.md) | Every agent tool: parameters, returns, side effects, tool-selection rules |
| [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md) | `ActionBuilderRegistry`, `ReportFormatterRegistry`, `PendingActionExecutor`, hybrid dispatcher |
| [07-WORKED_EXAMPLES.md](./07-WORKED_EXAMPLES.md) | End-to-end traces: categorization, reconciliation, write-off |
| [15-CONVERSATIONAL_CHAT.md](./15-CONVERSATIONAL_CHAT.md) | The chat panel: `useChat`, `PageContext`, in-memory history, UI placement |

## Reference Track

| Doc | Covers |
|---|---|
| [08-DATA_MODELS.md](./08-DATA_MODELS.md) | `agent_session`, `agent_message`, `pending_action`, `llm_trace`, multi-tenancy rules |
| [09-API_REFERENCE.md](./09-API_REFERENCE.md) | Every agent HTTP endpoint, request/response shapes |
| [10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md) | Vercel AI SDK usage, Zod schemas, model provider abstraction, `maxSteps` |
| [11-OBSERVABILITY.md](./11-OBSERVABILITY.md) | `llm_trace`, `ai_activity_log`, session trace, prompt improvement workflow |
| [12-TESTING.md](./12-TESTING.md) | Running tests, prompt harness, E2E session test pattern |

## Meta Track

| Doc | Covers |
|---|---|
| [13-EXTENDING.md](./13-EXTENDING.md) | Recipes for adding a tool, ERP handler, action builder, executor, report formatter |
| [14-SHORTFALLS_AND_ROADMAP.md](./14-SHORTFALLS_AND_ROADMAP.md) | Known gaps, deprecated tools, untested paths, doc-restructure status |

## Debugging

| Doc | Covers |
|---|---|
| [debugging/SESSION_FAILURE_PATTERNS.md](./debugging/SESSION_FAILURE_PATTERNS.md) | Pattern index with diagnostic SQL for stuck/failed sessions |

## Adjacent Subsystem (Not Part of the Track Above)

| Doc | Covers |
|---|---|
| [MCP.md](./MCP.md) | Fabriq's MCP server (`/api/mcp`) — lets external AI clients (Cursor, Claude Desktop) call Fabriq tools directly. Separate from, and unrelated to, the agent session/chat system above. Status: Work in Progress. |
| [../CHAT_THREADS.md](../CHAT_THREADS.md) | Persistent chat thread UI (`chat_thread` table, `ChatShell`, thread sidebar). Summarized in [15-CONVERSATIONAL_CHAT.md — Thread Persistence](./15-CONVERSATIONAL_CHAT.md#thread-persistence-chat_thread); this doc has the full architecture diagram and manual test checklist. |

---

## Recommended Reading Order

### New to the agent system? Start here:
1. [01-OVERVIEW.md](./01-OVERVIEW.md) — motivation and domain primer
2. [02-ARCHITECTURE.md](./02-ARCHITECTURE.md) — components and data flow
3. [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md) — how a session executes
4. [07-WORKED_EXAMPLES.md](./07-WORKED_EXAMPLES.md) — concrete end-to-end traces

### Adding a new feature:
1. [02-ARCHITECTURE.md](./02-ARCHITECTURE.md) — file map to find the right extension point
2. [05-TOOLS.md](./05-TOOLS.md) — existing tools and selection rules
3. [13-EXTENDING.md](./13-EXTENDING.md) — recipes for tools/builders/executors/formatters
4. [12-TESTING.md](./12-TESTING.md) — how to test the feature

### Debugging a session failure:
1. [debugging/SESSION_FAILURE_PATTERNS.md](./debugging/SESSION_FAILURE_PATTERNS.md) — pattern index with diagnostic SQL
2. [11-OBSERVABILITY.md](./11-OBSERVABILITY.md) — reading LLM traces
3. [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md) — what state the session should be in

### Working on prompts:
1. [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md) — how prompts are assembled, including chat question routing
2. [12-TESTING.md](./12-TESTING.md) — how to run the prompt test harness

### Working on the chat panel:
1. [15-CONVERSATIONAL_CHAT.md](./15-CONVERSATIONAL_CHAT.md) — `useChat`, `PageContext`, history, UI placement
2. [04-PROMPT_SYSTEM.md — Question Routing](./04-PROMPT_SYSTEM.md#question-routing-conversational-chat) and [05-TOOLS.md](./05-TOOLS.md) — how page context drives prompt/tool selection

---

## Agent Templates (currently seeded)

| ID | Name | goal_model | Mode |
|----|------|-----------|------|
| `atpl_book_transactions` | Book Transactions | posting | supervised |
| `atpl_reconcile` | Reconcile Transactions | posting | supervised |
| `atpl_spending_analysis` | Analyse Spending | posting | autonomous |
| `atpl_categorise` | Categorise Expenses | posting | supervised |
| `atpl_custom` | Custom | — | supervised |

Templates are seeded via `backend/prisma/seed-agent-templates.sql`.

---

## Archive

`docs/agent/archive/` holds superseded reference docs, implementation plans,
and feature specs kept for historical context — see files within for status
notes. They are not part of the reading order above.
