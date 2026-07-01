# Fabriq API Server

TypeScript/Express backend for the [Fabriq Books](../README.md) monorepo. It provides a **metadata-driven API**: Prisma models drive auto-generated REST (and GraphQL) endpoints, with view-based RBAC, workflow engine, AI agent, document import, and ERP integrations.

**Deep development guide:** [docs/BACKEND.md](../docs/BACKEND.md) — this file is a quick entry point, not a duplicate of that guide.

---

## Monorepo context

| Package | Path | Dev port |
|---------|------|----------|
| API (this package) | `backend/` | **4000** |
| UI | `frontend-1/` | **5173** |

From the repo root, run API + UI together:

```bash
npm run dev
```

To run only the API:

```bash
cd backend && npm run dev
```

---

## Quick start

```bash
cd backend
npm install

# Create backend/.env with DATABASE_URL, JWT_SECRET (see docs/DEPLOYMENT.md)

# Schema + metadata + workflows + demo data
node setup-db.js --demo-data=indian-demo --skip-tests

npm run dev
```

Default login (after demo setup): `admin@example.com` / `admin123`

> Uses **`prisma db push`** (not migrations). `setup-db.js` syncs schema, generates the client, and loads metadata. See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

---

## Request flow

```
HTTP request
  → auth middleware (JWT / Clerk / etc.)
  → route handler (REST, workflow, agent, …)
  → ModelService + PermissionService (view + field access)
  → DataAccessLayer (org_id isolation)
  → Prisma → PostgreSQL
```

Every business-data path goes through a **View** (`model_name`, `data_graph`, field permissions). Do not bypass views for app CRUD.

---

## What lives in this package

```
backend/
├── src/
│   ├── index.ts              # Express + Apollo + route wiring
│   ├── auth/                 # JWT + provider adapters
│   ├── rest/                 # Auto-generated CRUD + search
│   ├── schema/               # GraphQL schema builder
│   ├── workflow-engine/      # Approval state machines
│   ├── agent/                # LLM agent, tools, Slack
│   ├── mcp/                  # MCP HTTP endpoint
│   ├── services/             # ModelService, DAL, permissions, uploads
│   └── lib/                  # Prisma, LLM, extractors, import extensions
├── prisma/schema/            # Multi-file Prisma models
├── prisma/metadata/views/    # View JSON definitions
├── setup-db.js               # Full DB bootstrap (see README-setup-db.md)
└── scripts/                  # Tokens, types, utilities
```

---

## API surface (where to read more)

| Area | Entry | Documentation |
|------|--------|----------------|
| **CRUD (app path)** | `/api/{model}/view/{viewId}` (+ `/search`) | [docs/BACKEND.md](../docs/BACKEND.md) |
| **Workflows** | `/api/workflow/*` | [docs/WORKFLOWS.md](../docs/WORKFLOWS.md) |
| **AI agent** | `/api/agent/*` | [docs/AI_AGENT.md](../docs/AI_AGENT.md), [docs/agent/](../docs/agent/) |
| **GraphQL** | `/graphql` | Secondary to REST; schema from Prisma via `SchemaBuilder` |
| **MCP** | `/api/mcp` | [docs/agent/MCP.md](../docs/agent/MCP.md) |
| **Import / PDF** | Import extensions, `/api/parse-document/*` | [docs/IMPORT_FUNCTIONALITY.md](../docs/IMPORT_FUNCTIONALITY.md), [src/lib/extractors/README.md](src/lib/extractors/README.md) |
| **Auth** | `/api/auth/*` | [docs/AUTHENTICATION.md](../docs/AUTHENTICATION.md) |

GraphQL supports introspection and nested reads; the **React app uses view-scoped REST**. Use GraphQL when you need ad hoc nested queries outside the view/datagraph path.

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with hot reload (port 4000) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run production build |
| `npm test` | Jest tests |
| `npm run sync-metadata` | Push local view/metadata JSON → database |
| `npm run pull-metadata` | Pull database → local metadata files |
| `npm run apply-views` | Apply SQL database views |
| `npm run generate-types` | Generate TypeScript types from schema |

Database: `npx prisma db push`, `npx prisma generate`, `npx prisma studio`

---

## Documentation

| Task | Document |
|------|----------|
| Add models, APIs, services | [docs/BACKEND.md](../docs/BACKEND.md) |
| System architecture | [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) |
| Deploy / env / demo data | [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) |
| Seed data only, remove org, CLI flags | [README-setup-db.md](README-setup-db.md) |
| Auth providers | [docs/AUTHENTICATION.md](../docs/AUTHENTICATION.md) |
| Business modules & rules | [docs/BUSINESS_DOMAIN.md](../docs/BUSINESS_DOMAIN.md) |
| Full docs index | [docs/CLAUDE.md](../docs/CLAUDE.md) |

---

## Environment (minimum)

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/fabriq"
JWT_SECRET="your-secret-key"
```

Optional: `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64` (agent + PDF extraction), `AUTH_PROVIDER=local|clerk`, `BACKEND_PORT=4000`.

See [docs/BACKEND.md#environment-variables](../docs/BACKEND.md) and [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
