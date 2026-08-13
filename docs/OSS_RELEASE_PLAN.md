# Fabriq Books — Open Source Release Plan (Thin Public Repo)

**Status:** Planning — not implemented  
**Last updated:** 2026-08-13  
**Audience:** Maintainers reviewing scope before creating the public `oss` branch

---

## 1. Purpose

Publish Fabriq Books as **open source code**, not a curated commercial SKU. The public repository should read as a coherent product: **metadata-driven bookkeeping with AI**, self-hostable, with a clear scope boundary.

This document captures:

- Branch and repo strategy
- What to keep vs delete (no UI hiding)
- Demo seed specification (`oss-books`)
- Documentation layout
- AI scope
- What works vs what breaks
- Consequences and next steps

**Out of scope for this plan:** license choice (decision required), legal review, secret scrubbing checklist execution.

---

## 2. Product thesis (OSS v1)

**Self-hosted double-entry bookkeeping with bank import, AI categorization, conversational chat, core financial reports, and optional Workbench sessions.**

Not included in the public tree:

- ERP forward/reverse sync (third-party accounting connectors, Airbyte, DBT pipelines)
- Sales (order-to-cash) and purchases (procure-to-pay) modules
- Investments / broker sync (Questrade, portfolio, options)
- Email ingest, Slack agent entrypoints (experimental in prod)

Positioning docs frame prod as “agentic FinOps on top of ERPs.” OSS frames as **standalone books**; integrations can return via merge or a sibling repo later.

---

## 3. Branch and repository strategy

| Item | Plan |
|------|------|
| **Base branch** | `prod` |
| **OSS branch name** | `oss` (long-lived, not `agentc/*`) |
| **Public artifact** | Git tags on `oss` (e.g. `v0.1.0-alpha`, `v1.0.0`) |
| **Relationship to `prod`** | Fork once; `oss` diverges by **deleting** out-of-scope code and docs |
| **Merge policy** | Cherry-pick platform fixes `prod` → `oss`; avoid wholesale `prod` merges without port review |
| **UI hiding / feature flags** | **Not used** — omitted features are not in the published tree |

When implementation starts:

```bash
git fetch origin prod
git checkout prod && git pull origin prod
git checkout -b oss
git push -u origin oss
```

---

## 4. Thin repo: two phases

| Phase | What changes | Prisma schema | OSS clarity | Merge-back difficulty |
|-------|----------------|---------------|-------------|------------------------|
| **A — Code thin** (recommended first public release) | Delete routes, UI, Python integrations, non-OSS tests | **Keep full schema** | Good; some empty tables | Easier |
| **B — Schema thin** (optional later) | Also remove `sales.prisma`, procurement models in `zeiv.prisma`, investment models, trim relations | **Trim schema** | Best | Harder |

**Recommendation:** Ship **Phase A** first. `account` and other core models have Prisma relations to `invoice`, `purchase_order`, `holding`, etc.; schema trimming is a graph edit, not a folder delete.

---

## 5. What stays in the public repo

### 5.1 Platform engine

| Capability | Notes |
|------------|--------|
| Metadata-driven CRUD + REST | `ModelService`, `RestService`, auto routes |
| Views, permissions, roles | `setup-metadata.ts`, `prisma/metadata/views/` (subset) |
| Workflow engine | Keep engine; seed only OSS-relevant flows (likely minimal) |
| Multi-tenancy (`org_id`) | Required |
| Multi-entity (`entity`, legal entity selector) | 1–2 entities in seed |
| Filter system | List pages depend on it |
| Generic import + CSV mapper | COA import, shared import UI |
| Bank statement pipeline | `PostingImportService`, SSE import endpoint |
| Auth | **Local JWT** primary; Clerk optional in docs |
| Docker / compose | **Slimmed** — no Python sync service stage |
| `source_system` model + encryption middleware | Small; documents future “connections” slot |

### 5.2 Bookkeeping functionality

| Feature | Models | App surfaces |
|---------|--------|--------------|
| Legal entities | `entity` | Settings / Masters → Entity |
| Chart of accounts | `account` | Accounting → Chart of Accounts |
| Journal entries | `posting` | Accounting → Transactions |
| Bank-focused view | `posting` | Accounting → Bank Transactions |
| Categories | `category`, `category_group` | Accounting → Categories |
| Opening balances | — | Accounting → Opening Balances |
| Currency / FX | `currency`, `exchange_rate` | Accounting → Currency, Exchange Rates |
| Payment terms | `payment_terms` | Optional keep (small master) |
| Core reports | `lib/reports/perfin.ts` | Trial balance, P&L, cash flow, balance sheet, posting list |

**Defer or drop from OSS tree:** budget periods/lines, structured tax P0/P1 UI, legacy tax masters (unless needed for reports), Plaid routes (optional v1.1).

### 5.3 AI (ship in v1)

| Surface | Purpose |
|---------|---------|
| Conversational chat | `ChatShell` on dashboard + Transactions/Accounts; `chat_thread` persistence |
| Bank import + LLM categorization | Combined bank statement import pipeline |
| Agent tools | `categorizePostings`, `searchRecords`, `advancedSqlQuery`, `runFinancialReport`, `analyticsQuery`, `getAnalyticsContext` |
| Workbench (recommended) | `/workbench` with **categorize** template |
| LLM provider setup | **No OSS-specific code required** — existing `modelProvider.ts` |

**Trim or remove for OSS:**

| Item | Reason |
|------|--------|
| `atpl_reconcile` (as shipped) | Assumes invoices + `payment_receipt` |
| `suggestReconciliationMatches` in default tool config | Until AR exists or bank-only reconcile defined |
| `erpConnector`, invoice PDF extract tools | Integrations / AP/AR |
| Email ingest, Slack `/api/slack` | Out of OSS scope |
| MCP investment tools | Optional: keep `list_accounts`, `get_trial_balance` for developers |

### 5.4 LLM providers (existing setup — works as-is)

All LLM calls use `backend/src/lib/ai/modelProvider.ts`. Deployer sets provider and model via environment variables (self-hosted credentials — not a separate hosted-LLM product).

Supported backends (see `backend/.env.example` and `docs/agent/10-LIBRARIES_AND_PROVIDERS.md`):

- Google Vertex / Gemini (GCP credentials)
- OpenAI direct
- Third-party multi-model API gateway
- Custom OpenAI-compatible HTTP endpoint

Per-task model overrides (agent, categorization, extraction, analysis) are optional.

OSS deploy docs should list all four providers. OSS quickstart should **not require** Vertex or Railway; Vertex remains valid for adopters with GCP.

---

## 6. What gets deleted from the public repo (Phase A)

| Area | Representative paths |
|------|------------------------|
| ERP forward sync (Python) | `backend/integrations/**` |
| Node ERP connectors | `lib/integrations/*` vendor connector trees (retain `shared/encryption` if `source_system` stays) |
| Docker sync service stages | Root `Dockerfile` Python integration stages |
| Broker / Questrade | `lib/integrations/broker/**`, `routes/broker-sync.ts`, MCP portfolio/options tools |
| Plaid (v1) | `backend/src/plaid/**` routes; schema may remain in Phase A |
| Sales UI + forms | Sales routes in `App.tsx`, related pages/forms |
| Purchases UI | PR, PO, bills routes and forms |
| Investments UI | `investments/*`, mobile `/m` routes |
| ERP connections UI | `ConnectionsPage`, sync button, connection detail |
| Integration / module tests | `__tests__/integrations`, `broker/**`, sales/purchase suites |
| Commercial / ops docs | `INTEGRATIONS.md`, `RAILWAY_*`, `QUESTRADE_*`, `positioning/`, ERP onboarding workbooks |
| Optional | `frontend-1/config/zeiv/` (Fabriq-only branding) |

---

## 7. Reconciliation without sales/AP (OSS v1 decision)

Without sales/purchases, **do not** ship invoice/receipt matching as the primary reconcile story.

**Recommended: “Categorize + confirm” (bank-only)**

| `reconciliation_status` | Meaning in OSS |
|-------------------------|----------------|
| `UNMATCHED` | Imported bank line; contra account missing or unclear |
| `SUGGESTED` | AI proposed contra account, not yet accepted |
| `CONFIRMED` | User or approved agent action accepted categorization |

Do not document `MATCHED` → invoice/receipt until an AR module ships.

**Agent impact:**

- Replace `atpl_reconcile` with an OSS template (e.g. `atpl_confirm_bank`) — no invoice vocabulary.
- Omit `suggestReconciliationMatches` from default `posting` tool config until AR returns.

---

## 8. Seed data: `oss-books` (new — do not reuse indian-demo)

Existing profiles are wrong for OSS bookkeeping:

| Profile | Why not OSS default |
|---------|---------------------|
| `indian-demo` | Full ERP, multi-entity group, AR + invoice reconcile, huge volume |
| `perfin-demo` | COA + masters but **no postings** loaded in script |
| `us-ca-demo`, `nri` | Full ERP / tax scenarios |

### 8.1 New profile: `--demo-data=oss-books`

**New folder:** `backend/prisma/setup-OSS-BOOKS/`

| Asset | Specification |
|-------|----------------|
| Org | 1 tenant: `org_oss_demo` |
| Legal entities | 1 entity (e.g. “Acme Books LLC”, USD); optional 2nd only if docs cover consolidation |
| Users | `admin@example.com` / `admin123` (Super Admin); 1 bookkeeper user |
| COA | ~40–60 accounts (checking, savings, credit card, standard income/expense) |
| Categories | Aligned to contra accounts used in demo |
| Postings | ~3 months, ~80–120 lines: mix of categorized, uncategorized, partial AI scores |
| Reconciliation | Bank-only statuses; **no** `payment_receipt_id` / invoice refs in seed |
| FX | USD-only for simplest v1 (document clearly) |
| Sample import file | `samples/bank-statement-q1.csv` (and optional PDF for docs) |
| Excluded | customers, suppliers, items, invoices, POs, holdings, ERP `source_system` rows |

### 8.2 Reuse from prod (extract, don’t run whole indian-demo)

- COA template pattern from `setup-PERFIN/chart-of-accounts.json`
- Bank-line CSV patterns from `setup-IN` reconciliation helpers — **without** receipt/invoice linkage
- Realistic bank descriptions for AI categorize demos

### 8.3 `setup-db.js` (OSS repo only)

- Default demo: `oss-books` (non-interactive)
- Remove or omit `indian-demo`, `both`, `nri` from OSS `setup-db.js`
- `adminRouter` demo profiles: only `oss-books`
- Document all seed IDs in `docs/bookkeeping/SEED_REFERENCE.md`

---

## 9. Agent seeds (OSS-specific SQL)

Do not ship prod `seed-agent-templates.sql` verbatim.

| Template | OSS v1 |
|----------|--------|
| Categorize expenses | **Keep** |
| Book transactions (Workbench) | **Keep** if Workbench ships |
| Reconcile (prod) | **Replace** with bank-only confirm template |
| Invoice / PO templates | **Remove** |

`seed-agent-model-tools.sql` OSS variant:

- `posting`: categorize, reports, search; drop invoice tools and invoice-match reconcile until AR module
- Remove `invoice`, `purchase_order` rows
- `default`: no `extractInvoiceFromFile`

---

## 10. Documentation layout (OSS repo)

**Principle:** Every doc maps to shipped code. No sales/purchases sessions in OSS user guide.

### 10.1 Root

- `README.md` — scope, quickstart, env vars, explicit **not included** list
- `LICENSE` (decision pending)
- `CONTRIBUTING.md` — scope: bookkeeping + AI

### 10.2 `docs/` tree (proposed)

```
docs/
  README.md                 # OSS doc router (replace prod-oriented router)
  OSS_RELEASE_PLAN.md       # this file
  platform/
    ARCHITECTURE.md         # module list trimmed to bookkeeping
    BACKEND.md
    FRONTEND.md
    AUTHENTICATION.md
    WORKFLOWS.md            # minimal if few workflows seeded
    FILTER_SYSTEM.md
    IMPORT_FUNCTIONALITY.md
  bookkeeping/
    OVERVIEW.md
    CHART_OF_ACCOUNTS.md
    TRANSACTIONS.md
    BANK_IMPORT.md
    CATEGORIZATION.md
    OPENING_BALANCES.md
    REPORTS.md
    SEED_REFERENCE.md         # oss-books IDs and counts
  ai/
    OVERVIEW.md
    CONVERSATIONAL_CHAT.md
    CATEGORIZE_WITH_AI.md
    LLM_SETUP.md              # supported LLM backends (see modelProvider.ts)
    WORKBENCH.md              # if included
  deploy/
    DEPLOYMENT.md
    BUILD_AND_DEPLOY.md       # slim Docker
  user-guide/
    README.md                 # 4 sessions: overview, common, accounting, reports
```

### 10.3 Do not copy to public repo (or move to private prod only)

- `INTEGRATIONS.md`, `positioning/`, tax implementation packs, `QUESTRADE_*`, integration onboarding workbooks
- Full `docs/agent/01–15` — distill into `docs/ai/` instead
- `RAILWAY_*` (commercial deploy)

Each bookkeeping doc should state: **sidebar path**, **models**, **API surface**, **AI behavior**, **relevant seed IDs**.

---

## 11. Navigation (OSS app)

```
Dashboard (chat-forward)
Accounting
  - Transactions
  - Bank Transactions
  - Chart of Accounts
  - Categories / Category Groups
  - Opening Balances
  - Currency / Exchange Rates
Reports
  - Trial Balance, P&L, Cash Flow, Balance Sheet, Posting List
Settings
  - Users, Roles
  - (Optional super-admin: Views, Permissions, AI templates)
```

No Sales, Purchases, Investments, Connections, Workbench (if deferred), or ERP settings.

---

## 12. What will work (after Phase A + oss-books)

| Flow | Expected |
|------|----------|
| Clone → compose or `npm run dev` | Yes, with slim Docker + README |
| `setup-db.js --demo-data=oss-books --skip-tests` | Yes, with new seed |
| Login `admin@example.com` | Yes |
| COA CRUD + CSV import | Yes |
| Manual journals | Yes |
| Opening balances | Yes |
| Bank CSV/PDF import (no LLM) | Yes |
| Bank import with LLM categorization | Yes, with configured LLM env vars |
| Filters, bulk edit, reconciliation status filters | Yes |
| Conversational chat + financial Q&A | Yes |
| Chat / agent categorize | Yes |
| Workbench categorize session | Yes, with OSS templates |
| Core financial reports | Yes |
| Super-admin users/roles | Yes |
| MCP `get_trial_balance` / `list_accounts` | Yes, if MCP kept |

---

## 13. What will break or need explicit fixes

| Issue | Cause | OSS plan fix |
|-------|--------|--------------|
| Reconcile agent references invoices | Prod `atpl_reconcile` | OSS agent SQL + docs |
| Empty reconcile-to-document UI | No AR/AP seed | Bank-only story; remove or guard UI actions |
| `npm test` fails | Full prod test suite | `npm run test:oss` subset + CI |
| Docker build fails | Dockerfile copies `integrations/` | Slim Dockerfile |
| `setup-workflows.ts` seeds ERP flows | Runs on every setup | `setup-workflows-oss.ts` or trimmed script |
| 120+ view JSON files | `sync-metadata` imports all | Delete unused JSON in OSS repo |
| Tenant admin demo reset | Offers `indian-demo` | OSS: `oss-books` only |
| Import invoice PDF / ERP routes | Code deleted | Document as not in edition |
| Cherry-pick from `prod` | Divergent trees | Maintainer process |

Phase B (schema trim) adds: migration conflicts, orphaned metadata views, missed Prisma relations.

---

## 14. Consequences

### Maintainers

- Two lines: `prod` (full) and `oss` (thin)
- Platform fixes: cherry-pick, not blind merge
- `oss-books` seed and OSS docs owned on `oss`
- Separate agent SQL seeds on `oss`
- CI: `test:oss` vs full prod suite
- Pre-public push: license, secret scrub, customer data in CSVs
- Support boundary: sales/integrations issues → not in `fabriq-books` OSS edition

### Adopters

- Small, legible codebase; clear scope
- Self-hosted LLM credentials via existing env vars
- Extensible platform; modules return via merge or sibling repos

### Adding omitted features later

| Module | Difficulty | Notes |
|--------|------------|-------|
| Sales / purchases | Low–medium code merge | Isolated Prisma files + routes + seeds |
| Plaid | Medium | Fits bookkeeping; needs Plaid dev account |
| Investments + broker | Medium | Separate product slice |
| ERP forward sync | High | Python service, Airbyte, `datalake`, DBT, ops |
| Integrations without sales/purchases | **Broken UX** | Normalized data has no UI target |

**Dependency rule:**

```
ERP forward sync  →  needs sales and/or purchases UI + models
Plaid             →  bookkeeping only (good OSS v1.1 fit)
Investments       →  separate module
```

---

## 15. Suggested versioning

| Tag | Scope |
|-----|--------|
| `v0.1.0-alpha` | `oss` branch cut; bookkeeping routes; `oss-books` seed; chat; CSV bank import |
| `v0.2.0-alpha` | PDF bank import + AI categorization on import |
| `v1.0.0` | Full bookkeeping loop + agent categorize + reports; slim Docker; OSS README + doc set |

---

## 16. Open decisions (review before implementation)

1. **License** (Apache 2.0, MIT, AGPL, dual-license with prod)
2. **Phase A only vs Phase B** in first public tag
3. **Workbench in v1** vs conversational chat only
4. **Reconciliation story** — bank-only confirm (recommended) vs thin AR slice
5. **MCP in v1** — keep read-only ledger tools or omit entirely
6. **Plaid** — delete routes vs keep unmounted code in Phase A
7. **Multi-brand** — Fabriq only vs keep Zeiv config
8. **Super-admin** — expose views/permissions editor as “framework” story or restrict
9. **`prod` ↔ `oss` long-term** — permanent fork vs merge OSS core back to prod

---

## 17. Implementation sequence (when approved)

| Step | Action |
|------|--------|
| 0 | Lock open decisions (§16) |
| 1 | Path-level keep/delete inventory (spreadsheet or Grok-generated list) |
| 2 | License + secret scrub plan |
| 3 | Create `oss` from `prod`; set repo visibility |
| 4 | Phase A code deletion + slim Dockerfile |
| 5 | Trim metadata views + `setup-workflows-oss` + agent OSS SQL seeds |
| 6 | Implement `setup-OSS-BOOKS/` + wire `setup-db.js` |
| 7 | OSS doc tree + user-guide subset |
| 8 | `verify:oss` (API acceptance) + `.cursor/skills/oss-verify/SKILL.md` |
| 8b | `.cursor/environment.json` — Postgres + `verify:oss` in install (see §20) |
| 9 | Verify cold-start matrix (§12) |
| 10 | Tag `v0.1.0-alpha` |

---

## 18. Grok / review prompt (optional)

Use when curating the path-level checklist:

> Thin OSS repo for Fabriq Books: fork from `prod`, **delete** (not hide) code outside core bookkeeping + platform + AI. Single demo `oss-books` (1 org, 1 entity, ~50 COA accounts, 3 months bank postings, uncategorized lines for AI). Agent: conversational chat + categorize + optional Workbench; **no** invoice reconcile. Docs: `docs/platform`, `docs/bookkeeping`, `docs/ai`, `docs/deploy`, 4 user-guide sessions. LLM: existing modelProvider backends (no new OSS LLM code). Produce: (1) path keep/delete list, (2) oss-books seed file list with row counts, (3) doc outline with menu paths, (4) `test:oss` file list, (5) Phase A vs B recommendation.

---

## 20. Verification on Cursor Cloud Agents (not local laptop)

OSS “done” is proven by a **Cloud Agent** on the remote VM, without relying on your laptop, a browser, or an external production database.

### 20.1 Design principles for cloud

| Principle | Why |
|-----------|-----|
| **One command** | Agent runs `npm run verify:oss` from repo root; no manual steps |
| **API-first** | Jest hits REST + reports; no Playwright by default |
| **Self-contained Postgres** | Spin up Postgres in Docker inside the VM; do not require hosted `DATABASE_URL` secrets |
| **No LLM in default gate** | Categorize/import AI is optional `verify:oss:ai` |
| **No GUI** | Do not use computerUse / Playwright for the release gate |
| **Deterministic seed** | `oss-books` + `oss-books-config.json` with stable IDs |

Playwright and Workbench E2E stay **out of the default cloud path** (they need LLM, indian-demo users, and a browser stack).

### 20.2 What the cloud agent runs

```bash
# From repo root — sole definition of “OSS verify passed”
npm run verify:oss
```

**`verify:oss` should chain:**

1. **Start Postgres** (if not already running) — e.g. `docker compose -f docker-compose.verify.yml up -d postgres`
2. **Bootstrap DB** — `cd backend && node setup-db.js --demo-data=oss-books --skip-tests --env=test`
3. **API acceptance** — `OSS_VERIFY=1 npm run test:oss` (Jest, `runInBand`)

Optional (not default):

- `npm run verify:oss:ai` — bank import or categorize with LLM env configured
- `npm run test:e2e:oss` — only if environment build installs Playwright + Chromium

### 20.3 API acceptance suite (Tier 1 — required)

**Location:** `backend/src/__tests__/oss/oss-acceptance.test.ts`  
**Config:** `backend/src/__tests__/test-configs/oss-books-config.json` (stable seed IDs)  
**Gate:** `OSS_VERIFY=1`

| Step | Check |
|------|--------|
| Login | `POST /api/auth/login` with seed admin → JWT |
| List accounts | Search/list via REST + view metadata |
| Posting CRUD | Create balanced journal line, read, update description, delete/cleanup |
| Trial balance | `POST /api/report/trial_balance` — rows present, debits ≈ credits |
| Balance sheet | `POST /api/report/...` (balance sheet endpoint as UI uses) — accounting equation holds for seed |
| Income statement | Optional row count / classification smoke |

**Implementation style:** `supertest` against the Express app (in-process, no separate `npm run dev` step) **or** ModelService + auth login service for speed. Prefer **supertest + login** so HTTP auth is exercised.

**npm scripts:**

- `backend`: `"test:oss": "OSS_VERIFY=1 jest src/__tests__/oss --runInBand --forceExit"`
- root: `"verify:oss": "node scripts/verify-oss.mjs"` (or shell script orchestrating compose + setup-db + test:oss)

### 20.4 Environment setup (`.cursor/environment.json`)

Commit repo-managed environment config so **every Cloud Agent** on `oss` gets the same verify path:

| Piece | Purpose |
|-------|---------|
| `install` | `npm run install:all`, ensure Docker available, pull `postgres:16-alpine` |
| `start` or verify script | Not required for API-only verify if tests use supertest |
| `docker-compose.verify.yml` | Minimal: Postgres on `localhost:5432`, db `fabriq_verify`, user/password fixed in `.env.test` |

**`.env.test` for verify** (committed, no secrets):

- `DATABASE_URL=postgresql://fabriq:fabriq@localhost:5432/fabriq_verify`
- LLM vars **omitted** for default verify

Cloud Agent secrets (`DATABASE_URL` for prod/Railway) should **not** be required for OSS verify.

### 20.5 Agent skill

**`.cursor/skills/oss-verify/SKILL.md`** — Cloud Agents read this before claiming OSS work complete:

1. Preconditions: Docker, Node 20, on `oss` branch
2. Run `npm run verify:oss`
3. Expected: exit 0, Jest summary all green
4. On failure: read setup-db output, compare `oss-books-config.json` to `SEED_REFERENCE.md`
5. Do **not** skip verify because “no local Postgres on laptop” — compose provides Postgres
6. LLM tests only when explicitly asked

Reference this skill from root `AGENTS.md` under OSS section.

### 20.6 What cloud agents should not use as the gate

| Avoid | Reason |
|-------|--------|
| `npm run test:suite` | ERP modules removed from OSS |
| `frontend-1` Playwright workbench E2E | LLM + indian-demo user + browser |
| `setup-db --demo-data=indian-demo` | Wrong scope and volume |
| Manual login in browser | Not automatable as default gate |
| External Railway/prod DB | Destructive `db push --force-reset` |

### 20.7 CI parity

GitHub Actions (or Cursor Cloud on PR) runs the **same** `npm run verify:oss` as the coding agent — same compose file, same seed, same Jest file. No separate “CI-only” harness.

---

## 21. Related prod documentation

| Topic | Prod doc (reference while planning) |
|-------|-------------------------------------|
| Architecture | `docs/ARCHITECTURE.md` |
| Bookkeeping domain | `docs/book-keeping/BOOKKEEPING_DOMAIN.md` |
| Import | `docs/IMPORT_FUNCTIONALITY.md` |
| Agent providers | `docs/agent/10-LIBRARIES_AND_PROVIDERS.md` |
| User accounting flow | `docs/user-guide/05-accounting/README.md` |
| Integrations (not OSS v1) | `docs/INTEGRATIONS.md` |

---

*End of plan. Update this file as decisions in §16 are resolved.*
