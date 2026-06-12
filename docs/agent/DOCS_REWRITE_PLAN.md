# Agent Documentation Rewrite — Plan for Review

**Status**: Draft plan, not yet implemented. Seeking review before writing content.

## Context

The current `docs/agent/` tree (14+ files) has grown organically: several docs
overlap heavily (CATEGORIZATION.md vs CATEGORIZATION_V2.md), some describe
features that no longer exist or were never finished (MCP.md, requestClarification,
awaiting_input state), and several major code areas have no documentation at all
(ERP handler registry, ModelService/LLM provider abstraction, question routing,
multi-tenancy enforcement, Slack integration).

Rather than refresh each file in place, we're proposing a fresh document tree:
fewer files, each with a clearly distinct scope, organized as "layers" of the
system (data → prompt → tools → execution) plus a small number of cross-cutting
docs (overview, libraries, examples, shortfalls).

Throughout, wherever a concept can be illustrated with a bookkeeping domain
example (categorizing a transaction, reconciling a bank statement line against
a posting, multi-tenant chart of accounts), we will use one.

## Proposed Structure (13 docs + 1 follow-up)

```
docs/agent/
├── README.md                       # index, reading order, quick orientation
├── 01-OVERVIEW.md                  # motivation: why an agent layer over CRUD APIs
├── 02-ARCHITECTURE.md              # components, request flow, file map
├── 03-LIBRARIES_AND_PROVIDERS.md   # Vercel AI SDK, Zod, model provider abstraction
├── 04-DATA_MODELS.md               # session/message/template/pending_action/trace models
│                                    #   + multi-tenancy (org_id isolation)
│                                    #   + posting/contra-account domain model
├── 05-SESSION_LIFECYCLE.md         # states, planning, auto-continuation, streaming
├── 06-PROMPT_SYSTEM.md             # 4-layer prompt assembly + DynamicPromptManager
│                                    #   + question routing (session vs conversational)
├── 07-TOOLS.md                     # full tool catalog + ERP handler registry/dispatch
│                                    #   + "how to add a new tool / ERP method"
├── 08-BUILDERS_AND_EXECUTORS.md    # ActionBuilderRegistry, ReportFormatterRegistry,
│                                    #   PendingActionExecutor + "how to add a new one"
├── 09-API_REFERENCE.md             # HTTP endpoints
├── 10-OBSERVABILITY.md             # llm_trace, token usage, feedback loop
├── 11-TESTING.md                   # prompt harness, e2e patterns, seed data
├── 12-WORKED_EXAMPLES.md           # end-to-end traces of reconciliation & categorization,
│                                    #   cross-referencing sections in 06/07/08
├── 13-SHORTFALLS_AND_ROADMAP.md    # deprecated tools, unimplemented features,
│                                    #   orphaned docs, known issues
├── debugging/
│   └── SESSION_FAILURE_PATTERNS.md # refreshed, kept as-is structurally
└── archive/                        # superseded docs moved here, not deleted

## Follow-up (second pass, after 01-13 are stable)
└── 14-CONVERSATIONAL_CHAT.md       # non-session chat path, uiHint custom rendering,
                                     #   PageContext, depends on 05/06/07
```

## Key Decisions & Rationale

1. **Multi-tenancy** folded into Data Models (04) rather than its own doc — it's
   primarily about how `org_id` constrains every table/query, which is a data
   model concern. Worked example: two orgs each with their own "Office Supplies"
   category, agent must never cross-match.

2. **ERP handlers merged into Tools (07)**, not a separate doc — confirmed via
   code review that ERP handlers (`categorizeTransaction`, `getPurchaseOrder`,
   etc.) are either called directly by specific tools (`categorizePostings`) or
   dispatched dynamically via `erpConnectorTool` + `registry.ts`. They're an
   implementation detail of the tools layer, not a separate architectural concept.

3. **Question routing merged into Prompt System (06)** — the questionClassifier
   decision (session vs. conversational chat) is part of how a prompt/request
   gets assembled and dispatched, so it belongs alongside DynamicPromptManager.

4. **"Features" (reconciliation, categorization, posting domain) eliminated as
   standalone docs** — they were vertical slices duplicating the layer docs.
   - POSTING_DOMAIN folds into Data Models (04) as a domain-model section.
   - RECONCILIATION and CATEGORIZATION become the running bookkeeping examples
     embedded in 06/07/08, plus one consolidated end-to-end trace doc (12).

5. **Conversational chat (CONVERSATION.md) deferred to a second pass** — it's a
   distinct cross-cutting concern (uiHint-driven custom UI rendering for tables/
   charts/metrics, PageContext injection, Vercel AI SDK streaming on the frontend)
   but depends on concepts defined in 05/06/07. Written as 14-CONVERSATIONAL_CHAT.md
   once the core 13 are solid.

6. **Shortfalls/roadmap (13) consolidates** scattered "WIP"/"planned"/"deprecated"
   notes currently spread across multiple docs: deprecated `queueAction`/
   `queueActionBatch` (now `queueActions`), unimplemented `requestClarification`,
   unused `awaiting_input` session state, incomplete MCP.md, orphaned
   CATEGORIZATION_V2.md, undocumented Slack integration (noted as experimental).

## Net Effect

- Current: ~18 files across docs/agent/, docs/agent/features/, docs/agent/debugging/,
  with significant overlap and several outdated/orphaned docs.
- Proposed: 13 active docs (+1 follow-up), each with non-overlapping scope,
  organized as architectural layers + small set of cross-cutting docs.
- Old docs moved to `archive/` (not deleted) for historical reference.

## Open Questions for Reviewer

- Is the layer ordering (data → session → prompt → tools → execution → API →
  observability → testing → examples → roadmap) the right reading order, or
  should architecture/overview come with more upfront framing of the bookkeeping
  domain before diving into data models?
- Is folding ERP handlers into Tools (07) going to make that doc too large? It's
  currently the largest code surface (6 tool files + 6 handler files + registry).
  Alternative: keep ERP handlers as a clearly-delineated subsection/appendix
  within 07 rather than interleaving with the tool catalog.
- Any other major code areas (Slack, schema generator, search normalization
  utils) that deserve more than a passing mention in Shortfalls/Roadmap?
