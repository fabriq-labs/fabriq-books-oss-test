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
- `data_graph`: Which fields/relations to select (Prisma `select`)
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
- DataAccessLayer auto-adds `WHERE org_id = user.org_id`
- Metadata models (role, view) are exempt

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
| `src/services/dal/DataAccessLayer.ts` | Prisma wrapper + org filtering |
| `src/services/permissions/PermissionService.ts` | RBAC logic |
| `src/rest/routes.ts` | Route generation |
| `src/auth/middleware.ts` | JWT validation |
| `src/agent/AgentService.ts` | AI chat handler |
| `prisma/schema/*.prisma` | Database schema |
| `setup-db.js` | Database initialization script |

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

