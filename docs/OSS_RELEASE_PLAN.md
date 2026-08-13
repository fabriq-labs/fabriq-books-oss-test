# Fabriq Books — Open Source Release Plan

**Status:** Planning — not implemented  
**Last updated:** 2026-08-13 (doc extract = bank PDFs only)  
**Audience:** Maintainers and reviewers. This file is the single source of truth. Do not use chat history.

**Release target:** **v1.0.0** only. Intermediate alpha tags are optional implementation checkpoints, not a second product.

---

## 1. What we are shipping

**Fabriq Books v1.0.0 (OSS):** self-hosted double-entry bookkeeping with AI (chat, categorization, Workbench, document extraction for bank/posting documents), Plaid bank feeds, MCP (read-only ledger tools), and core financial reports.

Not an empty framework. Not a hidden full ERP. **Thin at every layer:** UI, HTTP API, Prisma schema, seeds, tests, Docker, and docs. Omitted modules are **deleted** from the public tree—not feature-flagged, not left as dead routes.

**License:** AGPL.

---

## 2. Locked decisions

Do not re-litigate these without an explicit override and an edit to this section.

### 2.1 Product (v1.0.0)

| Item | Locked |
|------|--------|
| Core loop | Chart of accounts → bank/manual journals → categorize → confirm → reports |
| Entities | **Any number of legal entities** supported (platform). Seed may use one org + one or more entities for the demo; do not hard-code “single entity only” in product or docs |
| AI — conversational chat | Ship (`ChatShell`, `chat_thread`, page context on Transactions / Accounts / Dashboard) |
| AI — categorization | Ship (`categorizePostings`, import-time LLM categorize, Workbench categorize) |
| AI — Workbench | Ship (`/workbench`, categorize + book-transactions templates). **No** invoice/receipt match inbox |
| AI — document extraction | **Bank statement PDF/CSV only** (confirmed). No invoice, bill, or receipt-capture extract in v1.0.0 |
| LLM | Existing `modelProvider.ts` only. Deployer sets env vars. No new OSS LLM stack. Quickstart must not require Vertex or Railway |
| Banking | **Plaid in v1.0.0** plus CSV/PDF bank import |
| Brand | **Fabriq only.** Drop Zeiv config and brand assets from the public tree |
| MCP | **Ship** read-only bookkeeping tools (`list_accounts`, `get_trial_balance`). **No** portfolio / options / broker MCP tools |
| Super-admin | **Expose** views / permissions / AI templates — that is the metadata platform for contributors |
| Reconcile | **Categorize + confirm (bank-only).** No invoice/receipt matching. Statuses: `UNMATCHED` / `SUGGESTED` / `CONFIRMED`. Do not seed or document `MATCHED` → document |
| Category meaning | User-facing “category” = **contra account**. Keep or drop `category` / `category_group` tables only if they serve reports; do not teach two competing meanings in the user guide |
| Auth | Local JWT default. Clerk optional in docs only |

### 2.2 Thin at all levels

Not “hide the menu.” Not “delete UI but keep schema and APIs.”

| Layer | v1.0.0 public tree |
|-------|-------------------|
| UI | Only bookkeeping, reports, Workbench, Plaid/bank connections, settings (users, roles, views, permissions, AI templates) |
| HTTP | **Allowlist models** (and/or delete unused views + permissions). Generic REST must not serve sales/PO/invoice/investment APIs |
| Prisma | **Remove omitted models and relations** (sales, procurement, investments, ERP connector trees). Keep bookkeeping + Plaid + agent + platform metadata |
| Seeds | `oss-books` only. No indian-demo / perfin / nri / us-ca in OSS `setup-db` |
| Agent SQL | OSS templates only (categorize, book-transactions, bank confirm). No invoice/PO/ERP tools |
| Tests | `verify:oss` + bookkeeping/Plaid/agent-categorize tests. No ERP/sales/broker suites |
| Docker | Slim image: Node + frontend. **No** Python ERP sync service. Verify compose = Postgres only |
| Docs | Only platform + bookkeeping + AI + deploy + 4 user-guide sessions. No positioning, ERP, Railway, broker handoffs |
| Brand | No Zeiv |

**Keep (small, needed):** metadata engine, workflows engine (seed **no** PR/PO/invoice flows), `source_system` if Plaid/connections need it, Plaid schema and routes, agent session/chat tables, MCP router + ledger tools.

### 2.3 What is deleted (not hidden)

- Sales (O2C): customers, quotes, sales orders, sales invoices, receipts, credit notes, delivery challans — **code, schema, views, tests, docs**
- Purchases (P2P): suppliers, PR, PO, bills — same
- Investments / broker sync / options / mobile `/m`
- ERP forward/reverse sync: Python `backend/integrations/**`, vendor connectors, Connections-for-ERP UI, Airbyte/DBT/`datalake`
- Email ingest → invoice, Slack agent
- Zeiv brand (`frontend-1/config/zeiv/`)
- Commercial docs: `positioning/`, `INTEGRATIONS.md`, `RAILWAY_*`, `QUESTRADE_*`, ERP onboarding workbooks
- Full `docs/agent/01–15` — distill into `docs/ai/`
- Investment / broker MCP tools (portfolio, options, option chain) — keep the MCP HTTP server and ledger tools only

**Bank / Plaid stay.** Settings → bank connections (Plaid) stay. ERP “Connections” / sync button go.

### 2.4 License

**AGPL.** Add `LICENSE` on the public repo. Contributors and deployers must understand network-use copyleft. Legal review of third-party deps vs AGPL is still required before first public push (not done in this plan).

### 2.5 Git: private `prod` vs public `oss`

| Item | Locked |
|------|--------|
| Private line | This repo / `prod` stays the full commercial tree |
| Public line | **New public GitHub remote.** Push **only** the `oss` branch (no `prod`, no other remotes’ branches) |
| How `oss` is created | `git checkout -b oss` from `prod`, then delete/thin, then publish |
| History | A normal branch still contains **old commits with deleted modules**. For a honestly thin public repo, the **first push to the public remote should be a squashed (or filter-repo) snapshot**—one (or few) commits that do not contain sales/ERP/investments blobs. Then develop on `oss` as usual |
| Ongoing | Cherry-pick platform fixes `prod` → `oss`. Do not merge `prod` into `oss`. Optional later: port OSS bookkeeping fixes back to `prod` as an explicit project |

### 2.6 Seed: `oss-books`

| Item | Locked |
|------|--------|
| Profile | `--demo-data=oss-books` → `backend/prisma/setup-OSS-BOOKS/` |
| Org | `org_oss_demo` |
| Entities | Demo may use one entity; **product supports many** |
| Users | `admin@example.com` / `admin123` + one bookkeeper |
| COA | ~40–60 accounts (checking, savings, credit card, income/expense) |
| Postings | ~3 months, ~80–120 lines: categorized, uncategorized, some AI scores |
| Reconcile fields | Bank-only statuses; no payment-receipt / invoice FKs |
| Currency | USD in the demo (product still has currency + FX) |
| Sample import | `samples/bank-statement-q1.csv` |
| Plaid | Seed does **not** require a live Plaid item; docs explain connect-your-own-bank |
| Excluded | customers, suppliers, items, invoices, POs, holdings, ERP connections |
| IDs | `docs/bookkeeping/SEED_REFERENCE.md` |

Do not use `indian-demo`, `perfin-demo` (no postings in script), `us-ca-demo`, or `nri` as OSS defaults.

### 2.7 Docs (OSS repo)

Every user-facing doc lists: sidebar path, models, API or report id, AI behavior, seed ids where relevant.

**User guide — four sessions only:** overview, common (filters/import), accounting (incl. Plaid + bank import), reports.

**AI docs:** chat, categorize, Workbench, LLM setup, bank/posting document extraction, MCP (API key + tools).

No sales, purchases, investments, or ERP sessions.

### 2.8 Navigation (v1.0.0)

```
Dashboard (chat-forward)
Workbench
Accounting
  - Transactions
  - Bank Transactions          (bank-account postings; CSV/PDF import + Plaid)
  - Chart of Accounts
  - Categories / Category Groups (only if still in schema for reports)
  - Opening Balances
  - Currency / Exchange Rates
Reports
  - Trial Balance, P&L, Cash Flow, Balance Sheet, Posting List
Settings
  - Users, Roles
  - Bank connections (Plaid)
  - Views, Permissions, AI templates (super-admin / framework)
```

No Sales, Purchases, Investments, or ERP connections. MCP is an API (`POST /api/mcp`), not a sidebar app.

### 2.9 Verification (Cursor Cloud Agent — not a laptop)

| Item | Locked |
|------|--------|
| Definition of done | Cloud Agent on the VM runs `npm run verify:oss` and it exits 0 |
| Command | Start Postgres (`docker-compose.verify.yml`) → `setup-db.js --demo-data=oss-books --skip-tests --env=test` → Jest API suite |
| Suite | Login, account list, posting CRUD, trial balance, balance sheet (accounting equation). Use real report ids the UI uses. Optional: MCP `list_accounts` / `get_trial_balance` with seed API key |
| Style | In-process HTTP (supertest) + seed admin JWT. No Playwright, no computerUse, no LLM in the default gate |
| DB | Committed `.env.test` → local Docker Postgres. **Never** `force-reset` Railway/prod |
| Optional | `verify:oss:ai` if LLM env is set; Plaid live tests only with Plaid sandbox secrets |
| Skill | `.cursor/skills/oss-verify/SKILL.md` linked from `AGENTS.md` |
| CI | Same `npm run verify:oss` |

### 2.10 Adding modules later

Merge or copy from private `prod` into `oss`, or a sibling repo. Not UI unhide.

| Module | Note |
|--------|------|
| Sales / purchases | Schema + UI + seeds come back together |
| ERP sync | Needs sales/purchases **and** Python/Airbyte/DBT — high cost |
| Investments | Separate slice |
| Extra MCP tools | Add later (e.g. more reports); v1.0.0 is ledger read-only |

---

## 3. AI in v1.0.0 (complete set)

| Capability | Ships | Does not ship |
|------------|-------|----------------|
| Conversational chat | Yes | — |
| Categorize postings (chat, bulk, import) | Yes | — |
| Workbench (categorize, book transactions) | Yes | Invoice/receipt match Workbench |
| Document extraction | Bank statement PDF/CSV → postings | Sales invoice / purchase bill extract |
| MCP | `list_accounts`, `get_trial_balance` (API key) | Investment / options tools |
| Reports via agent | `runFinancialReport`, analytics tools | — |
| LLM providers | Existing factory (Vertex, OpenAI, multi-model gateway, custom URL) | Hosted Fabriq LLM |

Tools **in:** `categorizePostings`, `searchRecords`, `advancedSqlQuery` (org-scoped; document the risk), `runFinancialReport`, `analyticsQuery`, `getAnalyticsContext`, session tools for Workbench.

Tools **out:** ERP connector, invoice PDF extract, prod reconcile-to-invoice, email, Slack.

---

## 4. Reports (v1.0.0)

Ship: trial balance, income statement (P&L), cash flow, balance sheet (use the same report id as the UI), posting list.

Personal-finance extras (net worth widgets, options income) — drop with investments unless a report is purely ledger-based and already used by the balance-sheet page.

---

## 5. Documentation tree (public repo)

```
LICENSE                         # AGPL
README.md                       # scope, AGPL, quickstart, not-included list
CONTRIBUTING.md
docs/
  README.md                     # OSS router
  OSS_RELEASE_PLAN.md           # this file (may stay for maintainers or move private)
  platform/                     # architecture, backend, frontend, auth, workflows, filters, import
  bookkeeping/                  # overview, COA, transactions, bank import, Plaid, categorize, opening balances, reports, SEED_REFERENCE
  ai/                           # overview, chat, categorize, workbench, LLM setup, document extraction, MCP
  deploy/                       # self-host, slim Docker (no Railway/ERP)
  user-guide/                   # 4 sessions only
```

---

## 6. What will work vs what must be fixed during the cut

**Works after a correct thin cut + `oss-books` + Plaid optional:**

- Setup, login, COA, journals, opening balances, CSV/PDF bank import
- Plaid Link + transaction sync → postings (with Plaid keys)
- Categorize (UI + chat + Workbench)
- Chat Q&A on the ledger
- Core reports
- Multi-entity selector (N entities)
- Super-admin views/permissions
- MCP `list_accounts` / `get_trial_balance` (API key)
- `verify:oss`

**Must be done in the cut (or it is not thin):**

| Issue | Fix |
|-------|-----|
| Generic REST still serves omitted models | Schema delete **and** model allowlist / no views for those models |
| Prisma relations on `account` to invoice/PO/holding | Remove those relations when models go |
| `setup-workflows` seeds PR/PO/invoice | OSS workflow seed: none of those flows |
| View JSON for omitted models | Delete from OSS `metadata/views` |
| Fat Dockerfile copies integrations | Slim Dockerfile |
| Bank Transactions assumes Plaid-only | Page works with imported bank postings; Plaid is an additional source |
| Prod reconcile agent | OSS templates only |
| Public git history still has deleted trees | Squash or filter-repo before first public push |
| `npm test` / `test:suite` | Replace with `verify:oss` |

---

## 7. Still open (small)

Everything in §2 is locked. Remaining:

1. **Legal pass** — AGPL vs existing dependencies (do before first public push).
2. **Secret / customer-data scrub** — CSVs and git history before the public remote exists.
3. **Whether `category` / `category_group` stay** — keep if reports need them; otherwise contra-account only.

**Resolved:** document extraction = bank statement PDF/CSV only (not invoices/receipts).

No other product-scope questions.

---

## 8. Implementation sequence

| Step | Action |
|------|--------|
| 1 | Path-level keep/delete list (schema, routes, views, tests, docs) |
| 2 | `LICENSE` (AGPL) + secret scrub plan |
| 3 | `git checkout -b oss` from `prod` |
| 4 | Thin all layers (schema, API allowlist, UI, Plaid kept, Zeiv gone) |
| 5 | OSS workflow + agent SQL seeds; `oss-books` + `SEED_REFERENCE.md` |
| 6 | OSS docs + four user-guide sessions |
| 7 | `verify:oss` + oss-verify skill + `.cursor/environment.json` (Docker Postgres) |
| 8 | Cloud Agent: `npm run verify:oss` must pass |
| 9 | Squash or filter history; add public remote; push **only** `oss` |
| 10 | Tag **v1.0.0** on the public repo |

---

## 9. Prompt for a path-level checklist (after this plan)

> Fabriq Books OSS v1.0.0: AGPL, thin at **all** layers (UI, API allowlist, Prisma, seeds, tests, Docker, docs). Keep bookkeeping, Plaid, agent (chat, categorize, Workbench, bank/posting document extract), MCP ledger tools (`list_accounts`, `get_trial_balance`). Delete sales, purchases, investments, ERP sync, Zeiv, investment MCP tools. Multi-entity supported. Seed `oss-books`. Public repo is a **new remote**, `oss` branch only, squashed/filtered history. Produce: (1) keep/delete path list, (2) Prisma models to remove vs keep, (3) `oss-books` file list, (4) `verify:oss` test steps, (5) doc file list with sidebar paths.

---

## 10. Related prod docs (private line)

| Topic | Doc |
|-------|-----|
| Architecture | `docs/ARCHITECTURE.md` |
| Bookkeeping | `docs/book-keeping/BOOKKEEPING_DOMAIN.md` |
| Import | `docs/IMPORT_FUNCTIONALITY.md` |
| Plaid | `docs/PLAID_INTEGRATION.md` |
| LLM providers | `docs/agent/10-LIBRARIES_AND_PROVIDERS.md` |
| Accounting UI | `docs/user-guide/05-accounting/README.md` |

---

*Update §2 when a locked item changes. Update §7 when an open item is resolved.*
