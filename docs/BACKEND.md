# Fabriq Backend Development Guide

**When to read**: Backend development, adding models, APIs, services
**Related docs**: [ARCHITECTURE.md](./ARCHITECTURE.md), [WORKFLOWS.md](./WORKFLOWS.md), [AI_AGENT.md](./AI_AGENT.md)

---

## Overview

**backend** is a TypeScript/Node.js backend that provides a **metadata-driven API framework** for the Fabriq financial management platform. It automatically generates REST and GraphQL APIs from Prisma schemas, with built-in authentication, RBAC permissions, workflow engine, and AI-powered document extraction.

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.x
- **Framework**: Express.js
- **GraphQL**: Apollo Server 4.x
- **ORM**: Prisma 5.x (PostgreSQL)
- **AI/LLM**: Google Vertex AI (Gemini), Vercel AI SDK
- **Authentication**: JWT + multi-provider (Local, Clerk, Auth0)
- **Logging**: Winston, Langfuse (tracing)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with DATABASE_URL, JWT_SECRET, GOOGLE_CLOUD_PROJECT_ID

# Initialize database (resets schema, loads metadata, workflows, and demo data)
node setup-db.js --demo-data=indian-demo --skip-tests

# Start development server (port 4000)
npm run dev
```

> **Note**: This project uses `prisma db push` (not migrations). The `setup-db.js` script handles schema sync, Prisma client generation, and all data setup automatically.

## Directory Structure

```
backend/
├── src/
│   ├── index.ts                    # Entry point - Express + Apollo setup
│   ├── config.ts                   # Environment configuration
│   │
│   ├── auth/                       # Authentication system
│   │   ├── middleware.ts           # JWT validation middleware
│   │   ├── routes.ts               # /api/auth/* endpoints
│   │   ├── types.ts                # AuthContext interface
│   │   └── adapters/               # Multi-provider adapters
│   │       ├── local.ts            # JWT-based internal auth
│   │       ├── clerk.ts            # Clerk OAuth adapter
│   │       └── factory.ts          # Adapter factory
│   │
│   ├── rest/                       # REST API layer
│   │   ├── routes.ts               # Auto-generated CRUD routes
│   │   ├── RestService.ts          # REST API business logic
│   │   └── middleware/
│   │       └── errorHandler.ts     # Global error handler
│   │
│   ├── schema/
│   │   └── SchemaBuilder.ts        # GraphQL schema generator
│   │
│   ├── models/
│   │   └── ModelRegistry.ts        # Entity definition registry
│   │
│   ├── services/
│   │   ├── core/
│   │   │   └── ModelService.ts     # Core CRUD + view-based access
│   │   ├── dal/
│   │   │   ├── DataAccessLayer.ts  # Prisma abstraction + org isolation
│   │   │   └── storage.ts          # GCS file storage
│   │   ├── permissions/
│   │   │   └── PermissionService.ts # RBAC engine
│   │   ├── query/
│   │   │   └── SearchQueryBuilder.ts # Filter → Prisma query builder
│   │   └── upload/
│   │       └── UploadService.ts    # File upload handling
│   │
│   ├── workflow-engine/            # State machine workflows
│   │   ├── core/
│   │   │   └── WorkflowEngine.ts   # Workflow execution
│   │   ├── routes.ts               # /api/workflow/* endpoints
│   │   └── types.ts                # Workflow types
│   │
│   ├── agent/                      # AI Agent system
│   │   ├── AgentService.ts         # Main LLM orchestrator
│   │   ├── AgentTools.ts           # Tool definitions for LLM
│   │   ├── GenericFunctions.ts     # CRUD tool implementations
│   │   ├── FunctionExecutor.ts     # Tool execution handler
│   │   └── routes.ts               # /api/agent/* endpoints
│   │
│   ├── lib/
│   │   ├── prisma.ts               # Prisma client singleton
│   │   ├── llm.ts                  # LLM service wrapper
│   │   └── extractors/             # PDF extraction
│   │       ├── base-extractor.ts   # Abstract extractor
│   │       ├── bank-statement-extractor.ts
│   │       └── invoice-extractor.ts
│   │
│   └── utils/
│       ├── PrismaSchemaParser.ts   # Parses .prisma → EntityDefinitions
│       └── gracefulShutdown.ts     # Cleanup handlers
│
├── prisma/
│   ├── schema/                     # Multi-file Prisma schema
│   │   ├── schema.prisma           # Base config + enums
│   │   ├── metadata.prisma         # Framework models (user, role, view)
│   │   ├── data.prisma             # Business models (invoice, supplier)
│   │   └── sales.prisma            # Sales models
│   ├── metadata/
│   │   └── views/                  # View JSON definitions
│   ├── setup-metadata.ts           # Load metadata to DB
│   └── setup-workflows.ts          # Create workflows
│
└── scripts/
    ├── generateToken.js            # Create test JWT
    └── generateTypes.ts            # Generate TypeScript types
```

## Key Commands

```bash
# Development
npm run dev                    # Start dev server with hot reload (port 4000)
npm run build                  # Compile TypeScript to dist/
npm start                      # Run production build

# Database (uses db push, NOT migrations)
npx prisma db push             # Sync schema to database
npx prisma generate            # Regenerate Prisma client
npx prisma studio              # Open database GUI
node setup-db.js               # Full setup: schema + metadata + workflows

# Testing
npm test                       # Run Jest tests
npm run test:watch             # Watch mode

# Metadata Management
npm run sync-metadata          # Sync local → database
npm run pull-metadata          # Pull database → local
```

## Core Concepts

### 1. Request Flow
```
Request → Auth Middleware → Route Handler → ModelService → PermissionService → DataAccessLayer → Prisma → Response
```

### 2. View-Based Access Control
Every data access goes through a **View** which defines:
- `model_name`: Which Prisma model
- `data_graph`: Which fields/relations to select (Prisma `select`). See [Datagraph Schema Reference](./datagraph-builder/DATAGRAPH_SCHEMA_REFERENCE.md) for property definitions.
- `permissions[]`: Field-level access (read/write/none)

```typescript
// User → Roles → RoleViews → Views → Permissions
View {
  id: "invoice_admin_view",
  model_name: "invoice",
  data_graph: {
    select: { id: true, amount: true, vendor: { select: { name: true } } }
  },
  permissions: [
    { field_name: "*", access: "write" }  // Wildcard grants all
  ]
}
```

### 3. Multi-Tenancy
- Every user has `org_id`
- `DataAccessLayer.addOrgFilter()` auto-adds `WHERE org_id = user.org_id` to all queries
- Models in `METADATA_MODELS_WITHOUT_ORG_FILTER` are exempt: `role`, `workflow_flow`, `workflow_state`, `workflow_action`, `view`, `permission`, `role_view`, `prompt_template`, `currency`
- **Currency is global platform data** — seeded once at `org_id = 'system'` via `prisma/seed-currencies.sql`, shared across all tenants. Adding a new globally-shared model requires adding it to this list in `DataAccessLayer.ts`.

### 4. Auto-Generated Routes
For every Prisma model, these routes are auto-created:
```
GET    /api/{model}                    → getAll
GET    /api/{model}/:id                → getById
POST   /api/{model}                    → create
PUT    /api/{model}/:id                → update
DELETE /api/{model}/:id                → delete
POST   /api/{model}/search             → search with filters
POST   /api/{model}/:id/:relation      → add child
DELETE /api/{model}/:id/:relation/:childId → remove child
```

### 5. Workflow Engine
State machine for approval processes:
```
WorkflowFlow → WorkflowState → WorkflowAction
               (Draft, Review)  (Submit, Approve)
```

Models with `wf_instance_id` field are workflow-enabled.

### 6. AI Agent
Natural language interface via `/api/agent/chat/stream`:
- Tools: `searchRecords`, `createRecord`, `updateRecord`, `deleteRecord`, `sqlQuery`
- Uses user's permissions
- Context-aware from page context

## Environment Variables

```bash
# Required
DATABASE_URL="postgresql://user:pass@localhost:5432/fabriq"
JWT_SECRET="your-secret-key"

# AI (for agent features)
GOOGLE_CLOUD_PROJECT_ID="your-project-id"
GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64="base64-encoded-key"

# Optional
PORT=4000
AUTH_PROVIDER=local  # local | clerk
REQUEST_BODY_LIMIT=25mb

# Demo database reset (POST /api/admin/demo-database-reset; Super Admin; Settings UI)
# In production set to true only if you intentionally expose this destructive API.
ALLOW_DEMO_RESET_API=true

# Developer options — metadata sync (POST /api/admin/dev-options/sync-metadata; Super Admin; Settings UI)
# In production set to true only if you intentionally expose this API (syncs views, prompt templates, agent template SQL).
ALLOW_DEV_OPTIONS_API=true
```

## Adding a New Model

1. **Add to Prisma schema** (`prisma/schema/data.prisma`):
```prisma
model vendor {
  id          String   @id @default(dbgenerated("'vend_' || gen_random_uuid()"))
  org_id      String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  name        String
  email       String?  @unique
  @@map("vendor")
}
```

2. **Push schema to database**:
```bash
npx prisma db push
npx prisma generate
```

3. **Create view** (add to `prisma/metadata/views/vendor_view.json`):
```json
{
  "id": "vendor_view",
  "name": "vendor_view",
  "model_name": "vendor",
  "data_graph": { "select": { "id": true, "name": true, "email": true } }
}
```

4. **Add permissions** via SQL or setup script

5. **Sync metadata**: `npm run sync-metadata`

→ Routes are auto-generated. No code changes needed!

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Login with email/password |
| `GET /api/{model}/view/{view}` | List records with view |
| `POST /api/{model}/view/{view}/search` | Search with filters |
| `GET /api/{model}/{id}/view/{view}` | Get single record |
| `POST /api/{model}/view/{view}` | Create record |
| `PUT /api/{model}/{id}/view/{view}` | Update record |
| `DELETE /api/{model}/{id}/view/{view}` | Delete record |
| `POST /api/agent/chat/stream` | AI chat (streaming) |
| `POST /api/parse-document/{model}` | PDF extraction |
| `POST /api/workflow/instances/{id}/actions/{actionId}` | Execute workflow action |
| `POST /api/admin/demo-database-reset` | Super Admin: start `setup-db.js` in background. Body: `demoData` (`indian-demo` \| `us-ca-demo` \| `perfin-demo` \| `both` \| `nri`), optional `demoDataOnly` (adds `--demo-data-only`), optional `runTests` (default false; true omits `--skip-tests` and runs `npm test -- src/__tests__`). Disabled when `ALLOW_DEMO_RESET_API` is false and `NODE_ENV=production`. Child stdout/stderr is printed to the backend process console (`[demo-database-reset/setup-db …]`). |
| `POST /api/admin/dev-options/sync-metadata` | Super Admin: selective metadata upsert. Body `{ targets: Array<'views' \| 'promptTemplates' \| 'agentTemplates' \| 'currencies' \| 'agentModelTools'> }` (at least one required). Views + prompt templates load from `prisma/metadata`; agent templates, currencies, and agent model tools run the matching `prisma/seed-*.sql` files through Prisma (no `npx`). Returns `{ success, message, stats }` with per-type counts. Disabled when `ALLOW_DEV_OPTIONS_API` is false and `NODE_ENV=production`. Cannot run concurrently with `demo-database-reset`. |
| `POST /api/admin/setup-chart-of-accounts` | Super Admin: runs `setupChartOfAccounts()` for a specific legal entity. Body: `entityId` (string), `coaTemplate` (`indian` \| `us-ca` \| `perfin` \| `nri-india` \| `nri-canada`). Returns `{ success, entityId, orgId, template, currency, counts: { created, existing, total } }`. Idempotent — existing accounts are preserved (upsert by deterministic ID). |
| `GET /api/admin/demo-data/indian-demo/status` | Super Admin: read-only counts for `org_indian_demo` reconciliation seed lines (`post_demo_*`). |
| `POST /api/admin/demo-data/indian-demo/reset-reconciliation` | Super Admin: reset indian-demo recon / categorization bank lines and confirm-created payment receipts only (`post_demo_*`). Reloads from `prisma/setup-IN/posting.csv`. Does not wipe FY journals or other orgs. |
| `GET /api/admin/demo-data/legal-entities?orgId=` | Super Admin: list legal entities (optional `orgId` filter) with invoice/posting/account counts. |
| `POST /api/admin/demo-data/legal-entities/:entityId/preview` | Super Admin: dry-run counts for dropping one legal entity and related transactions. |
| `POST /api/admin/demo-data/legal-entities/:entityId/drop` | Super Admin: drop one legal entity. Body `{ confirm: "<entityId>" }` must match. Deletes invoices/bills/postings/COA/org-structure for that entity; keeps tenant org and shared masters. |

## Search Query Filters

```typescript
// POST /api/invoice/view/invoice_view/search
{
  filters: [
    { field: "amount", operator: "gte", value: 1000 },
    { field: "status", operator: "in", value: ["pending", "approved"] },
    { field: "vendor.name", operator: "contains", value: "Acme" }
  ],
  page: 1,
  pageSize: 20,
  sortOption: "-created_at"  // - prefix = descending
}
```

**Operators**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `contains`, `startsWith`, `endsWith`, `is_null`, `some`, `every`, `none`

## Pagination

List search pages with `OFFSET`/`LIMIT` (`skip`/`take`). PostgreSQL returns a stable page only when `ORDER BY` ends in a key that is unique for each output row.

With no `ORDER BY`, row order is undefined and can change between requests. A sort on a non-unique column (`value_date`, `created_at`) leaves ties undefined, so the same `OFFSET` can skip or repeat rows. Transactions looked random for this reason: many postings share a `value_date`.

`SearchQueryBuilder.ensureStableOrderBy` and `DataAccessLayer` append `{ id: 'desc' }` when the sort does not already include `id`. `Master` sends `id` with the page's default sort.

```sql
ORDER BY value_date DESC, id DESC
```

The tiebreaker's direction does not affect stability. `id DESC` and `id ASC` are both stable.

### Pitfalls of `id` as the last sort key

Fabriq primary keys are `'prefix_' || gen_random_uuid()` varchars. `id` makes the order stable. It does not mean newest-first. Same-day rows stay in one order, and that order is the random UUID text order, not insert time. `created_at` is not a substitute: a bulk insert often shares one timestamp. Use a sequence or a time-ordered id when ties must follow entry time.

Other limits:

- The query errors if the result has no `id` column. In raw SQL, an unqualified `id` is ambiguous when more than one joined table has that column.
- A join that emits the same parent twice still ties. The last sort key has to be unique on the output row.
- An index on the leading column alone (`value_date`) does not order `id` inside each tie. Postgres sorts, or incremental-sorts within each group. Add `(value_date, id)` only when `EXPLAIN` shows that sort is expensive.
- A stable `ORDER BY` does not stop `OFFSET` pages from shifting when rows are inserted or deleted between requests. Keyset pagination holds the cursor on both columns: `WHERE (value_date, id) < ($1, $2)`.

## Database Schema Conventions

```prisma
model example {
  id          String   @id @default(dbgenerated("'exmp_' || gen_random_uuid()"))
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  org_id      String?              // Multi-tenancy
  assigned_to String?              // Task assignment
  wf_instance_id String?           // For workflow-enabled models
  
  // Your fields...
  
  @@map("example")  // Table name
}
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/index.ts` | Server bootstrap, route setup |
| `src/services/core/ModelService.ts` | All CRUD logic |
| `src/services/dal/DataAccessLayer.ts` | Prisma wrapper + org filtering + `METADATA_MODELS_WITHOUT_ORG_FILTER` |
| `src/services/permissions/PermissionService.ts` | RBAC logic |
| `src/rest/routes.ts` | Route generation |
| `src/rest/adminRouter.ts` | Super Admin API: onboard tenant, COA setup, sync metadata, DB reset |
| `src/auth/middleware.ts` | JWT validation |
| `src/agent/AgentService.ts` | AI chat handler |
| `src/metadata/syncMetadataFromJson.ts` | Metadata sync pipeline (views, prompts, currencies, agent templates) |
| `prisma/schema/*.prisma` | Database schema |
| `prisma/seed-currencies.sql` | 25 global currencies — upsert-safe, `org_id = 'system'` |
| `prisma/seed-agent-templates.sql` | Agent template seeds |
| `prisma/setup-chart-of-accounts.ts` | COA setup per legal entity + currency, returns `{ created, existing }` counts |
| `setup-db.js` | Database initialization script (Step 1.7 seeds global currencies) |

## Debugging Tips

- **Permission denied**: Check user → roles → role_views → views → permissions chain
- **Data not showing**: Verify `org_id` matches user's org
- **Workflow stuck**: Check `workflow_instance.current_state_id` and available actions
- **API errors**: Check Winston logs, enable `LOG_LEVEL=debug`
- **AI issues**: Check Langfuse traces (if enabled)

---

**Related Documentation:**
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [WORKFLOWS.md](./WORKFLOWS.md) - Workflow engine details
- [AI_AGENT.md](./AI_AGENT.md) - AI agent integration
- [AUTHENTICATION.md](./AUTHENTICATION.md) - Auth system

