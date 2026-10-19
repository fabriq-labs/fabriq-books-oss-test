# Database setup (`setup-db.js`)

Cross-platform script to bootstrap the Fabriq database: schema sync, metadata, workflows, and optional demo seed data.

**Script:** `backend/setup-db.js`  
**Prerequisites:** PostgreSQL running, `DATABASE_URL` set in `backend/.env`

Default login after Indian demo: `admin@example.com` / `admin123`

---

## Seed data only (no schema or metadata changes)

Use this when the database already has schema, metadata, and workflows, and you only want to load (or reload) org-scoped demo data.

```bash
cd backend
node setup-db.js --demo-data-only --demo-data=indian-demo --skip-tests
```

`--demo-data-only` (alias `--org-only`) **skips**:

- `prisma db push --force-reset` (no DDL / no data wipe)
- Metadata setup (`setup-metadata.ts`)
- Workflow setup (`setup-workflows.ts`)
- Test execution

It **still runs**:

- `prisma generate` (TypeScript client only — no database changes)
- Reporting views check (`applyDatabaseViews.ts`)
- Demo data loaders under `prisma/setup-`*

### Demo datasets


| Demo                | Command                                                                  | Primary org id    |
| ------------------- | ------------------------------------------------------------------------ | ----------------- |
| Indian              | `node setup-db.js --demo-data-only --demo-data=indian-demo --skip-tests` | `org_indian_demo` |
| US-CA               | `node setup-db.js --demo-data-only --demo-data=us-ca-demo --skip-tests`  | `org_techflow_us` |
| Personal Finance    | `node setup-db.js --demo-data-only --demo-data=perfin-demo --skip-tests` | `org_perfin_demo` |
| NRI (Rajesh Menon)  | `node setup-db.js --demo-data-only --demo-data=nri --skip-tests`         | `org_rajesh`      |
| Both Indian + US-CA | `node setup-db.js --demo-data-only --demo-data=both --skip-tests`        | see above         |
| Skip demo data      | `node setup-db.js --demo-data-only --demo-data=skip --skip-tests`        | —                 |


**Note:** The Indian demo also creates related orgs: `org_mumbai_branch`, `org_bangalore_office`, `org_us_office`.

---

## Full setup from scratch (destructive)

Wipes the entire database, reapplies schema, metadata, workflows, and demo data. Use only on empty or disposable databases.

```bash
cd backend
node setup-db.js --demo-data=indian-demo --skip-tests
```

Swap `indian-demo` for `us-ca-demo`, `perfin-demo`, `nri`, `both`, or `skip`.

---

## Remove all data for one org

Deletes every record scoped by `org_id`, then the `org` row. Does **not** touch global metadata (roles, views, workflows) or schema.

**Preview (dry run):**

```bash
cd backend
npm run remove-tenant-data -- org_indian_demo
```

**Delete:**

```bash
cd backend
npm run remove-tenant-data -- org_indian_demo --confirm
```

Equivalent without npm script:

```bash
cd backend
npx ts-node prisma/remove-tenant-data.ts org_indian_demo --confirm
```

## Remove one legal entity (and related transactions)

Deletes invoices, bills, postings, COA accounts, org-structure, and the `entity` row for one legal entity. Keeps the tenant `org` and shared masters (customers, suppliers, items, users).

**Preview:**

```bash
cd backend
npm run remove-tenant-data -- --legal-entity=org_mumbai_branch
```

**Delete:**

```bash
cd backend
npm run remove-tenant-data -- --legal-entity=org_mumbai_branch --confirm
```

Also available in the UI: **Super Admin → Demo Data Management** (`/settings/demo-data`).

### Org ids by demo


| Demo              | org id(s)                                                    |
| ----------------- | ------------------------------------------------------------ |
| Indian (main)     | `org_indian_demo`                                            |
| Indian (branches) | `org_mumbai_branch`, `org_bangalore_office`, `org_us_office` |
| US-CA             | `org_techflow_us`                                            |
| Personal Finance  | `org_perfin_demo`                                            |
| NRI (Rajesh Menon)  | `org_rajesh` — login `rajesh.menon@gmail.com` / `admin123` |


---











































































































































































q

























## Reset transaction data only

Clears AI categorization fields and agent sessions. For Indian demo, also drops and re-creates postings from CSV. Does not change schema or re-seed org master data.

```bash
cd backend
node setup-db.js --reset-transactions --demo-data=indian-demo
```

Use `--demo-data=0` to clear AI fields and agent sessions only (no posting reset).

---

## Typical workflow

```bash
# 1. Add one org's seed data to an existing DB
cd backend && node setup-db.js --demo-data-only --demo-data=indian-demo --skip-tests

# 2. Later, remove that org's data
cd backend && npm run remove-tenant-data -- org_indian_demo --confirm
```

---

## CLI reference


| Option                 | Alias               | Description                                                                     |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `--demo-data=<name>`   | —                   | Demo dataset: `indian-demo`, `us-ca-demo`, `perfin-demo`, `nri`, `both`, `skip` |
| `--demo-data-only`     | `--org-only`        | Seed data only; no schema or metadata changes                                   |
| `--skip-tests`         | `--no-tests`        | Skip Jest after setup                                                           |
| `--reset-transactions` | `--reset-tx`        | Reset AI/agent/posting state (implies `--demo-data-only`)                       |
| `--env=<file>`         | `--env-file=<file>` | Load alternate env (e.g. `--env=test` → `.env.test`)                            |
| `--run-tests=0`        | —                   | Skip tests (default is to run tests on full setup)                              |


---

## Related docs


| Topic                             | Document                                                             |
| --------------------------------- | -------------------------------------------------------------------- |
| Image and Railway deploy | [docs/infrastructure/BUILD_AND_DEPLOY.md](../docs/infrastructure/BUILD_AND_DEPLOY.md) |
| Indian demo details               | [prisma/setup-IN/README.md](prisma/setup-IN/README.md)               |
| US-CA demo                        | [prisma/setup-US_CA/README.md](prisma/setup-US_CA/README.md)         |
| Personal Finance demo             | [prisma/setup-PERFIN/README.md](prisma/setup-PERFIN/README.md)       |
| NRI demo                          | [prisma/setup-NRI/README.md](prisma/setup-NRI/README.md)             |
| Test data (separate script)       | [prisma/README-setup-test-data.md](prisma/README-setup-test-data.md) |


