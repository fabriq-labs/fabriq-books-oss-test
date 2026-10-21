# Plan: Open-source documentation for Fabriq Books

Feed this file to a coding agent as a single focused engagement (or one work package at a time). Pair it with [`OSS_TEST_PLAN.md`](./OSS_TEST_PLAN.md): both assume the same product cut on `fabriq-books` and the same honesty about what is and is not released.

---

## Context for the coding agent

### What you are releasing

**Fabriq Books** is an open-source multi-entity accounting application. It ships a chart of accounts, journal postings, financial reports, customers and suppliers, invoices, payment receipts, credit notes, and a QuickBooks Online forward-sync path (Airbyte extract → dbt transform → Books tables).

Books runs on a **metadata-driven application kernel** in the same repository: views, permissions, roles, tenancy, workflows, and the Master list. Contributors who only *use* Books do not need to master that engine. Contributors who *extend* Books (new models, new screens) must follow the kernel conventions.

### Locked product cut (do not oversell)

As of the `fabriq-books` tip that includes AR Phase 3 and WP5:

| In release | Out of this release (say so clearly) |
|---|---|
| GL: entities, CoA, postings, reports, opening balances UI | Phase 4 GL **poster** (`ledgerPosting.ts`, WP6–7) — schema and entity defaults exist; automatic posting after sync does **not** |
| Sales AR: customers, items, tax masters, invoices, receipts, credit notes (Master lists + forms where seeded) | Native “Receive payment” / “Apply credit” write UX beyond reads |
| Settlement subledger: signed `payment_receipt_application`, credit-note apps, resolver/orphan/void hooks in dbt | QBO Deposits, RefundReceipt, multi-currency FX legs on applications |
| Connections: QBO OAuth/config, Airbyte extraction config, sync trigger | Reverse sync (Books → QBO write-back as SoT) |
| Entity ledger default accounts + cutover date (UI dropdowns + prefill scripts) | Claiming trial-balance AR tie-out (T4) as shipped |

Design references (for accuracy, not as the public front door): [`AR_SETTLEMENT_AND_LEDGER.md`](./AR_SETTLEMENT_AND_LEDGER.md), [`AR_PHASE_3_4_IMPLEMENTATION.md`](./AR_PHASE_3_4_IMPLEMENTATION.md), [`SALES_MODEL.md`](./SALES_MODEL.md), [`QUICKBOOKS_FORWARD_SYNC.md`](./QUICKBOOKS_FORWARD_SYNC.md).

### Audience and voice (non-negotiable)

The documentation you produce is primarily for **human users**: evaluators, operators, and open-source contributors. Write in complete paragraphs with clear section headings. Explain *why* a convention exists when it would otherwise surprise a newcomer (for example: why forms are hand-written, why `prisma db push` is forbidden, why secrets stay out of `data_graph`).

Do **not** write the public README or `docs/` hub in the clipped “agent task brief” style (short imperative bullets with no context). That style remains appropriate only in agent-facing files (`AGENTS.md`, work-package plans, this plan).

Open-source readers should never encounter:

- Live tokens, real `DATABASE_URL` values, or customer realm ids
- Instructions that assume a private Railway project as the only deploy path without a local alternative
- Broken links to internal-only repos or prod branches presented as required reading

### Pitch (locked)

**Books-first.** The repository README and `docs/` root describe Books. The metadata kernel is disclosed early as the substrate, with a clear link into `docs/kernel/` for builders. Kernel is not co-equal on the homepage.

### Related plan

[`OSS_TEST_PLAN.md`](./OSS_TEST_PLAN.md) must stay consistent with the module names and “in / out of release” table above. If you rename a public doc section, update the test plan’s module map in the same PR or leave a follow-up note in both files.

---

## Goals

1. Replace the kernel-first front door with a Books product front door.
2. Give operators a path from clone → local run → first entity / chart / invoice list without reading the engine internals.
3. Give contributors a path to add a model/screen correctly (metadata first), with kernel docs as the deep dive.
4. Demote agent/design plans from the front door without deleting them.
5. Add OSS hygiene files if missing: `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` (or `docs/security` pointer), and a cleaned `.env.example`.

---

## Non-goals

- Rewriting every page under `docs/kernel/` into Books marketing voice.
- Implementing WP6–7 or documenting them as shipped.
- Generating screenshots unless the task explicitly asks (placeholders / “add screenshot” captions are fine).
- Changing runtime product behavior (docs-only engagement unless a link or seed description is factually wrong and needs a one-line fix).

---

## Target information architecture

```
README.md                          Books product: what it is, capabilities, quick start, license
CONTRIBUTING.md                    How to contribute (human)
SECURITY.md                        How to report vulnerabilities
LICENSE                            (confirm with maintainers if unset)

docs/
  README.md                        Books documentation hub
  getting-started.md               Install, setup:kernel, login, first steps
  concepts.md                      Product concepts in accounting language
  architecture.md                  Short: Books on the metadata kernel → link docs/kernel/
  modules/
    ledger.md                      Entities, CoA, postings, reports, ledger defaults
    sales-ar.md                    Customers, invoices, receipts, credit notes, settlement
    connections.md                 QBO / Airbyte / sync modes and stream list
  operations/
    deploy.md                      Single Docker image + deploy notes (humanized)
    database.md                    Schema apply, SQL deltas, seeds, no db push
  contributing-books.md            Optional deeper contributor guide (or fold into CONTRIBUTING.md)

  kernel/                          KEEP as engine reference; retitle its README
    README.md                      “Metadata engine Books runs on”
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
2. Flag content that is wrong after the Books merge (kernel-only claims like “this branch does not include a domain seed”).
3. Flag secrets patterns, private URLs, and agent-only tone on front-door pages.
4. Confirm whether `LICENSE` exists; if not, stop and ask the human maintainer which license to add — do not invent one.

**Acceptance.** A short inventory checklist committed as a comment in the PR or as a temporary section in this file marked DONE.

---

### WP-D1 — Root README (Books)

**Do.** Rewrite root [`README.md`](../../README.md) to:

- Open with what Books is (multi-entity books / accounting app).
- Summarize capabilities aligned with the locked cut table.
- One short subsection: “Built on a metadata-driven kernel” with link to `docs/kernel/`.
- Local quick start (`install:all`, `setup:kernel`, `npm run dev`, ports, demo login) without dumping engine theory.
- Link table to `docs/README.md` (Books hub), getting started, modules, operations, contributing.
- Honest “Not in this release” bullet list (poster, deposits, reverse sync).

**Acceptance.** A reader who knows accounting but not this repo can explain what the project does after reading the README alone.

**Voice.** Human prose. Complete sentences.

---

### WP-D2 — Docs hub and getting started

**Do.**

1. Rewrite [`docs/README.md`](../README.md) as the **Books** hub (not “Kernel”). Link modules, operations, architecture, and a clearly labeled “Metadata engine (advanced)” section pointing at `docs/kernel/`.
2. Add `docs/getting-started.md`: prerequisites (Node, Postgres), env files from examples, `setup:kernel`, optional domain seeds (`seed:gl`, `seed:sales`, `seed:ar-settlement`, `seed:entities`, `seed:connections`) with what each does, login, where to click first in the UI.
3. Add `docs/concepts.md`: entity, account, posting, customer, invoice, payment receipt, credit note, application (signed amounts), source system / connection — in product language. Point to design docs for deep settlement math.

**Acceptance.** `docs/README.md` no longer claims the repo documentation “does not describe a domain.”

---

### WP-D3 — Module and operations guides

**Do.** Write:

- `docs/modules/ledger.md` — entities (including ledger default account dropdowns), chart, transactions, reports.
- `docs/modules/sales-ar.md` — parties, tax, invoices, receipts, credit notes; settlement as subledger; `ledger_status` meaning without claiming auto-post.
- `docs/modules/connections.md` — connection Master vs custom actions; Airbyte streams to enable; sync modes; link to `QUICKBOOKS_FORWARD_SYNC.md` as operator deep dive.
- `docs/operations/database.md` — `setup:kernel`, SQL deltas under `backend/prisma/migration/`, never `prisma db push` / `migrate` for routine work.
- `docs/operations/deploy.md` — humanized from [`BUILD_AND_DEPLOY.md`](../infrastructure/BUILD_AND_DEPLOY.md); keep Railway as one option, not the only story.

**Acceptance.** Each module page states what is UI-editable vs sync-fed vs script-only.

---

### WP-D4 — Architecture bridge + kernel README

**Do.**

1. Add `docs/architecture.md`: one to two pages explaining view → permission → role → `/api/{model}/view/{view}`, Master lists, hand-written forms, `org_id` / `org_system`. End with links into `docs/kernel/metadata.md`, `adding-a-model.md`, `tenancy.md`, `BUILDING_A_DOMAIN.md`.
2. Retitle/rewriting the lead of [`docs/kernel/README.md`](../kernel/) index content currently in `docs/README.md`’s kernel section: kernel docs stay accurate for builders; first paragraph must say Books is the product in this repository and these pages are the engine reference.

**Acceptance.** No circular “start at kernel / start at Books” confusion: Books hub → architecture → kernel deep dive.

---

### WP-D5 — OSS hygiene and demotion of agent plans

**Do.**

1. Add `CONTRIBUTING.md` (branching from `fabriq-books`, metadata-first rule, seeds, no secret commits, link to docs).
2. Add `SECURITY.md` with a vulnerability reporting contact placeholder if maintainers have not provided one — mark clearly for human fill-in.
3. `LICENSE` — only with maintainer direction.
4. From the Books hub, link `docs/domain/*` plan/design files under “Design notes and agent plans (maintainers)” so they are findable but not primary.
5. Update [`docs/domain/AGENTS.md`](./AGENTS.md) to point agents at the new public docs for human tone/reference, and at this plan / the test plan for OSS work.

**Acceptance.** A GitHub visitor’s first three clicks stay in human Books docs.

---

## Order of operations

```
WP-D0 inventory
  └─► WP-D1 README
        └─► WP-D2 hub + getting-started + concepts
              ├─► WP-D3 modules + operations
              ├─► WP-D4 architecture + kernel bridge
              └─► WP-D5 hygiene + AGENTS links
```

Prefer one PR per WP or a single PR with clear commits per WP. Coordinate naming with [`OSS_TEST_PLAN.md`](./OSS_TEST_PLAN.md) before merging the last WP.

---

## Review checklist (every PR)

- [ ] No secrets, no private customer identifiers
- [ ] Locked cut table respected (no accidental “posts to GL automatically”)
- [ ] Kernel mentioned as substrate, not as the product name on the homepage
- [ ] Front-door prose is human-readable
- [ ] Links resolve
- [ ] Sibling test plan still matches module vocabulary

---

## Stop conditions

When WP-D0–D5 are done, stop. Do not start the testing plan in the same engagement unless explicitly asked. Do not implement product features “while you are in the docs.”
