# Fabriq Financial Suite - AI Context Guide

**Last Updated**: 2026-04-18

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
| Kernel boundary, system org, and future Postgres RLS | [docs/kernel/README.md](./docs/kernel/README.md) |
| Backend development (adding models, APIs) | [docs/BACKEND.md](./docs/BACKEND.md) |
| Frontend development (adding pages, forms) | [docs/FRONTEND.md](./docs/FRONTEND.md) |
| Multi-brand / white-label frontend (`config/<brand>/`, select-brand) | [docs/FRONTEND.md#multi-brand-app-configuration](./docs/FRONTEND.md#multi-brand-app-configuration) |
| Setting up / deploying the system | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) |
| Container image build & run (Dockerfile, GHCR, compose) | [docs/BUILD_AND_DEPLOY.md](./docs/BUILD_AND_DEPLOY.md) |
| Railway: Artifact Registry image + Vertex/Gemini auth | [docs/RAILWAY_ARTIFACT_REGISTRY_VERTEX.md](./docs/RAILWAY_ARTIFACT_REGISTRY_VERTEX.md) |
| Railway logs / debug from Cursor agent (`RAILWAY_TOKEN`) | [.cursor/skills/railway-debug/SKILL.md](./.cursor/skills/railway-debug/SKILL.md) · [docs/BUILD_AND_DEPLOY.md](./docs/BUILD_AND_DEPLOY.md) (§ Cursor / cloud-agent access) |
| Authentication issues or changes | [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md) |
| Workflow engine questions | [docs/WORKFLOWS.md](./docs/WORKFLOWS.md) |
| AI agent / LLM integration | [docs/AI_AGENT.md](./docs/AI_AGENT.md) |
| **Agent docs index + reading order** | [docs/agent/README.md](./docs/agent/README.md) |
| Agent system motivation, bookkeeping domain primer | [docs/agent/01-OVERVIEW.md](./docs/agent/01-OVERVIEW.md) |
| Agent system architecture + file map | [docs/agent/02-ARCHITECTURE.md](./docs/agent/02-ARCHITECTURE.md) |
| Session states, auto-continuation, completion paths | [docs/agent/03-SESSION_LIFECYCLE.md](./docs/agent/03-SESSION_LIFECYCLE.md) |
| Prompt assembly, template merging, DynamicPromptManager | [docs/agent/04-PROMPT_SYSTEM.md](./docs/agent/04-PROMPT_SYSTEM.md) |
| All agent tools: parameters, returns, side effects | [docs/agent/05-TOOLS.md](./docs/agent/05-TOOLS.md) |
| Builders, executors, hybrid dispatcher | [docs/agent/06-BUILDERS_AND_EXECUTORS.md](./docs/agent/06-BUILDERS_AND_EXECUTORS.md) |
| Worked examples (categorization, reconciliation, write-off traces) | [docs/agent/07-WORKED_EXAMPLES.md](./docs/agent/07-WORKED_EXAMPLES.md) |
| Agent database schema (session, message, pending_action) | [docs/agent/08-DATA_MODELS.md](./docs/agent/08-DATA_MODELS.md) |
| All agent HTTP endpoints | [docs/agent/09-API_REFERENCE.md](./docs/agent/09-API_REFERENCE.md) |
| Vercel AI SDK usage, model providers, maxSteps | [docs/agent/10-LIBRARIES_AND_PROVIDERS.md](./docs/agent/10-LIBRARIES_AND_PROVIDERS.md) |
| LLM traces, token usage, feedback workflow | [docs/agent/11-OBSERVABILITY.md](./docs/agent/11-OBSERVABILITY.md) |
| Running tests, prompt harness, E2E patterns | [docs/agent/12-TESTING.md](./docs/agent/12-TESTING.md) |
| Adding a new tool/handler/builder/executor | [docs/agent/13-EXTENDING.md](./docs/agent/13-EXTENDING.md) |
| Known agent gaps and roadmap | [docs/agent/14-SHORTFALLS_AND_ROADMAP.md](./docs/agent/14-SHORTFALLS_AND_ROADMAP.md) |
| Diagnose a failed/stuck agent session | [docs/agent/debugging/SESSION_FAILURE_PATTERNS.md](./docs/agent/debugging/SESSION_FAILURE_PATTERNS.md) |
| In-app conversational chat (history, PageContext, SDK, prompt selection) | [docs/agent/15-CONVERSATIONAL_CHAT.md](./docs/agent/15-CONVERSATIONAL_CHAT.md) |
| Business rules / modules | [docs/BUSINESS_DOMAIN.md](./docs/BUSINESS_DOMAIN.md) |
| Tax architecture (country-agnostic GST/HST, P0/P1) | [docs/tax/README.md](./docs/tax/README.md) · [TAX_ARCHITECTURE.md](./docs/tax/TAX_ARCHITECTURE.md) · [IMPLEMENTATION_PLAN.md](./docs/tax/IMPLEMENTATION_PLAN.md) |
| ERP integrations (forward/reverse sync) | [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) |
| QuickBooks → Fabriq (fields + concepts, app users) | [docs/QUICKBOOKS_TO_FABRIQ_USER_GUIDE.md](./docs/QUICKBOOKS_TO_FABRIQ_USER_GUIDE.md) |
| QuickBooks + Airbyte setup (OAuth, connection, extract/transform) | [docs/QUICKBOOKS_INTEGRATION_TO_FABRIQ.md](./docs/QUICKBOOKS_INTEGRATION_TO_FABRIQ.md) |
| Plaid bank feed integration | [docs/PLAID_README.md](./docs/PLAID_README.md) (implementation guide) · [docs/PLAID_INTEGRATION.md](./docs/PLAID_INTEGRATION.md) (design notes) |
| Import functionality (CSV/PDF upload) | [docs/IMPORT_FUNCTIONALITY.md](./docs/IMPORT_FUNCTIONALITY.md) |
| Frontend filter system (defaultFilters, presetFilters, virtual OR keys, badge chips) | [docs/FILTER_SYSTEM.md](./docs/FILTER_SYSTEM.md) |
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
5. **Filter by org_id** for all data queries — except models in `METADATA_MODELS_WITHOUT_ORG_FILTER`: `role`, `view`, `permission`, `role_view`, `workflow_*`, `prompt_template`, `currency`
6. **Currency is global** — `currency` rows use `org_id = 'system'` and are visible to all tenants. Do not filter currency queries by `org_id`.

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
- ❌ **NEVER run `npx prisma db push`, `prisma migrate`, or any DDL (ALTER TABLE, CREATE TABLE, DROP …) — always propose the change and let the user run it**

---

**For detailed documentation, see the [docs/](./docs/) folder.**
