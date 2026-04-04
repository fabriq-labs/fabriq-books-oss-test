# Fabriq Agent Base Prompt for Agent Folder Development

## Key Files
- `AgentService.ts`: Orchestrates agent logic, request flow, and LLM interaction
- `AgentTools.ts`: Defines generic tools (functions) for the LLM, with enrichment for UI/LLM
- `ModelRegistry.ts`: Central model metadata, permissions, and business context
- `GenericFunctions.ts`: Zod schemas for generic CRUD/search tools
- `FunctionExecutor.ts`: Backend execution of CRUD/workflow actions
- `model-registry.json`: Business metadata for models
- `PrismaSchemaParser.ts`: Parses Prisma schema for model/field info

## Architecture & Flow
- All tools are generic (CRUD/search/identify) and model-agnostic; model info is injected at runtime via ModelRegistry
- User requests flow through AgentService, which builds a system prompt, exposes tools, and calls the LLM via Vercel AI SDK (`generateText`, `maxSteps=2`)
- LLM chooses a tool, which is executed via AgentTools/ModelService
- Tool results are enriched with metadata (`columns`, `actions`, `uiHint`, etc.) for both LLM and UI consumption
- The UI interprets these hints to render tables, cards, links, etc.

## Vercel AI SDK
- Used for LLM interaction and multi-step tool calling
- See [Vercel AI SDK docs](https://ai-sdk.dev/docs/ai-sdk-ui/overview)

## Reference
- For a high-level overview, see [`slides.md`](./slides.md) in this folder

---
Use this context as a base for any feature or code change in the agent folder. 