# Fabriq Financial Suite - AI Context Guide

**Last Updated**: 2026-01-06

---

## Quick Reference

| Aspect | Details |
|--------|---------|
| **Tech Stack** | Node.js/Express, React/Vite, PostgreSQL/Prisma |
| **Pattern** | Metadata-driven CRUD generation |
| **Auth** | JWT with adapter pattern (local/clerk/supertokens) |
| **Backend Port** | 4000 |
| **Frontend Port** | 5173 |

### Default Credentials
```
Email: admin@example.com
Password: admin123
```

### Common Commands
```bash
# Backend
cd backend && npm run dev              # Start backend (port 4000)
node setup-db.js --demo-data=indian-demo  # Setup database
npx prisma studio                      # View database

# Frontend
cd frontend-1 && npm run dev           # Start frontend (port 5173)
```

---

## Documentation Router

**Choose the right document based on your task:**

| Question / Task | Document |
|-----------------|----------|
| How does the system architecture work? | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| Backend development (adding models, APIs) | [docs/BACKEND.md](./docs/BACKEND.md) |
| Frontend development (adding pages, forms) | [docs/FRONTEND.md](./docs/FRONTEND.md) |
| Setting up / deploying the system | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) |
| Container image build & run (Dockerfile, GHCR, compose) | [docs/BUILD_AND_DEPLOY.md](./docs/BUILD_AND_DEPLOY.md) |
| Railway: Artifact Registry image + Vertex/Gemini auth | [docs/RAILWAY_ARTIFACT_REGISTRY_VERTEX.md](./docs/RAILWAY_ARTIFACT_REGISTRY_VERTEX.md) |
| Authentication issues or changes | [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md) |
| Workflow engine questions | [docs/WORKFLOWS.md](./docs/WORKFLOWS.md) |
| AI agent / LLM integration | [docs/AI_AGENT.md](./docs/AI_AGENT.md) |
| **Workbench backend — onboarding reference** | [docs/agent/WORKBENCH_BACKEND.md](./docs/agent/WORKBENCH_BACKEND.md) |
| Diagnose a failed/stuck agent session | [docs/agent/debugging/SESSION_FAILURE_PATTERNS.md](./docs/agent/debugging/SESSION_FAILURE_PATTERNS.md) |
| Workbench — categorise expenses deep dive | [docs/agent/WORKBENCH_CATEGORIZE_EXPENSES.md](./docs/agent/WORKBENCH_CATEGORIZE_EXPENSES.md) |
| Reconciliation tool (bank ↔ receipts/invoices) | [docs/agent/RECONCILIATION_TOOL.md](./docs/agent/RECONCILIATION_TOOL.md) |
| AI transaction categorization | [docs/AI_AUTO_CATEGORIZATION.md](./docs/AI_Categorizer.md) |
| Business rules / modules | [docs/BUSINESS_DOMAIN.md](./docs/BUSINESS_DOMAIN.md) |
| ERP integrations (forward/reverse sync) | [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) |
| Import functionality (CSV/PDF upload) | [docs/IMPORT_FUNCTIONALITY.md](./docs/IMPORT_FUNCTIONALITY.md) |
| Agentic upgrade (sessions, pending actions, workbench) | [docs/AGENTIC_UPGRADE_IMPLEMENTATION.md](./docs/AGENTIC_UPGRADE_IMPLEMENTATION.md) |
| Agentic upgrade v1 design plan | [docs/AGENTIC_UPGRADE_PLAN_WIP.md](./docs/AGENTIC_UPGRADE_PLAN_WIP.md) |
| Agentic upgrade v2 (hybrid execution, builders) | [docs/AGENTIC_UPGRADE_V2_PLAN.md](./docs/AGENTIC_UPGRADE_V2_PLAN.md) |
| Workbench functional spec | [docs/agent/WORKBENCH_FUNCTIONAL_SPEC.md](./docs/agent/WORKBENCH_FUNCTIONAL_SPEC.md) |
| Agent template focus: models + tools declaration plan | [docs/agent/TEMPLATE_FOCUS_PLAN.md](./docs/agent/TEMPLATE_FOCUS_PLAN.md) |
| Workbench implementation plan (phase log) | [docs/agent/WORKBENCH_IMPLEMENTATION_PLAN.md](./docs/agent/WORKBENCH_IMPLEMENTATION_PLAN.md) |
| View data_graph / datagraph schema (properties, selectProps, relationName, list behaviour) | [docs/datagraph-builder/DATAGRAPH_SCHEMA_REFERENCE.md](./docs/datagraph-builder/DATAGRAPH_SCHEMA_REFERENCE.md) |
| Visual datagraph builder (design, summary) | [docs/datagraph-builder/DATAGRAPH_BUILDER_SUMMARY.md](./docs/datagraph-builder/DATAGRAPH_BUILDER_SUMMARY.md) |
| Claude Web/Desktop prompts | [docs/CLAUDE_WEB_PROMPTS.md](./docs/CLAUDE_WEB_PROMPTS.md) |

---

## Core Concepts (Quick Overview)

### 1. Metadata-Driven Architecture
```
Prisma Model → Auto REST API → View (permissions) → Dynamic UI
```

### 2. Key Components
- **Views**: Define which fields are accessible and editable per role
- **Permissions**: Field-level access control (read/write)
- **Workflows**: State machine for approval processes
- **Multi-tenancy**: All data isolated by `org_id`

### 3. URL Patterns
```
# Backend API
/api/{model}/view/{viewId}              # CRUD operations
/api/{model}/view/{viewId}/search       # Search with filters
/api/workflow/instances/{id}/actions/{actionId}  # Workflow actions

# Frontend Routes
/master/{category}/{model}              # List page
/{model}/view/{viewId}                  # Create form
/{model}/{id}/view/{viewId}             # Edit form
/{model}/state/{stateId}                # Workflow list
```

### 4. Adding a New Feature (Checklist)
1. ☐ Add Prisma model (`backend/prisma/schema/`)
2. ☐ Run `npx prisma db push && npx prisma generate`
3. ☐ Create view + permissions (SQL or admin UI)
4. ☐ Add frontend route (`frontend-1/src/App.tsx`)
5. ☐ Create form component if needed
6. ☐ Add to sidebar navigation

---

## Project Structure

```
fabriq/
├── CLAUDE.md                    # This file (index)
├── docs/                        # Detailed documentation
│   ├── ARCHITECTURE.md          # System architecture
│   ├── BACKEND.md               # Backend development
│   ├── FRONTEND.md              # Frontend development
│   ├── DEPLOYMENT.md            # Setup & deployment
│   ├── AUTHENTICATION.md        # Auth system
│   ├── WORKFLOWS.md             # Workflow engine
│   ├── AI_AGENT.md              # AI/LLM integration
│   ├── BUSINESS_DOMAIN.md       # Business context
│   └── INTEGRATIONS.md          # ERP integration architecture
├── backend/                     # Node.js/Express backend
└── frontend-1/                  # React/TypeScript frontend
```

---

## Business Modules

| Module | Models | Status |
|--------|--------|--------|
| **Procurement** | supplier, purchase_requisition, purchase_order, invoice | ✅ Complete |
| **Sales** | customer, quote, sales_order, delivery_challan, credit_note | ✅ Complete |
| **Accounting** | account, posting, category, category_group | ✅ Complete |
| **Investments** | instrument, trade, holding | ✅ Complete |

---

## Quick Debugging

### Backend Issues
```sql
-- Check user permissions
SELECT v.model_name, p.field_name, p.access 
FROM permission p 
JOIN view v ON p.view_id = v.id 
JOIN role_view rv ON v.id = rv.view_id 
JOIN role_user ru ON rv.role_id = ru.role_id 
WHERE ru.user_id = 'USER_ID';

-- Check workflow state
SELECT wi.current_state, ws.name, wa.name as available_actions
FROM workflow_instance wi
JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
WHERE wi.model_id = 'RECORD_ID';
```

### Frontend Issues
- **Data not loading**: Check Network tab, verify view name exists
- **Columns missing**: Check `isColumnShow` in metadata
- **Auth errors**: Check `__session` cookie, verify token validity

---

## Notes for AI Assistants

1. **Always query database** before explaining workflows/permissions
2. **Use views** for all data access (never bypass)
3. **Follow conventions**: snake_case for DB, camelCase for TS
4. **Check permissions** before any operation
5. **Filter by org_id** for all data queries

### Proactive Database Querying

When debugging any issue — data state, workflow behaviour, permissions, record counts, missing fields — **query the database directly** using `psql`. Do not ask the user to run queries.

**How**:
```bash
DATABASE_URL=$(grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//') && psql "${DATABASE_URL}" -c "SELECT ..."
```

**Rules**:
- SELECT only — no INSERT, UPDATE, DELETE, or DDL
- Always filter business data by `org_id`
- Metadata tables (`view`, `permission`, `role*`, `workflow_flow/state/action`) do not need `org_id`
- Quote `"user"` — it is a reserved SQL word

**Slash commands** (for focused sessions):
- `/db` — basic queries (counts, single-table lookups, simple workflow checks)
- `/db-advanced` — permission chains, cross-module tracing, workflow debugging, data integrity

**Common Pitfalls to Avoid**:
- ❌ Creating custom CRUD endpoints (use auto-generated ones)
- ❌ Bypassing permission system
- ❌ Hardcoding model names
- ❌ Ignoring org_id filtering

---

**For detailed documentation, see the [docs/](./docs/) folder.**
