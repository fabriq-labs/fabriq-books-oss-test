# Fabriq Books - Developer Onboarding Plan

**Target**: Get developer productive by Day 4, integration-ready by Day 5  
**Focus**: Views, Forms, Workflow Configuration, and ERP Integrations  
**Duration**: 5 days (with hands-on exercises)

---

## Overview

This onboarding plan introduces a developer to:
1. **Fabriq Books** - A metadata-driven financial management platform for procurement, sales, accounting, and investment tracking
2. **The Metadata-Driven Framework** - How the system automatically generates APIs, enforces permissions, and renders dynamic UIs from Prisma models and view configurations
3. **Core Concepts** - Views, permissions, multi-tenancy, and the complete request-to-response flow
4. **Practical Skills** - Configuring views and permissions, building forms, setting up workflows, and working with the framework's conventions

---

## Day 1: Environment Setup & Core Concepts

### Session 1: IDE Setup (2 hours)

**Objective**: Set up Cursor IDE workspace with both frontend and backend

**📖 Workbook**: Follow the detailed step-by-step instructions in [Session 1 Workbook](./ONBOARDING_SESSION1_WORKBOOK.md)

The workbook covers:
- Cloning workspace, backend, and frontend repositories
- Configuring Cursor IDE workspace
- Setting up environment variables
- Database initialization
- Verifying the complete setup

**Completion Checklist**:
- [ ] All repositories cloned and dependencies installed
- [ ] Cursor workspace configured and opened
- [ ] Backend and frontend servers running successfully
- [ ] Can login and navigate the application

---

### Session 2: Understanding the Metadata-Driven Framework (3 hours)

**Objective**: Understand how the system automatically generates CRUD from Prisma models

**📖 Workbook**: Follow the detailed explanations and exercises in [Session 2 Workbook](./ONBOARDING_SESSION2_WORKBOOK.md)

The workbook covers:
- The core metadata-driven concept with examples
- Prisma models and their structure
- Views and permissions system
- Automatic API generation
- Hands-on exercises to trace data flow

**Completion Checklist**:
- [ ] Understand the Prisma Model → API → View → UI flow
- [ ] Can explain how views control data access
- [ ] Can trace a request from UI to database
- [ ] Understand permission system basics

---

### Session 3: Hands-On Exercise - Explore Existing Models (1 hour)

**Objective**: Get familiar with existing models and their structure

**📖 Workbook**: Follow the detailed exercises in [Session 3 Workbook](./ONBOARDING_SESSION3_WORKBOOK.md)

The workbook covers:
- Exploring different model types (master data, transactional)
- Understanding model relationships
- Examining views and permissions for existing models
- Tracing data flow from model to UI
- Hands-on exercises with real models

**Completion Checklist**:
- [ ] Explored at least 3 different models
- [ ] Understand model relationships
- [ ] Can identify views and permissions for models
- [ ] Can trace data from database to UI

---

## Day 2: Forms & Views Configuration

### Session 4: Understanding Forms (3 hours)

**Objective**: Learn how forms work and how to create/edit them

**📖 Workbook**: Follow the detailed explanations and exercises in [Session 4 Workbook](./ONBOARDING_SESSION4_WORKBOOK.md)

The workbook covers:
- Form architecture and components
- React Hook Form integration
- View configuration for forms
- Permissions and field-level access
- Form validation with Zod
- Hands-on exercises with existing forms

**Completion Checklist**:
- [ ] Understand form architecture
- [ ] Can trace form data flow
- [ ] Understand how views control form fields
- [ ] Can configure view data_graph
- [ ] Understand permission impact on forms

---

### Session 5: Hands-On - Create a Simple Form (2 hours)

**Objective**: Create a complete form for a new master data model

**📖 Workbook**: Follow the step-by-step guide in [Session 5 Workbook](./ONBOARDING_SESSION5_WORKBOOK.md)

The workbook covers:
- Creating views and permissions for a model
- Adding frontend routes
- Building form components from templates
- Form validation setup
- Navigation integration
- Testing CRUD operations

**Completion Checklist**:
- [ ] Created view and permissions for model
- [ ] Added frontend routes
- [ ] Created form component
- [ ] Integrated with navigation
- [ ] Tested full CRUD operations

---

## Day 3: Workflows

### Session 6: Understanding Workflows (3 hours)

**Objective**: Learn how the workflow engine works

#### 6.1 Workflow Concepts

**Key Components**:
- `workflow_flow` - Workflow definition for a model
- `workflow_state` - States in the workflow (Draft, Review, Approved)
- `workflow_action` - Transitions between states
- `workflow_instance` - Runtime instance for a document
- `workflow_history` - Audit trail

**Workflow Pattern**:
```
Draft → Manager Review → Finance Review → Approved
  ↓           ↓              ↓
Submit    Approve        Approve
```

**Exercise**: Explore Purchase Requisition Workflow
1. Open Prisma Studio
2. Check `workflow_flow` table - find PR workflow
3. Check `workflow_state` - see all states
4. Check `workflow_action` - see transitions
5. Create a PR in UI
6. Check `workflow_instance` - see the instance created
7. Execute workflow actions
8. Check `workflow_history` - see audit trail

#### 6.2 State Assignment

**Assignment Types**:
- `USER` - Assigned to specific user
- `ROLE` - Assigned to any user with the role
- `EXPRESSION` - Dynamically assigned (e.g., `created_by.manager`)

**Exercise**: Understand Assignment
1. Check a workflow state's `assigned_for` field
2. See how it determines who can act
3. Test with different users/roles

#### 6.3 Side Effects

**Side Effects**: Actions that happen during workflow transitions

**Example**: When PR is approved, generate PO
```json
{
  "effects": [
    {
      "type": "database",
      "config": {
        "method": "generate_po_from_pr"
      }
    }
  ]
}
```

**Exercise**: Check Side Effects
1. Find a workflow action with side effects
2. See the `side_effects` JSON
3. Understand what happens when action is executed

---

### Session 7: Hands-On - Configure a Simple Workflow (2 hours)

**Objective**: Create a workflow for a model

**Task**: Create a workflow for "Expense Report" (if model exists)

**Steps**:

1. **Check if model has workflow field**:
   ```prisma
   model expense_report {
     // ... fields
     wf_instance_id String?
     workflow_instance workflow_instance? @relation(...)
   }
   ```

2. **Create workflow flow** (via SQL or setup script):
   ```sql
   INSERT INTO workflow_flow (id, name, model_name, description, is_active)
   VALUES (
     'expense_report_workflow',
     'Expense Report Workflow',
     'expense_report',
     'Workflow for expense report approval',
     true
   );
   ```

3. **Create workflow states**:
   ```sql
   -- Draft state
   INSERT INTO workflow_state (id, flow_id, name, is_initial, assigned_for)
   VALUES (
     'exp_draft',
     'expense_report_workflow',
     'Draft',
     true,
     'USER'
   );
   
   -- Manager Review state
   INSERT INTO workflow_state (id, flow_id, name, assigned_for, assigned_role_id)
   VALUES (
     'exp_manager_review',
     'expense_report_workflow',
     'Manager Review',
     'ROLE',
     (SELECT id FROM role WHERE name = 'Manager')
   );
   
   -- Approved state
   INSERT INTO workflow_state (id, flow_id, name, is_final)
   VALUES (
     'exp_approved',
     'expense_report_workflow',
     'Approved',
     true
   );
   ```

4. **Create workflow actions**:
   ```sql
   -- Submit action
   INSERT INTO workflow_action (id, name, source_state_id, target_state_id)
   VALUES (
     'exp_submit',
     'Submit',
     'exp_draft',
     'exp_manager_review'
   );
   
   -- Approve action
   INSERT INTO workflow_action (id, name, source_state_id, target_state_id)
   VALUES (
     'exp_approve',
     'Approve',
     'exp_manager_review',
     'exp_approved'
   );
   ```

5. **Test workflow**:
   - Create an expense report
   - Verify workflow instance is created
   - Execute "Submit" action
   - Verify state changes
   - Execute "Approve" action
   - Verify final state

**Deliverable**: Working workflow with 3 states and 2 actions

---

## Day 4: Practical Application & Real Work

### Session 8: Review & Practice (2 hours)

**Objective**: Solidify understanding through guided practice

**Exercise 1**: Configure View for Existing Model
- Pick a model (e.g., `item_master`)
- Create a new view with limited fields
- Configure permissions
- Test in UI

**Exercise 2**: Modify Existing Workflow
- Pick an existing workflow
- Add a new state
- Add transitions
- Test the workflow

**Exercise 3**: Debug a Permission Issue
- Create a scenario where user can't access data
- Debug using:
  - Check user roles
  - Check role-view assignments
  - Check view permissions
  - Fix the issue

---

### Session 9: Real Work Assignment (4 hours)

**Objective**: Start working on actual features

**Typical First Tasks**:

1. **Configure View for New Feature**
   - Business requirement: "Users need to see only specific fields in Invoice list"
   - Task: Create `invoice_list_view` with limited fields
   - Configure permissions
   - Test with different roles

2. **Add Form Field**
   - Business requirement: "Add 'Notes' field to Supplier form"
   - Task: 
     - Add field to Prisma model (if needed)
     - Update view data_graph
     - Update form component
     - Test create/edit

3. **Configure Workflow State**
   - Business requirement: "Add 'Finance Review' step to Purchase Order workflow"
   - Task:
     - Add new state
     - Configure assignment (ROLE: Finance Team)
     - Add transitions
     - Test workflow

4. **Fix View Configuration**
   - Issue: "Users can't see related data in Invoice form"
   - Task:
     - Check view data_graph
     - Add relation to select
     - Test in UI

**Support Resources**:
- `CLAUDE.md` - Quick reference
- `docs/ARCHITECTURE.md` - System architecture
- `docs/BACKEND.md` - Backend development
- `docs/FRONTEND.md` - Frontend development
- `docs/WORKFLOWS.md` - Workflow details
- Database queries using Prisma Studio

---

## Key Resources Reference

### Documentation Files
- `CLAUDE.md` - Quick reference guide (START HERE)
- `docs/ARCHITECTURE.md` - System architecture
- `docs/BACKEND.md` - Backend development guide
- `docs/FRONTEND.md` - Frontend development guide
- `docs/WORKFLOWS.md` - Workflow engine details
- `docs/BUSINESS_DOMAIN.md` - Business context
- `docs/DEPLOYMENT.md` - Setup and deployment
- `docs/INTEGRATIONS.md` - ERP integration architecture (forward/reverse sync)

### Key Code Files
- `backend/src/services/core/ModelService.ts` - Core CRUD
- `backend/src/services/permissions/PermissionService.ts` - RBAC
- `backend/src/rest/routes.ts` - Auto-generated routes
- `frontend-1/src/pages/Master.tsx` - Generic list page
- `frontend-1/src/api/api.ts` - API client

### Database Tools
- Prisma Studio: `cd backend && npx prisma studio`
- Direct SQL: `psql $DATABASE_URL`

### Common Commands
```bash
# Backend
cd backend
npm run dev                    # Start backend
npx prisma studio             # Database GUI
npx prisma db push            # Sync schema
npx prisma generate           # Generate client

# Frontend
cd frontend-1
npm run dev                   # Start frontend

# Database setup
cd backend
node setup-db.js --demo-data=indian-demo
```

---

## Success Criteria

By end of Day 4, developer should be able to:

- [ ] Set up development environment independently
- [ ] Understand metadata-driven architecture
- [ ] Explain how Prisma models → API → UI
- [ ] Configure views and permissions
- [ ] Create/edit form components
- [ ] Configure workflow states and actions
- [ ] Debug permission issues
- [ ] Use Prisma Studio to inspect data
- [ ] Navigate codebase to find relevant files
- [ ] Complete a real work task independently

---

## Day 5: ERP Integrations (Optional — for developers working on sync)

### Session 10: ERP Integrations — Forward Sync with Zoho Books (3 hours)

**Objective**: Set up the Python/DBT environment and run the Zoho Books forward sync pipeline

**📖 Workbook**: Follow the detailed step-by-step instructions in [Integrations Session Workbook](./ONBOARDING_SESSION_INTEGRATIONS_WORKBOOK.md)

The workbook covers:
- Integration architecture overview (Forward Sync vs Reverse Sync)
- Python virtual environment and DBT setup
- Environment variable configuration (DB, encryption key, org_id, Zoho OAuth)
- Running the full sync pipeline (`sync_and_transform.py`)
- Tracing records through staging → integration → normalized layers
- Troubleshooting common issues (incremental filters, missing tables)
- Self-reading resources for Airbyte, DBT, and Zoho Books API

**Completion Checklist**:
- [ ] Python venv created with all dependencies
- [ ] DBT installed and configured
- [ ] Forward sync pipeline runs end-to-end
- [ ] Can trace a record from raw datalake to normalized public table
- [ ] Understands incremental processing and `FORCE_PROCESS_ALL`
- [ ] Self-reading list reviewed (Airbyte, DBT, Zoho Books)

---

### Session 11: ERP Integrations — Reverse Sync (Zoho Books & PO Workflow) (2.5 hours)

**Objective**: Understand how Fabriq pushes data to ERPs via workflow side effects and enable/verify Purchase Order → Zoho Books sync on approval.

**📖 Workbook**: Follow the step-by-step instructions in [Integrations Reverse Sync Workbook](./ONBOARDING_SESSION_INTEGRATIONS_REVERSE_WORKBOOK.md)

The workbook covers:
- Reverse sync architecture (workflow-triggered, Node.js, connector factory)
- Code exploration: `backend/src/lib/integrations/` (connectors, Zoho connector, mappers)
- Workflow configuration: PO workflow, "Approve" action, and `sync_po_to_erp` side effect (disabled by default)
- Enabling PO → Zoho sync (script or database update)
- End-to-end test: approve a PO and verify sync in DB and Zoho Books
- Tracing the full path: UI → WorkflowEngine → SideEffectExecutor → sync_purchase_order → connector
- Troubleshooting (missing org/connection, effect disabled, token errors)

**Completion Checklist**:
- [ ] Can explain Forward vs Reverse sync and the connector factory pattern
- [ ] Located workflowActionMap, sync_purchase_order, and createERPConnector
- [ ] Verified org.erp_system_type and source_system; enabled sync_po_to_erp
- [ ] Approved a PO and confirmed source_record_id and sync_status in DB
- [ ] Self-reading (WORKFLOWS.md, INTEGRATIONS.md Reverse section, Zoho connector/mapper) reviewed

---

## Optional: Agentic AI & Workbench (for developers on LLM / agent features)

### Session 12: Agentic Features — Basics (2–3 hours)

**Objective**: Understand `AgentService`, `ToolManager`, schema-driven CRUD tools, analytics and SQL tools (`advancedSqlQuery`, `analyticsQuery`), and posting-specific tools (`categorizePostings`, `suggestReconciliationMatches`).

**📖 Workbook**: [Agentic Basics Workbook](./ONBOARDING_SESSION_AGENTIC_BASICS_WORKBOOK.md)

**Completion Checklist**:
- [ ] Can trace how tools delegate to `ModelService` and respect views/permissions
- [ ] Knows the difference between `advancedSqlQuery` and `analyticsQuery` / `getAnalyticsContext`
- [ ] Understands that `categorizePostings` is dry-run and approvals go through pending actions

---

### Session 13: Agentic Features — Workbench (2–3 hours)

**Objective**: Understand agent sessions, templates, SSE live feed, session lifecycle, hybrid dispatcher, pending actions, executors, and `/workbench` routing.

**📖 Workbook**: [Agentic Workbench Workbook](./ONBOARDING_SESSION_AGENTIC_WORKBENCH_WORKBOOK.md)

**Related specs**: [WORKBENCH_FUNCTIONAL_SPEC.md](../WORKBENCH_FUNCTIONAL_SPEC.md), [WORKBENCH_IMPLEMENTATION_PLAN.md](../WORKBENCH_IMPLEMENTATION_PLAN.md)

**Completion Checklist**:
- [ ] Can explain session states and how SSE snapshots/events update the UI
- [ ] Knows how pending actions connect to executors and session completion
- [ ] Has located key files (`SessionEventBus`, `routes.ts` SSE, `PendingActionService`)

---

## Next Steps After Onboarding

1. **Week 2**: Work on real features with guidance
2. **Week 3**: Take ownership of small features
3. **Week 4**: Contribute to larger features
4. **Ongoing**: Review code, ask questions, learn advanced patterns

---

## Tips for Success

1. **Use Prisma Studio**: Visual database inspection is your friend
2. **Check Network Tab**: See API calls in browser DevTools
3. **Read Error Messages**: They usually point to the issue
4. **Trace the Flow**: Follow data from UI → API → Database
5. **Ask Questions**: Use team chat, don't struggle alone
6. **Test Everything**: Verify changes work in UI
7. **Document Learnings**: Keep notes on patterns you discover

---

**End of Onboarding Plan**
