# Agent architecture

A session is a goal, a plan, a mode, and a message log. The workbench (`frontend-0`, `/workbench`) creates a session and streams a turn. The agent proposes changes as pending actions. In supervised mode it does not call the direct write tools.

```
GoalSetter → POST /api/agent/sessions
          → POST /api/agent/chat/stream
          → AgentService
               DynamicPromptManager  (system prompt)
               ToolManager           (tools for this mode)
               streamText / generateText
          → agent_message, pending_action, llm_trace
```

| Piece | File | Role |
|---|---|---|
| Routes | `backend/src/agent/routes.ts` | Sessions, chat, pending actions, admin templates |
| AgentService | `backend/src/agent/AgentService.ts` | One turn: prompt, tools, model call, auto-continue |
| ToolManager | `backend/src/agent/ToolManager.ts` | Builds the tool set. Drops mutating tools in supervised mode |
| DynamicPromptManager | `backend/src/agent/prompt/DynamicPromptManager.ts` | Merges `prompt_template` rows |
| Pending actions | `pending_action` table, routes under `/api/agent/pending-actions` | Human review before a write |

Session tools (`createPlan`, `completeStep`, `queueActions`, `requestClarification`) drive the loop. Record tools (`searchRecords`, `createRecord`, `updateRecord`, and the child-item tools) go through the same metadata API as the screen. Analytics tools run in `backend/src/services/analytics/sqlExecutor.ts`, which allowlists tables and requires the caller org on tenant tables.

`agent_model_tool_config` has no `org_id`. It names which tools a model may use. Super Admin edits it under AI Templates. The table is unscoped. See [../tenancy.md](../tenancy.md).

The kernel decides whether a tool may run. It does not ship a domain executor.
