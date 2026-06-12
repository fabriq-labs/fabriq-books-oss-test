# Agent Documentation Rewrite — Plan for Review

**Status**: Draft plan (v2, revised after Fable review), not yet implemented.

## Context

The current `docs/agent/` tree (21 files incl. archive/specs) has grown
organically: several docs overlap heavily (CATEGORIZATION.md vs
CATEGORIZATION_V2.md vs features/specs/CATEGORIZATION_V2.md), some describe
features that no longer exist or were never finished (MCP.md,
requestClarification, awaiting_input state), and several major code areas
have no documentation at all (ERP handler registry, ModelService/LLM provider
abstraction, question routing, multi-tenancy enforcement, Slack integration).

Rather than refresh each file in place, we're proposing a fresh document tree:
fewer files, each with a clearly distinct scope, split into a **narrative
track** (read in order to understand the system) and a **reference track**
(consult as needed), plus a small **meta** group (how to extend, what's broken).

Throughout, wherever a concept can be illustrated with a bookkeeping domain
example (categorizing a transaction, reconciling a bank statement line against
a posting, multi-tenant chart of accounts), we will use one. The bookkeeping
domain itself is introduced early (in OVERVIEW) so later examples don't need
to re-explain it.

## Proposed Structure (14 docs + 1 follow-up)

```
docs/agent/
├── README.md                       # index, two reading tracks (narrative/reference)
│
│  --- NARRATIVE TRACK (read in order) ---
├── 01-OVERVIEW.md                  # motivation: why an agent layer over CRUD APIs
│                                    #   + bookkeeping domain primer (posting,
│                                    #     contra-account-as-category, reconciliation,
│                                    #     categorization — what they mean to an
│                                    #     accountant, used as running examples below)
├── 02-ARCHITECTURE.md              # components, request flow, file map
│                                    #   incl. note on slack/ as experimental entrypoint
├── 03-SESSION_LIFECYCLE.md         # states, planning, auto-continuation, streaming
├── 04-PROMPT_SYSTEM.md             # 4-layer prompt assembly + DynamicPromptManager
│                                    #   + question routing (session vs conversational)
├── 05-TOOLS.md                     # full tool catalog + ERP handler registry/dispatch
│                                    #   as a clearly-delineated subsection
├── 06-BUILDERS_AND_EXECUTORS.md    # ActionBuilderRegistry, ReportFormatterRegistry,
│                                    #   PendingActionExecutor
├── 07-WORKED_EXAMPLES.md           # end-to-end traces of reconciliation & categorization,
│                                    #   cross-referencing sections in 03-06 by anchor,
│                                    #   no pasted code; each trace stamped with the
│                                    #   commit/date it was verified against
│
│  --- REFERENCE TRACK (consult as needed) ---
├── 08-DATA_MODELS.md               # session/message/template/pending_action/trace models
│                                    #   + multi-tenancy (org_id isolation)
├── 09-API_REFERENCE.md             # HTTP endpoints
├── 10-LIBRARIES_AND_PROVIDERS.md   # Vercel AI SDK, Zod, model provider abstraction
│                                    #   (Vertex/OpenAI/OpenRouter, LLM_MODEL_{TASK})
├── 11-OBSERVABILITY.md             # llm_trace, token usage, feedback loop
├── 12-TESTING.md                   # prompt harness, e2e patterns, seed data
│
│  --- META ---
├── 13-EXTENDING.md                 # recipes: add a tool, add an ERP method,
│                                    #   add a builder, add an executor — each with
│                                    #   one bookkeeping example
├── 14-SHORTFALLS_AND_ROADMAP.md    # deprecated tools, unimplemented features,
│                                    #   orphaned docs, known issues, Slack status
├── debugging/
│   └── SESSION_FAILURE_PATTERNS.md # refreshed, kept as-is structurally
└── archive/                        # superseded docs moved here, not deleted

## Follow-up (second pass, after 01-14 are stable)
└── 15-CONVERSATIONAL_CHAT.md       # non-session chat path, uiHint custom rendering,
                                     #   PageContext, depends on 03/04/05
```

## Key Decisions & Rationale

1. **Narrative vs. reference split** — the previous flat ordering buried the
   "story" (session pursues a goal via plan → steps → tools → pending actions)
   under schema reference material. Now: 01-07 read in order tell the whole
   story; 08-12 are reference, consulted while reading or later; 13-14 are meta.

2. **Bookkeeping domain primer moved into 01-OVERVIEW** — posting/contra-account
   semantics (previously a standalone POSTING_DOMAIN doc) are business-domain
   context needed to understand almost everything else, so they're established
   up front alongside the motivation section, not buried in a reference doc.

3. **Multi-tenancy folded into Data Models (08)** — it's primarily about how
   `org_id` constrains every table/query, a data model concern. Worked example:
   two orgs each with their own "Office Supplies" category, agent must never
   cross-match.

4. **ERP handlers as a subsection within Tools (05)**, not interleaved with the
   tool catalog and not a separate doc — confirmed via code review that ERP
   handlers (`categorizeTransaction`, `getPurchaseOrder`, etc.) are either
   called directly by specific tools (`categorizePostings`) or dispatched
   dynamically via `erpConnectorTool` + `registry.ts`. They're an implementation
   detail of the tools layer, documented as a clearly-marked subsection so 05
   doesn't bloat into "tool catalog + extension guide + ERP reference."

5. **Question routing merged into Prompt System (04)** — the questionClassifier
   decision (session vs. conversational chat) is part of how a prompt/request
   gets assembled and dispatched, so it belongs alongside DynamicPromptManager.

6. **"Features" (reconciliation, categorization, posting domain) eliminated as
   standalone docs** — they were vertical slices duplicating the layer docs.
   - POSTING_DOMAIN → bookkeeping primer in 01-OVERVIEW.
   - RECONCILIATION and CATEGORIZATION → running examples embedded in 04/05/06,
     plus one consolidated end-to-end trace doc (07).

7. **"How to extend" recipes extracted to 13-EXTENDING** — rather than each
   reference doc (05, 06) carrying its own "how to add X" section (which was
   making them three docs' worth), a single recipes doc covers: add a tool,
   add an ERP method, add a builder, add an executor. Reference docs (05, 06)
   stay pure reference; contributors looking to extend the system get one door.

8. **07-WORKED_EXAMPLES staleness policy** — end-to-end traces are the most
   brittle doc type (every tool rename breaks them, as CATEGORIZATION_V2
   demonstrated). Policy: traces reference doc sections by anchor, never paste
   long code, and each trace is stamped with the commit/date it was last
   verified against.

9. **Conversational chat (CONVERSATION.md) deferred to a second pass** — it's a
   distinct cross-cutting concern (uiHint-driven custom UI rendering for tables/
   charts/metrics, PageContext injection, Vercel AI SDK streaming on the frontend)
   but depends on concepts defined in 03/04/05. Written as 15-CONVERSATIONAL_CHAT.md
   once 01-14 are solid.

10. **Shortfalls/roadmap (14) consolidates** scattered "WIP"/"planned"/"deprecated"
    notes currently spread across multiple docs: deprecated `queueAction`/
    `queueActionBatch` (now `queueActions`), unimplemented `requestClarification`,
    unused `awaiting_input` session state, incomplete MCP.md, orphaned
    CATEGORIZATION_V2.md, and Slack integration status (also flagged in
    02-ARCHITECTURE's file map as experimental).

## Migration Table — Disposition of Existing Files

| Existing file | Disposition |
|---|---|
| `README.md` | Rewritten — two-track index |
| `ARCHITECTURE.md` | Absorbed → 02-ARCHITECTURE (rewritten, + Slack note) |
| `SESSION_LIFECYCLE.md` | Absorbed → 03-SESSION_LIFECYCLE (rewritten, fix stale states) |
| `PROMPT_SYSTEM.md` | Absorbed → 04-PROMPT_SYSTEM (rewritten, + question routing) |
| `TOOLS_REFERENCE.md` | Absorbed → 05-TOOLS (rewritten, + ERP subsection; "how to add" → 13) |
| `BUILDERS_EXECUTORS.md` | Absorbed → 06-BUILDERS_AND_EXECUTORS (rewritten; "how to add" → 13) |
| `DATA_MODELS.md` | Absorbed → 08-DATA_MODELS (rewritten, + multi-tenancy) |
| `API_REFERENCE.md` | Absorbed → 09-API_REFERENCE (refreshed) |
| `OBSERVABILITY.md` | Absorbed → 11-OBSERVABILITY (refreshed) |
| `TESTING.md` | Absorbed → 12-TESTING (refreshed) |
| `CONVERSATION.md` | Absorbed → 15-CONVERSATIONAL_CHAT (second pass) |
| `MCP.md` | → `archive/`; status noted in 14-SHORTFALLS_AND_ROADMAP |
| `WORKBENCH_AGENT_LOOP.md` | Relevant content folded into 03/07; rest → `archive/` |
| `WORKBENCH_BACKEND.md` | Relevant content distributed into 02/05/06/08 as needed; rest → `archive/` |
| `archive/WORKBENCH_IMPLEMENTATION_PLAN.md` | Stays in `archive/` |
| `features/POSTING_DOMAIN.md` | Absorbed → 01-OVERVIEW (bookkeeping primer) |
| `features/RECONCILIATION.md` | Absorbed → running examples in 04/05/06 + 07-WORKED_EXAMPLES |
| `features/CATEGORIZATION.md` | Absorbed → running examples in 04/05/06 + 07-WORKED_EXAMPLES |
| `features/CATEGORIZATION_V2.md` | → `archive/`; superseded-by note in 14-SHORTFALLS_AND_ROADMAP |
| `features/specs/CATEGORIZATION_V2.md` | → `archive/` |
| `debugging/SESSION_FAILURE_PATTERNS.md` | Refreshed in place |

New docs with no prior equivalent: 01-OVERVIEW (motivation framing),
10-LIBRARIES_AND_PROVIDERS, 13-EXTENDING, 14-SHORTFALLS_AND_ROADMAP (as a
dedicated doc), 07-WORKED_EXAMPLES (as a dedicated doc).

## Net Effect

- Current: 21 files across docs/agent/, docs/agent/features/(/specs),
  docs/agent/debugging/, docs/agent/archive/ — significant overlap and several
  outdated/orphaned docs.
- Proposed: 14 active docs (+1 follow-up) in two reading tracks + meta group,
  each with non-overlapping scope.
- Old docs moved to `archive/` (not deleted) for historical reference, per the
  migration table above.

## Notes Carried Over from Top-Level CLAUDE.md / docs/CLAUDE.md

The top-level `docs/CLAUDE.md` router still references old paths
(`docs/agent/RECONCILIATION_TOOL.md`, `docs/agent/AI_Categorizer.md`,
`docs/agent/END_USER_CONVERSATION_FLOW.md`) that don't match the current
`docs/agent/` tree at all (these appear to already be stale / pre-rewrite
references). As part of this rewrite we should also update the router tables
in both `CLAUDE.md` and `docs/CLAUDE.md` to point at the new 01-15 doc set.
