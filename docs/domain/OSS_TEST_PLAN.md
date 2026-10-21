# Plan: Open-source test harness for Kernel + Fabriq Books

Feed this file to a coding agent as a single focused engagement (or one work package at a time). Pair it with [`OSS_DOCS_PLAN.md`](./OSS_DOCS_PLAN.md): suites must prove what the public docs describe as **available now**. Do not write tests for behavior that does not exist in the product yet.

---

## Context for the coding agent

### Why this exists

Fabriq Books is being prepared for open source on `fabriq-books`. Outside contributors and CI need a **stable, extendable** way to prove:

1. The **metadata kernel** still works (auth, tenancy, views, permissions, Master/UI shell).
2. The **Books product** still works on top of that kernel (ledger, sales AR, connections, settlement invariants).

Today the repo has fragmented Jest unit tests, outdated sales-order workflow notes, and Playwright specs aimed at an older workbench flow (hard-coded demo users, port `5173`). That is not an open-source quality bar.

### What to cover (match the docs plan inventory)

Test the behaviors public docs will describe:

| Cover | Leave out of default suites |
|---|---|
| Login as seeded local admin | Treating Clerk-only production auth as the only path |
| Kernel view CRUD + org scoping | Postgres RLS (not implemented) |
| Entity ledger default account fields round-trip via view API + Entity form UI | Automatic GL posting after sync (not implemented) |
| Invoice / receipt / credit note Master lists load | Live Airbyte extract against real QBO in default CI |
| Settlement row shape / signed applications where fixtures exist | Full OAuth browser dance in default CI |
| Connection secrets redacted from view payloads | Features that exist only in design docs / future map |

### Design mandate (think before coding)

Before writing the first spec, produce a short **harness design note** (in-PR markdown or `docs/domain/TESTING.md` draft) that answers:

1. **Layers** — What runs as unit, API integration, Playwright UI, and optional sync/dbt? What is skipped in default PR CI vs nightly?
2. **Fixtures** — How is the database created and seeded so tests are hermetic? How are orgs and users isolated?
3. **Shared helpers** — Auth token, view API client, Playwright login, Master navigation, form fill patterns. Kernel helpers must not import Books; Books helpers may import kernel.
4. **Extension model** — Exact steps for a future contributor to add tests for a new Books module (folder, naming, registration in a manifest or `index`, CI job inclusion).
5. **Open-source constraints** — No real credentials in the repo; `.env.test.example` only; deterministic seeds; flaky UI avoided (prefer roleId / accessible roles over brittle CSS).

Do not invent a second parallel framework if Jest + Playwright can cover the layers with a clean `tests/` or package-local layout. Prefer boring, documented structure over novelty.

### Voice for any human-facing testing docs

`docs/domain/TESTING.md` (or equivalent) is for human contributors. Write clear prose. Agent-style task briefs belong in this plan file, not in the contributor guide.

### Related plan

Keep module names aligned with [`OSS_DOCS_PLAN.md`](./OSS_DOCS_PLAN.md) (`ledger`, `sales-ar`, `connections`).

---

## Goals

1. Establish a **kernel** automated suite (API + Playwright) that any domain on this engine can rely on.
2. Establish a **Books** suite that builds on kernel helpers and covers the locked product cut.
3. Make the layout **extendable**: new feature → new folder + fixtures + registration, without rewriting the harness.
4. Wire **CI** so PRs run fast critical path tests; expensive sync tests are optional/gated.
5. Remove or quarantine obsolete tests that reference dead ports, private passwords, or removed workflows.

---

## Non-goals

- Implementing new product features only to make them testable.
- Full visual regression / screenshot golden files in the first pass (optional later).
- Requiring a live QuickBooks company for PR CI.
- 100% line coverage as a vanity target; prefer critical paths and accounting invariants.
- Kernel suites that import Books product modules (kernel must stay usable for any domain).

---

## Proposed layout (agent may refine in the design note)

One workable shape (adjust if justified in the design note):

```
tests/                              # or split under backend/ + frontend-0/ with shared package
  README.md                         Human guide: how to run, how to add a suite
  harness/
    env.ts                          Load .env.test, assert required vars
    db.ts                           Migrate/seed strategy for test DB
    seed/
      kernel.ts                     org_system + admin + shell views
      books-minimal.ts              entity, currency, a few accounts, sample AR docs
    api/
      client.ts                     fetch wrapper with auth
      auth.ts                       login helper → token
    ui/
      playwright.config.ts          baseURL 5174, webServer, storageState
      auth.setup.ts                 login once → storage state
      master.ts                     open Master list by model/view
      form.ts                       common save/toast helpers
  kernel/
    api/
      auth.spec.ts
      tenancy.spec.ts
      view-crud.spec.ts
      permissions.spec.ts
    ui/
      login.spec.ts
      master-list.spec.ts
      shell-nav.spec.ts
  books/
    api/
      entity-ledger-defaults.spec.ts
      account-posting.spec.ts
      sales-views.spec.ts
      settlement-invariants.spec.ts
      connections-redaction.spec.ts
    ui/
      entity-ledger-form.spec.ts
      invoice-list.spec.ts
      connections-smoke.spec.ts
  manifests/
    suites.json                     Optional registry for CI matrix / docs generation
```

If keeping tests beside packages is preferred (`backend/src/__tests__/kernel`, `frontend-0/e2e/kernel`), the same layering and “Books imports kernel helpers” rule still applies. Document the choice.

---

## Framework expectations

### API tests

- Talk to a running API (test lifecycle starts API + DB, or uses a documented docker-compose test stack).
- Prefer HTTP against `/api/...` over reaching into Prisma for *behavior* assertions; Prisma is fine for fixture setup and invariant SQL.
- Always filter / assert `org_id` behavior for private models; shareable models visible for caller org or `org_system`.

### Playwright UI tests

- Target Books UI port **5174** (fix existing `frontend-0/playwright.config.ts`).
- Use `storageState` from a setup project; do not paste passwords into every spec.
- Prefer role/label/`data-testid` where you add them; when editing Books forms for testability, keep changes minimal and accessible.
- One browser (Chromium) is enough for the first release; note how to add Firefox/WebKit later.

### Settlement / accounting invariants

Encode named checks that match **current** settlement behavior (see design docs for formulas, but only assert what the app/dbt already enforce):

- Receipt amount = sum of applications + unapplied (signed apps).
- Invoice / credit-note balance relationships consistent with applications (document expected strictness if sync snapshots differ).

### Extensibility contract

Document this recipe for humans:

1. Add `tests/books/<module>/...` (api + optional ui).
2. Reuse `harness/api` and `harness/ui`.
3. Register the suite in the manifest / CI job list.
4. If the module introduces a new Master view, add at least: list loads, create or open row, field from `data_graph` visible.
5. Kernel suites must remain green with Books tests deleted (no accidental coupling).

---

## Work packages

### WP-T0 — Design note + inventory

**Do.**

1. Inventory existing Jest and Playwright tests; mark keep / rewrite / delete.
2. Write the harness design note (answers in “Design mandate”).
3. Agree folder layout and CI commands in that note.
4. Add `.env.test.example` with placeholder `DATABASE_URL`, no secrets.

**Acceptance.** Design note merged or attached; obsolete hard-coded third-party demo passwords not used by any test you keep.

**Stop.** No large suite rewrite until the design note exists.

---

### WP-T1 — Harness (DB, seed, API client, Playwright auth)

**Do.**

1. Implement test DB bootstrap compatible with repo rules: **do not** use `prisma db push` as the documented happy path; prefer `setup:kernel` + SQL deltas already in `backend/prisma/migration/` (or a scripted apply of those files).
2. Seed kernel admin (`admin@example.com` / documented test password from seed — local only).
3. API client + login helper.
4. Playwright config: port 5174, setup project writing `storageState`, reuseExistingServer for local.
5. `tests/README.md` (human) with run instructions.

**Acceptance.** A single smoke API login test and a single Playwright “lands on home after auth” test pass locally with documented commands.

---

### WP-T2 — Kernel API suite

**Do.** Cover at least:

- Login success / failure
- Unauthenticated access rejected on a protected view route
- Shareable vs private tenancy behavior on a known model (e.g. `view` / `currency` vs a private Books table if seed provides one — prefer a kernel-native private table if available)
- View GET list + GET by id + PUT round-trip on a simple kernel or Books-neutral model
- Permission denial when role lacks access (fixture role)

**Acceptance.** Suite runs under `npm run test:kernel:api` (or equivalent name documented in README).

---

### WP-T3 — Kernel Playwright suite

**Do.** Cover at least:

- Login form (if used) or cookie/storage auth path consistent with the app
- Navigate to a Master list that exists on shell seed
- List renders columns from `data_graph`
- Open create or edit route for a simple form if one exists on kernel seed; otherwise stop at list and document the gap

**Acceptance.** `npm run test:kernel:ui` (name documented). Stable on CI with retries ≤ 2.

---

### WP-T4 — Books API suite

**Do.** Build on kernel harness:

- `entity` view returns ledger default account relations; PUT updates `default_receivable_account_id` / `ledger_start_date`
- `account` / `posting` views list for seeded org
- `invoice`, `payment_receipt`, `credit_note` views list (seed or minimal fixture insert)
- Settlement invariants T1–T3 against fixtures (create via Prisma/SQL in harness, assert via API or SQL)
- `source_system` / connection view does **not** expose raw oauth secrets in GET payloads (assert absences)

**Acceptance.** `npm run test:books:api`. Failures message which invariant broke.

---

### WP-T5 — Books Playwright suite

**Do.**

- Entity form: ledger defaults section visible; select an account from SearchDropDown; save; reload shows value
- Invoice list (Master or domain list) loads for seeded data
- Connections page smoke: list or detail renders without leaking secrets in DOM (basic assertion)

**Acceptance.** `npm run test:books:ui`. Uses same `storageState` as kernel UI.

---

### WP-T6 — CI wiring + quarantine

**Do.**

1. Add GitHub Actions (or document why existing CI is extended) running kernel+books API on PR; UI jobs with Playwright browsers cached.
2. Gate sync/dbt or live QBO behind `workflow_dispatch` / nightly / secret presence.
3. Delete or move obsolete workbench e2e and dead workflow test docs so newcomers are not misled.
4. Cross-link `docs/domain/TESTING.md` from `CONTRIBUTING.md` / Books docs hub (coordinate with docs plan WP-D5).

**Acceptance.** A PR checklist entry: “kernel + books tests green.” CI badge optional.

---

## Order of operations

```
WP-T0 design + inventory
  └─► WP-T1 harness
        ├─► WP-T2 kernel API
        ├─► WP-T3 kernel UI
        │     └─► WP-T5 books UI (needs harness UI)
        └─► WP-T4 books API
              └─► WP-T6 CI + quarantine
```

WP-T2 and WP-T3 can proceed in parallel after WP-T1. WP-T4 can start after WP-T1 without waiting for UI.

---

## Open-source review checklist

- [ ] No real credentials committed
- [ ] Default CI does not need QBO or Airbyte
- [ ] Kernel tests do not import Books modules
- [ ] Extension recipe documented for humans
- [ ] Assertions match OSS docs “in release” table
- [ ] Flaky selectors minimized; failures are actionable

---

## Stop conditions

When WP-T0–T6 are done for current product behavior, stop. Do not expand into unimplemented features. If the docs plan renames modules mid-flight, update this plan’s paths in the same change set.
