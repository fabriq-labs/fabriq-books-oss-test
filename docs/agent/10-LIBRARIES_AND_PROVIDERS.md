# Fabriq Agent — Libraries and Providers

**Audience**: Anyone debugging an LLM call, switching providers/models, or
adding a new tool that needs a Zod schema.
**Primary files**: `backend/src/lib/ai/modelProvider.ts`, `AgentService.ts`,
`AgentTools.ts`, `handlers/erp/categorizeTransactionBatch.ts`

---

## Vercel AI SDK

The agent is built on the [Vercel AI SDK](https://sdk.vercel.ai/) (`ai@4.3.15`),
which provides a provider-agnostic interface for chat completions, tool
calling, and structured output. Three SDK functions are used:

| Function | Used for | Called from |
|---|---|---|
| `generateText` | Non-streaming agent turns (`/chat`, `/request`, session auto-continuations) | `AgentService.handleRequest()` (non-stream path) |
| `streamText` | Streaming agent turns (`/chat/stream`, conversational chat) | `AgentService.handleRequestStream()` |
| `generateObject` | Structured-output calls where the LLM must return a typed JSON shape, not free text | `categorizeTransactionBatchHandler` (LLM-fallback categorization) |

Both `generateText` and `streamText` are called with:
```typescript
{
  model: getModel('agent'),
  messages: allMessages,   // AI SDK message format — see 03-SESSION_LIFECYCLE.md
  tools,                    // from ToolManager.getUnifiedTools() — see 05-TOOLS.md
  maxSteps,                 // see "maxSteps" below
  onStepFinish: async ({ text, toolCalls, stepType }) => { /* emit SSE events */ },
}
```

`onStepFinish` is the hook that drives the SSE event system
([03-SESSION_LIFECYCLE.md — SSE Event System](./03-SESSION_LIFECYCLE.md#sse-event-system)):
each tool call inside a step emits a `tool_called` event before the SDK moves
to the next step.

### `maxSteps`

One "step" = one LLM completion, which may include zero or more tool calls
followed by the SDK automatically feeding tool results back for the next
step. `maxSteps` bounds how many of these round-trips a single
`generateText`/`streamText` call can make before returning.

| Context | `maxSteps` source | Default |
|---|---|---|
| Session turn (`sessionId` present) | `SESSION_MAX_STEPS` env | `20` |
| Conversational chat (no session) | `context.maxAgentSteps` → `AGENT_MAX_STEPS` env → `DEFAULT_MAX_STEPS` | `5` |

Sessions get a much higher budget because a single turn might call
`getAnalyticsContext`, `analyticsQuery` (possibly twice), `categorizePostings`,
and `queueActions` before reaching `completeStep` — each is one step.
Conversational chat questions are usually answerable in 1-2 tool calls.

---

## Zod

Tool `parameters` schemas are defined with [Zod](https://zod.dev/). The AI
SDK uses these schemas both to generate the JSON-schema description sent to
the LLM provider and to validate/parse the LLM's tool-call arguments before
`execute()` runs — a malformed tool call never reaches application code.

Three schema sources:

| Source | Used for |
|---|---|
| Inline `z.object({...})` in `AgentTools.ts` / `tools/sessionTools.ts` | Session tools (`createPlan`, `completeStep`, `queueActions`, `requestClarification`), analytics tools |
| `schema/SchemaGenerator.ts` | `createRecord` / `updateRecord` — generates a Zod schema per Prisma model from its field metadata (types, required-ness, enums) |
| `GenericFunctions.ts` | Shared parameter fragments reused across multiple tools (e.g. pagination, filters) |

Example — `categorizePostings`'s prediction shape and `queueActions`'s
`actions[]` array (see [05-TOOLS.md](./05-TOOLS.md)) are both Zod schemas;
when the LLM calls `queueActions` with a malformed `confidence` value (not
`high`/`medium`/`low`), the SDK rejects the call before
`tools/sessionTools.ts` ever sees it.

---

## Model Provider Abstraction

**File**: `backend/src/lib/ai/modelProvider.ts`

All LLM calls go through `getModel(task?)` / `getModelId(task?)` — there is
no direct provider SDK usage elsewhere in the agent. This is what lets the
same agent code run against Vertex AI (Gemini) in production and, say,
OpenAI or a local OpenAI-compatible endpoint in development.

### Resolution order

```
Provider:  LLM_PROVIDER                          (required, global)
Model:     LLM_MODEL_{TASK}  →  LLM_MODEL         (task-specific overrides global)
```

### Supported providers (`LLM_PROVIDER`)

| Value | Backing SDK | Required env vars |
|---|---|---|
| `vertex` | `@ai-sdk/google-vertex` | `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_LOCATION` (default `us-central1`), GCP credentials (ADC or `GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64`) |
| `openai` | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| `openrouter` | `@ai-sdk/openai` pointed at `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `custom` | `@ai-sdk/openai` pointed at `LLM_BASE_URL` | `LLM_BASE_URL`, `LLM_API_KEY` (optional — falls back to `'no-key'`) |

Provider instances are cached in a module-level `Map` keyed by
`${provider}:${LLM_BASE_URL}`, so repeated `getModel()` calls within the same
process reuse one client.

### GCP Credential Bootstrap

For `vertex`, `ensureGCPCredentials()` runs once per process: if
`GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64` is set (common in containerized
deployments where mounting a credentials file is awkward) and
`GOOGLE_APPLICATION_CREDENTIALS` is not, it decodes the base64 JSON, writes it
to a temp file, and points `GOOGLE_APPLICATION_CREDENTIALS` at it. The temp
file is cleaned up on process exit. See
[docs/RAILWAY_ARTIFACT_REGISTRY_VERTEX.md](../RAILWAY_ARTIFACT_REGISTRY_VERTEX.md)
for the deployment context this exists for.

### Tasks (`LLM_MODEL_{TASK}`)

| Task | Used by | Purpose |
|---|---|---|
| `agent` | `AgentService.handleRequest()` / `handleRequestStream()` | Multi-step agent chat with tool calling |
| `categorization` | `categorizeTransactionBatchHandler` (`generateObject`) | Structured-output transaction categorization (LLM fallback after historical-corpus matching — see [archive/CATEGORIZATION_V2.md](./archive/CATEGORIZATION_V2.md)) |
| `extraction` | Invoice/PDF extraction tools | Document extraction — may need a vision-capable model |
| `analysis` | Financial analysis tools | Structured JSON financial analysis |

Each task can override both provider-independent model choice via
`LLM_MODEL_{TASK}` (e.g. `LLM_MODEL_CATEGORIZATION=gpt-4o-mini` while
`LLM_MODEL=gemini-2.0-flash-001` for everything else) — but **not** the
provider; `LLM_PROVIDER` is global. To use a different provider per task, run
separate deployments/processes with different env configs.

### Failure Modes

`getModel(task)` throws synchronously (before any network call) if:
- `LLM_PROVIDER` is unset
- Neither `LLM_MODEL_{TASK}` nor `LLM_MODEL` is set

Both errors are descriptive (`"AI not configured. Set LLM_PROVIDER..."` /
`"LLM model not configured. Set LLM_MODEL_AGENT or LLM_MODEL..."`) and surface
directly in the `/chat` error response or `llm_trace.error_message` — see
[11-OBSERVABILITY.md](./11-OBSERVABILITY.md).

---

## What's Next

- **11-OBSERVABILITY.md** — `llm_trace`/`llm_trace_step`, which record
  `getModelId(task)`'s resolved value per call as `llm_model`
- **12-TESTING.md** — how tests stub/override `getModel()` to avoid live LLM
  calls
