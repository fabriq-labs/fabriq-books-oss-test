# Fabriq Agent — Documentation Index

**Last Updated**: 2026-04-04

This directory documents the Workbench agent subsystem. All documents reflect code in `backend/src/agent/`.

---

## Quick-Reference: Concept → Doc → Code File

| Concept / Task | Document | Primary Code File |
|---|---|---|
| System overview, component diagram | [ARCHITECTURE.md](./ARCHITECTURE.md) | `AgentService.ts`, `routes.ts` |
| Session states, auto-continuation, completion | [SESSION_LIFECYCLE.md](./SESSION_LIFECYCLE.md) | `AgentService.ts`, `prompt/constants.ts` |
| Database schema (agent tables) | [DATA_MODELS.md](./DATA_MODELS.md) | `prisma/schema/data.prisma` |
| All tools: parameters, returns, side effects | [TOOLS_REFERENCE.md](./TOOLS_REFERENCE.md) | `AgentTools.ts`, `tools/` |
| Prompt assembly, template merging, DynamicPromptManager | [PROMPT_SYSTEM.md](./PROMPT_SYSTEM.md) | `prompt/DynamicPromptManager.ts`, `prompt/constants.ts` |
| Deterministic builders, executors, hybrid dispatcher | [BUILDERS_EXECUTORS.md](./BUILDERS_EXECUTORS.md) | `builders/`, `executors/` |
| All HTTP endpoints, request/response shapes | [API_REFERENCE.md](./API_REFERENCE.md) | `routes.ts` |
| LLM traces, token usage, feedback workflow | [OBSERVABILITY.md](./OBSERVABILITY.md) | `services/SessionTraceService.ts` |
| Running tests, test patterns, prompt harness | [TESTING.md](./TESTING.md) | `__tests__/` |
| Reconciliation feature (pipeline, confirm, frontend) | [features/RECONCILIATION.md](./features/RECONCILIATION.md) | `tools/suggestReconciliationMatches.ts` |
| Categorization feature (ML, batch, executor) | [features/CATEGORIZATION.md](./features/CATEGORIZATION.md) | `tools/categorizePostings.ts`, `handlers/erp/` |
| Posting domain model, contra-account as category | [features/POSTING_DOMAIN.md](./features/POSTING_DOMAIN.md) | `handlers/erp/utils/categorizationUtils.ts` |
| Diagnosing failed/stuck sessions | [debugging/SESSION_FAILURE_PATTERNS.md](./debugging/SESSION_FAILURE_PATTERNS.md) | `AgentService.ts`, `routes.ts` |
| In-app conversational chat (non-session) — history, PageContext, SDK | [CONVERSATION.md](./CONVERSATION.md) | `ChatUI.tsx`, `ChatContext.tsx`, `AgentService.ts` |
| MCP server — design, tools, Cursor setup (WIP) | [MCP.md](./MCP.md) | `src/mcp/` |

---

## Recommended Reading Order

### New to the agent system? Start here:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) — understand the components and data flow
2. [DATA_MODELS.md](./DATA_MODELS.md) — understand the database tables
3. [SESSION_LIFECYCLE.md](./SESSION_LIFECYCLE.md) — understand how a session executes
4. [features/CATEGORIZATION.md](./features/CATEGORIZATION.md) — concrete end-to-end example

### Adding a new feature:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) — file map to find the right extension point
2. [TOOLS_REFERENCE.md](./TOOLS_REFERENCE.md) — how to add a tool
3. [BUILDERS_EXECUTORS.md](./BUILDERS_EXECUTORS.md) — how to add a deterministic path
4. [TESTING.md](./TESTING.md) — how to test the feature

### Debugging a session failure:
1. [debugging/SESSION_FAILURE_PATTERNS.md](./debugging/SESSION_FAILURE_PATTERNS.md) — pattern index with diagnostic SQL
2. [OBSERVABILITY.md](./OBSERVABILITY.md) — reading LLM traces
3. [SESSION_LIFECYCLE.md](./SESSION_LIFECYCLE.md) — understanding what state the session should be in

### Working on prompts:
1. [PROMPT_SYSTEM.md](./PROMPT_SYSTEM.md) — how prompts are assembled
2. [TESTING.md](./TESTING.md) — how to run the prompt test harness
3. [features/POSTING_DOMAIN.md](./features/POSTING_DOMAIN.md) — posting-specific prompt requirements

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

## Planned but Not Yet Implemented

| Feature | Design Doc |
|---------|------------|
| `requestClarification` tool + `awaiting_input` state | [ARCHITECTURE.md](./ARCHITECTURE.md#planned-features) |
| Workbench V2 hybrid step-card UI | Design in archived `TEMPLATE_FOCUS_PLAN.md` |
| BullMQ worker queue (replace `setImmediate`) | [SESSION_LIFECYCLE.md](./SESSION_LIFECYCLE.md#known-limitations) |
