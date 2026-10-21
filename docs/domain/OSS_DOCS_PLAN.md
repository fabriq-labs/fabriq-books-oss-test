# Plan: Open-source documentation for Fabriq Books

Feed this file to a coding agent as a single focused engagement (or one work package at a time). Pair it with [`OSS_TEST_PLAN.md`](./OSS_TEST_PLAN.md): both describe the same product on `fabriq-books`. Public docs and tests should stay aligned with **what exists in the tree today**.

---

## Context for the coding agent

### What you are documenting

**Fabriq Books** is an open-source multi-entity accounting application in this repository. It includes a chart of accounts, journal postings, financial reports, customers and suppliers, invoices, payment receipts, credit notes (including settlement applications), entity ledger default accounts, and **connections** that import data from external bookkeeping / ERP systems into Books.

The sales, tax, and settlement models are a **universal Books data model**. External systems map *into* that model. QuickBooks Online is the first connected system that ships today; it is an integration adapter, not the shape of the product. Do not write public docs as if Books were a QuickBooks companion app. Prefer product language (invoice, payment receipt, credit note, connection, sync) over vendor jargon except where a setup guide must name a specific connector.

Books is built with a **metadata-driven application kernel** that also lives in this repository: views, permissions, roles, tenancy, workflows, and the Master list. People who only run Books do not need to learn the engine. People who extend Books (or who build a different app on the same engine) read `docs/kernel/`.

### Document only what exists

Public documentation (root README, `docs/` hub, getting started, concepts, modules, operations, architecture) must describe **current, working functionality** only.

- Do **not** sprinkle “coming soon,” “not yet released,” work-package ids (WP6, WP7), or deferred design items through ordinary pages.
- Do **not** explain features by contrasting them with unfinished work.
- Optional: a single short **Future map** section (on the Books hub or README only) may list high-level directions. Keep it brief, non-committal, and free of internal ticket/WP jargon. Everywhere else: present tense, what the software does now.
- If a field exists in the schema but has no user-facing behavior yet, either omit it from user docs or describe only the behavior that actually works (for example: entity ledger default accounts are editable defaults; do not invent an automatic posting pipeline in the prose).

Internal design notes under `docs/domain/` (AR plans, agent plans) may keep roadmap language; they are not the public front door.

### What ships today (inventory for accuracy)

Use this as a checklist of topics the public docs *may* cover. If it is not here, do not invent it for users.

| Area | Available now |
|---|---|
| GL | Entities (including ledger default account fields and ledger start date in the entity UI), chart of accounts, postings / transactions, financial reports, opening-balances UI |
| Sales / AR | Universal model: customers, suppliers, items, tax masters / groups / regions, invoices, payment receipts, credit notes; Master lists and forms where seeded |
| Settlement | Payment receipt applications (signed amounts), credit-note applications; import pipeline resolves and cleans synced settlement rows for connected systems |
| Connections (end user) | Create/manage a connection, configure what to import, run sync, review imported books data in Books screens |
| Connections (setup) | One-time / admin plumbing that exists today for the QuickBooks path: Intuit app credentials, Airbyte workspace/connector, extraction config — keep this out of the main narrative |
| Platform | Metadata views/permissions, local auth demo user, single Docker image deploy path |

Design references for getting details right (not front-door reading): [`SALES_MODEL.md`](./SALES_MODEL.md) (universal model), [`AR_SETTLEMENT_AND_LEDGER.md`](./AR_SETTLEMENT_AND_LEDGER.md) (settlement behavior today), [`QUICKBOOKS_FORWARD_SYNC.md`](./QUICKBOOKS_FORWARD_SYNC.md) (QBO-specific operator detail — mine for the **setup** section, not as the voice of the product hub).

### Universal model; do not overfit QuickBooks

- README, concepts, sales/AR, and settlement docs describe **Books** objects and flows.
- When import matters, say “from a connected bookkeeping system” or “via a connection.” Name QuickBooks only when documenting the connector that exists today or in setup steps that are QBO-specific.
- Future map may mention additional ERPs / bookkeeping systems at a high level; do not rewrite today’s model docs around QBO field names (`CreditMemo`, `UndepositedFunds`, etc.) unless explaining a setup mapping table.

### Kernel docs stay domain-neutral

`docs/kernel/` documents the **metadata engine**. It must remain usable for any application built on the kernel—not only Books.

- Do **not** rewrite kernel pages to be “about Books.”
- Do **not** require Books product knowledge to understand kernel concepts.
- It is fine to use a Books model (for example `invoice` or `account`) as an *illustration* of a kernel feature (views, tenancy, forms), the same way any sample domain would. Label examples as examples.
- The Books hub may say the app is built on this kernel and link to `docs/kernel/`. The kernel index should present itself as the engine reference for builders of any domain, not as a Books appendix.

### Audience and voice (non-negotiable)

The documentation you produce is primarily for **human users**: evaluators, operators, and open-source contributors. Write in complete paragraphs with clear section headings. Explain *why* a convention exists when it would otherwise surprise a newcomer (for example: why forms are hand-written, why `prisma db push` is forbidden, why secrets stay out of `data_graph`).

Do **not** write the public README or `docs/` hub in the clipped “agent task brief” style (short imperative bullets with no context). That style remains appropriate only in agent-facing files (`AGENTS.md`, work-package plans, this plan).

Open-source readers should never encounter:

- Live tokens, real `DATABASE_URL` values, or customer realm ids
- Instructions that assume a private Railway project as the only deploy path without a local alternative
- Broken links to internal-only repos or prod branches presented as required reading

### Pitch (locked)

**Books-first** at the repository root and `docs/` hub on `fabriq-books`. Disclose the metadata kernel early and link to `docs/kernel/` for builders. Kernel documentation itself stays product-agnostic.

### How this relates to the kernel branch (`main`)

This repository has two long-lived lines:

| Branch | Product front door | Books docs |
|---|---|---|
| `fabriq-books` | Books (this plan) | Yes — hub, modules, connections, domain plans |
| `main` (kernel) | Metadata engine / framework | **No** — must stay free of Books product documentation |

**While WP-D0–D5 run on `fabriq-books`:** write Books pages under `docs/` (and a Books root README). Keep every change under `docs/kernel/` domain-neutral so those files can later land on `main` without dragging Books with them. Prefer Books-specific examples in Books pages (`docs/concepts.md`, `docs/modules/…`), not inside kernel pages. If a kernel page needs an illustration, use a generic sample model or a clearly labeled example that does not require the Books product tree.

**After WP-D0–D5 complete:** run **WP-D6** (below). That phase cherry-picks / ports the improved kernel docs (and shared ops such as deploy/database if still accurate for a kernel-only tree) from `fabriq-books` onto `main`, restores a **kernel** root README and `docs/README.md`, and **excludes** Books hub, modules, connections, architecture-as-Books, and `docs/domain/*` Books plans from `main`. Do not leave `main` with a Books homepage.

`docs/domain/AGENTS.md` on `main` today is a stub pointer; on `fabriq-books` it is the Books agent file. WP-D6 must not overwrite `main`’s thin domain stub with the full Books AGENTS unless maintainers explicitly want a one-line “see fabriq-books for the Books product.”

### Related plan

[`OSS_TEST_PLAN.md`](./OSS_TEST_PLAN.md) should test the same modules and behaviors the public docs describe on `fabriq-books`. If you rename a public module section, update the test plan’s module map in the same PR or leave a follow-up note in both files. Kernel-branch sync (WP-D6) is docs-only relative to `main`; it does not replace the test plan.

---

## Goals

1. Replace the kernel-first front door with a Books product front door **on `fabriq-books`**.
2. Give operators a path from clone → local run → first entity / chart / invoice list without reading the engine internals.
3. Give contributors a path to add a model/screen correctly (metadata first), with kernel docs as the deep dive for any domain.
4. Demote agent/design plans from the front door without deleting them.
5. Add OSS hygiene files if missing: `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` (or `docs/security` pointer), and a cleaned `.env.example`.
6. After the Books docs pass: sync portable kernel doc improvements to `main` without Books product docs (**WP-D6**).

---

## Non-goals

- Turning `docs/kernel/` into Books product documentation.
- Merging the full Books doc tree onto `main` (kernel branch must stay Books-free aside from optional one-line pointers).
- Framing Books as a QuickBooks-only product, or structuring the main docs around Airbyte / Intuit developer console steps.
- Documenting unfinished or planned features outside one optional Future map section.
- Implementing new product features in a docs engagement.
- Generating screenshots unless the task explicitly asks (placeholders / “add screenshot” captions are fine).
- Starting WP-D6 before WP-D0–D5 are accepted on `fabriq-books`.

---

## Target information architecture

```
README.md                          Books product: what it is, capabilities, quick start, license
CONTRIBUTING.md                    How to contribute (human)
SECURITY.md                        How to report vulnerabilities
LICENSE                            (confirm with maintainers if unset)

docs/
  README.md                        Books documentation hub (+ optional short Future map)
  getting-started.md               Install, setup:kernel, login, first steps
  concepts.md                      Product concepts in accounting language (current behavior)
  architecture.md                  How Books uses the metadata kernel → link docs/kernel/
  modules/
    ledger.md                      Entities, CoA, postings, reports, ledger defaults
    sales-ar.md                    Universal AR model: parties, invoices, receipts, credits, settlement
    connections.md                 End-user: connections, sync, reviewing imported data
  operations/
    deploy.md                      Single Docker image + deploy notes (humanized)
    database.md                    Schema apply, SQL deltas, seeds, no db push
    connections-setup.md           Admin/setup: Airbyte, Intuit app, extraction config (QBO path today)
  contributing-books.md            Optional deeper contributor guide (or fold into CONTRIBUTING.md)

  kernel/                          Domain-neutral engine docs (any app)
    README.md                      Metadata engine for builders; not Books-specific
    …existing files…

  domain/                          Design + agent plans (not the public hub)
    AGENTS.md                      Agent entry for Books product work
    AGENT_PLAN.md, AR_*, QBO_*     Keep; link from hub as “design / maintainers”
    OSS_DOCS_PLAN.md               This file
    OSS_TEST_PLAN.md               Sibling plan
```

Adjust names only if a clearer scheme emerges during implementation; update this plan’s tree in the same PR.

---

## Work packages

### WP-D0 — Inventory and redaction pass

**Do.**

1. List every markdown entry point a newcomer might open in the first five minutes (`README.md`, `docs/README.md`, `docs/domain/AGENTS.md`, backend/frontend READMEs).
2. Flag content that is wrong after the Books merge (for example kernel hub claims that this tree has no domain).
3. Flag secrets patterns, private URLs, and agent-only tone on front-door pages.
4. Confirm whether `LICENSE` exists; if not, stop and ask the human maintainer which license to add — do not invent one.

**Acceptance.** A short inventory checklist committed as a comment in the PR or as a temporary section in this file marked DONE.

#### WP-D0 inventory (DONE)

Recorded 2026-10-21 on `agentc/oss-books-docs-6a16`, branched from `agentc/oss-release-plans-6a16` (`c8b967e`), which already contains the `fabriq-books` product and this plan. No `LICENSE` file exists. Do not invent one.

**Entry points a newcomer opens in the first five minutes**

| File | What it said | Flag |
|---|---|---|
| `README.md` | Metadata-framework homepage. No Books capabilities, no sales model, no connections. | Rewrite as the Books front door (WP-D1). |
| `docs/README.md` | Titled “Kernel”. Says this documentation does not describe a domain, and that this branch has no domain seed. | False after the Books merge. Becomes the Books hub (WP-D2). The engine index moves to `docs/kernel/README.md` and stays domain-neutral (WP-D4). |
| `docs/domain/AGENTS.md` | Correct product pointer for agents. Agent-brief tone. Plans are the reading list; public docs are not linked yet. | Keep the agent tone. Point agents at the public docs once they exist (WP-D5). Demote this file from the human hub. |
| `backend/README.md` | Accurate API package guide, except “This branch does not include” a domain seed. | Fix that sentence. Point at the product getting-started guide without turning the file into a Books manual. |
| `frontend-0/README.md` | Describes “Zeiv Procure”, port 5173, Supabase, and Clerk. | Wrong product and wrong port. Replace with a short shell readme that points at the repository README. |
| `frontend-0/AGENTS.md` | Points “the index” at `docs/README.md`. Tells you to set `VITE_API_BASE_URL`. | After the hub rewrite, the shell index is `docs/kernel/README.md`. Local Vite already proxies `/api` to port 4000 when that variable is unset. |
| Root `AGENTS.md` | Kernel agent file. “Start at `docs/README.md`”. | Still the right first link once that file is the Books hub, with the engine index linked beside it. Do not add product procedures here. |

**Secrets, private URLs, and tone**

- `.env.example`, `backend/.env.example`, `frontend-0/.env.example`, and `backend/integrations/sync_service/.env.example` use local placeholders (`postgresql://kernel:kernel@localhost:5432/kernel_app`, `change-me-to-a-long-random-string`) and empty secret slots. No live tokens and no customer realm ids.
- The seeded login `admin@example.com` / `admin123` is the local demo user already printed by `seedKernel.ts`. It is not a customer credential.
- Design notes under `docs/domain/` use `"..."` placeholders in curl samples and mention `origin/prod`. They stay off the public front door.
- `docs/kernel/agent/MCP.md` uses the placeholder `your-api-key-here`.
- Root README and `docs/README.md` are written as engine briefs (tables, imperatives, little product context). Public replacements need complete paragraphs. Agent-brief tone stays in `AGENTS.md` and in this plan.
- `docs/infrastructure/BUILD_AND_DEPLOY.md` is operationally useful and contains no secrets. It still says this branch has no domain seed, and it presents Railway as the deploy story. Humanize a Books-facing copy under `docs/operations/deploy.md` and keep a local Docker path next to Railway.

**Confirmed against the tree (do not document past this)**

- Shell label in the checked-in `frontend-0/src/config/config.json` is “Kernel”. `frontend-0/config/fabriq/config.json` is the Fabriq Books brand; `node config/scripts/select-brand.js fabriq` copies it into `src/config`. `npm run dev` from the repo root does not run that switch.
- Sidebar groups in `frontend-0/src/domain/navigation.ts`: Sales (invoices, payments received, credit notes, customers, items), Purchases (suppliers), Tax (rates, groups, regions), Accounting (chart, transactions, opening balances, entities, exchange rates), Reports (trial balance, income statement, balance sheet, cash flow, posting list), Integrations (connections). Super Admin and Workbench remain kernel shell items.
- Create/edit forms exist for entities (including ledger default account dropdowns and ledger start date), accounts, postings, exchange rates, customers, items, suppliers, and tax masters/groups/regions. The invoice screen displays a stored invoice and its lines. Payment receipts and credit notes are Master lists.
- Entity ledger defaults are stored fields. `npm run ledger:prefill-entity-defaults` can fill empty ones from the chart. It does not post. There is no automatic sales-to-ledger poster in this tree.
- Settlement rows exist: signed `payment_receipt_application`, `credit_note_application` (direct allocation; the QuickBooks transform does not write it), balances, and a post-sync resolve / orphan sweep / void cleanup in the QuickBooks dbt project.
- Connections UI: list, QuickBooks credential form with test-before-save, connection detail with import run modes (import now, reprocess, pull only), import settings (Airbyte connection id and API client), optional default purchase account. Secrets stay out of `source_system_view`.
- Seeds: `setup:kernel` (shell), then `seed:gl`, `seed:entities`, `seed:sales` (views plus a few US tax regions), `seed:ar-settlement`, `seed:connections`. Optional data: `seed:coa` (`us-ca` or `india`), `seed:books-demo`.
- Fresh database: `setup:kernel` applies SQL generated from `prisma/schema` when `organizations` is missing. Dated files in `backend/prisma/migration/` are for databases that already have tables. `datalake_bootstrap.sql` is safe to re-run and is required before sync. Do not use `prisma db push` or `prisma migrate` as the routine path.
- One image (`Dockerfile`, Debian bookworm). Postgres is external. Sync listens on loopback inside the container when `ENABLE_SYNC_SERVICE` is true (the default).

---

### WP-D1 — Root README (Books)

**Do.** Rewrite root [`README.md`](../../README.md) to:

- Open with what Books is (multi-entity books / accounting app with a universal sales/AR model).
- Summarize **current** capabilities from the inventory table (present tense). Mention connections/import in product terms; do not lead with QuickBooks or Airbyte.
- One short subsection: built on a metadata-driven kernel, with a link to `docs/kernel/` (engine for this app and others).
- Local quick start (`install:all`, `setup:kernel`, `npm run dev`, ports, demo login) without dumping engine theory or connector setup.
- Link table to `docs/README.md` (Books hub), getting started, modules, operations, contributing.
- Optional: one short **Future map** paragraph or bullet list at the end—not mixed into the capability summary. Additional bookkeeping/ERP connectors is a reasonable Future map item.

**Acceptance.** A reader who knows accounting but not this repo can explain what the project does after reading the README alone, without being told about unfinished work packages.

**Voice.** Human prose. Complete sentences.

---

### WP-D2 — Docs hub and getting started

**Do.**

1. Rewrite [`docs/README.md`](../README.md) as the **Books** hub (not “Kernel”). Link modules, operations, architecture, and a clearly labeled section for the metadata engine pointing at `docs/kernel/`. Optional Future map lives only here or on the root README—not on every module page.
2. Add `docs/getting-started.md`: prerequisites (Node, Postgres), env files from examples, `setup:kernel`, optional domain seeds (`seed:gl`, `seed:sales`, `seed:ar-settlement`, `seed:entities`, `seed:connections`) with what each does, login, where to click first in the UI.
3. Add `docs/concepts.md`: entity, account, posting, customer, invoice, payment receipt, credit note, application (signed amounts), connection / source system — in **Books product language**, describing how they work today. Treat connection as “link to an external bookkeeping system,” not as a QuickBooks tutorial. Link design docs only for readers who want deeper settlement detail.

**Acceptance.** `docs/README.md` describes Books as the product documentation for this repository.

---

### WP-D3 — Module and operations guides

**Do.** Write:

- `docs/modules/ledger.md` — entities (including ledger default account dropdowns), chart, transactions, reports.
- `docs/modules/sales-ar.md` — universal AR: parties, tax, invoices, receipts, credit notes; settlement as subledger behavior today (applications, balances, documents that may be entered in Books or imported through a connection).
- `docs/modules/connections.md` — **end-user narrative**: what a connection is, connecting a system, choosing what to sync, running sync, where imported customers/invoices/payments appear in Books, how re-sync behaves at a high level. Stay in the UI story. Link out to setup for “before you can connect.”
- `docs/operations/connections-setup.md` — **setup / admin only**: creating an Intuit (or other) client app, Airbyte workspace and connector, extraction config, stream list, env vars, sync modes at the plumbing level. This is where QuickBooks-specific steps belong today. Structure the page so a later ERP can add a sibling subsection without rewriting the end-user module.
- `docs/operations/database.md` — `setup:kernel`, SQL deltas under `backend/prisma/migration/`, never `prisma db push` / `migrate` for routine work.
- `docs/operations/deploy.md` — humanized from [`BUILD_AND_DEPLOY.md`](../infrastructure/BUILD_AND_DEPLOY.md); keep Railway as one option, not the only story.

**Acceptance.** A bookkeeper can read `modules/connections.md` without opening Airbyte docs. A deployer can follow `operations/connections-setup.md` for the QBO path that exists today. Sales/AR docs do not read as QBO field manuals.

---

### WP-D4 — Architecture bridge + kernel index

**Do.**

1. Add `docs/architecture.md` (Books-facing): how this app uses views, permissions, Master lists, hand-written forms, and `org_id` / `org_system`. Link into `docs/kernel/` for the full engine story.
2. Ensure `docs/kernel/` has a clear index (reuse or restore a kernel README/index as needed). Frame it as the **metadata engine** for builders of any domain. Do not make Books the subject of kernel pages. Examples drawn from Books models are allowed when labeled as examples.
3. Fix any kernel page that currently says this repository’s docs “do not describe a domain” if that sentence sits in a place newcomers hit after the Books hub rewrite—prefer moving domain-product claims to the Books hub and leaving kernel docs domain-agnostic.

**Acceptance.** Books hub → architecture → kernel deep dive. Kernel docs remain understandable without reading Books module guides.

---

### WP-D5 — OSS hygiene and demotion of agent plans

**Do.**

1. Add `CONTRIBUTING.md` (branching from `fabriq-books`, metadata-first rule, seeds, no secret commits, link to docs).
2. Add `SECURITY.md` with a vulnerability reporting contact placeholder if maintainers have not provided one — mark clearly for human fill-in.
3. `LICENSE` — only with maintainer direction.
4. From the Books hub, link `docs/domain/*` plan/design files under “Design notes and agent plans (maintainers)” so they are findable but not primary.
5. Update [`docs/domain/AGENTS.md`](./AGENTS.md) to point agents at the new public docs for human tone/reference, and at this plan / the test plan for OSS work.

**Acceptance.** A GitHub visitor’s first three clicks stay in human Books docs that describe current software.

---

### WP-D6 — Sync kernel branch (`main`) from `fabriq-books` (after D0–D5)

**When.** Only after WP-D0–D5 are complete and merged on `fabriq-books`. This is a separate engagement / PR targeting `main` (or the agreed kernel release branch). Do not fold it into the Books docs PR.

**Goal.** Bring forward the improved **domain-neutral** documentation (especially `docs/kernel/` and any shared infrastructure docs that still apply to a kernel-only tree) while keeping the kernel branch **free of Books product docs**.

**Do.**

1. Diff `docs/kernel/` (and shared files such as `docs/infrastructure/BUILD_AND_DEPLOY.md`, security PDFs if touched) between `fabriq-books` and `main`. Cherry-pick or port only changes that remain valid without the Books domain.
2. Restore / keep a **kernel** root [`README.md`](../../README.md) and [`docs/README.md`](../README.md) on `main`: metadata framework front door, not Books. Different from the Books README on `fabriq-books` by design.
3. **Do not** copy onto `main`: `docs/getting-started.md` / `docs/concepts.md` / `docs/architecture.md` / `docs/modules/**` / `docs/operations/connections*.md` if they are Books-specific; Books `docs/domain/*` plans (AR, QBO, OSS Books plans) unless a maintainer asks for a single pointer file.
4. Ensure `docs/kernel/` on `main` has no Books-required narrative. Strip or rephrase any example that only makes sense with Books tables present if that would confuse a kernel-only clone.
5. Confirm `docs/domain/AGENTS.md` on `main` stays a minimal kernel/domain placeholder (or a one-liner pointing at `fabriq-books` for the Books product)—not the full Books AGENTS.
6. Open the PR against `main` with a checklist proving Books paths are absent.

**Acceptance.**

- `main` README presents the metadata kernel / framework.
- `fabriq-books` README presents Books.
- `git ls-tree` (or equivalent) on `main` shows no Books module hub (`docs/modules/sales-ar.md`, connections end-user guide, etc.).
- Kernel docs improvements from the Books work are present on `main` where they apply.

**Stop.** Do not merge Books application code onto `main` in this phase unless a separate, explicit product decision says so. Docs sync only.

---

## Order of operations

```
WP-D0 inventory
  └─► WP-D1 README (Books, on fabriq-books)
        └─► WP-D2 hub + getting-started + concepts
              ├─► WP-D3 modules + operations
              ├─► WP-D4 architecture + kernel index (domain-neutral)
              └─► WP-D5 hygiene + AGENTS links
                    └─► WP-D6 sync kernel branch (main)   ← after D0–D5 accepted
```

Prefer one PR per WP or a single PR with clear commits per WP for D0–D5 on `fabriq-books`. **WP-D6 is always a separate PR to `main`.** Coordinate naming with [`OSS_TEST_PLAN.md`](./OSS_TEST_PLAN.md) before merging the last Books docs WP.

---

## Review checklist (every Books docs PR on `fabriq-books`)

- [ ] No secrets, no private customer identifiers
- [ ] Public pages describe current behavior only (roadmap confined to optional Future map)
- [ ] Sales/AR and concepts stay universal; QBO not the product frame
- [ ] Airbyte / Intuit app / connector plumbing live under setup, not the main connections narrative
- [ ] `docs/kernel/` stays domain-neutral (portable to `main`; Books only as labeled examples)
- [ ] Books hub is the product front door on this branch; kernel is linked, not co-branded as Books
- [ ] Front-door prose is human-readable
- [ ] Links resolve
- [ ] Sibling test plan still matches module vocabulary

## Review checklist (WP-D6 PR on `main`)

- [ ] Root README and docs hub are kernel/framework, not Books
- [ ] No Books module / connections / domain plan tree copied onto `main`
- [ ] Cherry-picked kernel doc improvements still make sense without Books
- [ ] No secrets

---

## Stop conditions

- After **WP-D0–D5**: stop the Books docs engagement. Do not start the testing plan unless explicitly asked. Do not implement product features “while you are in the docs.”
- **WP-D6** is the follow-on phase once D0–D5 are done; run it only when asked to update the kernel branch from `fabriq-books`.
