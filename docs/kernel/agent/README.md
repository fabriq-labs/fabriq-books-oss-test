# Agent runtime

The agent is part of the kernel. It runs sessions, calls tools, assembles prompts, and queues pending actions. Supervised mode removes direct writes. A domain may register an executor later. This tree does not document one.

Code is `backend/src/agent/`. The shell page is `/workbench` in `frontend-0`.

| Doc | What it covers |
|---|---|
| [02-ARCHITECTURE.md](./02-ARCHITECTURE.md) | AgentService, ToolManager, prompts, pending actions |
| [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md) | Session states and turns |
| [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md) | How the system prompt is assembled |
| [05-TOOLS.md](./05-TOOLS.md) | Tool catalog and supervised mode |
| [08-DATA_MODELS.md](./08-DATA_MODELS.md) | `agent_session`, `agent_message`, `pending_action`, traces |
| [09-API_REFERENCE.md](./09-API_REFERENCE.md) | `/api/agent` routes |
| [10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md) | Vercel AI SDK and model providers |
| [11-OBSERVABILITY.md](./11-OBSERVABILITY.md) | `llm_trace` |
| [MCP.md](./MCP.md) | Separate MCP server. Work in progress. |

A session's `org_id` is the caller org. `AgentService.handleRequest` rejects a session whose org is not the caller's. Pending-action reads and updates use the same org. `chat_thread` is private: caller org only. It stores the in-app chat transcript.

`/api/agent/admin/*` requires a platform admin. See [../auth.md](../auth.md).
