# Libraries and providers

The agent calls the Vercel AI SDK through `backend/src/lib/ai/modelProvider.ts`. `getModel` picks the provider from configuration. The call sites are in `AgentService`.

| SDK function | Used for |
|---|---|
| `generateText` | A non-streaming turn |
| `streamText` | `/api/agent/chat/stream` and other streamed turns |

Both receive `model`, `messages`, `tools` from `ToolManager`, and `maxSteps`. `onStepFinish` records the step and emits SSE. One step is one model completion and the tool calls inside it. `maxSteps` caps how many of those completions a single turn may run.

Tool parameter schemas are Zod objects next to the tool definitions in `backend/src/agent/tools/` and `AgentTools.ts`.

`llm_trace` stores the model id, token counts, and, when the provider reports them, cache token counts and `cost_usd`. See [11-OBSERVABILITY.md](./11-OBSERVABILITY.md).
