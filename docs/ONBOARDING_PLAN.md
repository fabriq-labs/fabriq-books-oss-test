# Fabriq Books - Junior Developer Onboarding Plan

**Target**: Get junior developer productive by Day 4  
**Focus**: Views, Forms, and Workflow Configuration  
**Duration**: 4 days (with hands-on exercises)

---

## Overview

This onboarding plan introduces a junior developer to:
1. **Fabriq Books** - A metadata-driven financial management platform
2. **The Framework** - How automatic CRUD generation works
3. **Practical Skills** - Configuring views, forms, and workflows

---

## Day 1: Environment Setup & Core Concepts

### Session 1: IDE Setup (2 hours)

**Objective**: Set up Cursor IDE workspace with both frontend and backend

#### 1.1 Clone Repositories
```bash
# Create workspace directory
mkdir ~/fabriq-workspace
cd ~/fabriq-workspace

# Clone backend
git clone <backend-repo-url> backend
cd backend
npm install

# Clone frontend
cd ..
git clone <frontend-repo-url> frontend-1
cd frontend-1
npm install

# Clone docs (if separate repo)
cd ..
git clone <docs-repo-url> docs
```

#### 1.2 Cursor IDE Workspace Configuration

**Create `.cursor/workspace.code-workspace`**:
```json
{
  "folders": [
    {
      "path": "backend",
      "name": "Backend (Node.js/Express)"
    },
    {
      "path": "frontend-1",
      "name": "Frontend (React/Vite)"
    },
    {
      "path": "docs",
      "name": "Documentation"
    }
  ],
  "settings": {
    "typescript.tsdk": "backend/node_modules/typescript/lib",
    "editor.formatOnSave": true,
    "files.exclude": {
      "**/node_modules": true,
      "**/.git": true
    }
  }
}
```

#### 1.3 Environment Setup

**Backend (.env)**:
```bash
cd backend
cp .env.example .env
# Edit .env with:
# - DATABASE_URL
# - JWT_SECRET
# - PORT=4000
```

**Frontend (.env.local)**:
```bash
cd frontend-1
cp .env.example .env.local
# Edit .env.local with:
# - VITE_API_BASE_URL=http://localhost:4000
```

#### 1.4 Database Setup
```bash
cd backend
node setup-db.js --demo-data=indian-demo --skip-tests
```

#### 1.5 Verify Setup
```bash
# Terminal 1: Start backend
cd backend
npm run dev  # Should start on port 4000

# Terminal 2: Start frontend
cd frontend-1
npm run dev  # Should start on port 5173

# Test login:
# - Open http://localhost:5173
# - Login: admin@example.com / admin123
# - Navigate to Suppliers page
```

**Checklist**:
- [ ] Both repos cloned and dependencies installed
- [ ] Cursor workspace opens with all three folders
- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Can login and see dashboard
- [ ] Can navigate to Suppliers master page

---

### Session 2: Understanding the Metadata-Driven Framework (3 hours)

**Objective**: Understand how the system automatically generates CRUD from Prisma models

#### 2.1 The Core Concept

**Key Insight**: 
```
Prisma Model → Auto REST API → View (permissions) → Dynamic UI
```

**Exercise**: Trace a request from UI to database

1. Open `frontend-1/src/pages/Master.tsx`
2. See how it calls `/api/supplier/view/supplier_view/search`
3. Open `backend/src/rest/routes.ts` - see auto-generated routes
4. Open `backend/src/services/core/ModelService.ts` - see how it handles requests
5. Open `backend/prisma/schema/data.prisma` - find `model supplier`

**Key Files to Review**:
- `CLAUDE.md` - Quick reference guide
- `docs/ARCHITECTURE.md` - System architecture
- `backend/src/services/core/ModelService.ts` - Core CRUD logic
- `frontend-1/src/pages/Master.tsx` - Generic list component

#### 2.2 Prisma Models

**Location**: `backend/prisma/schema/data.prisma`

**Standard Pattern**:
```prisma
model supplier {
  id          String   @id @default(dbgenerated("'supp_' || gen_random_uuid()"))
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  org_id      String?  // Multi-tenancy
  
  supplier_name String
  email         String?
  phone         String?
  
  @@map("supplier")
}
```

**Exercise**: 
1. Find the `supplier` model in `data.prisma`
2. Note the standard fields (id, created_by, org_id, etc.)
3. See how relations work (e.g., `payment_terms` relation)

#### 2.3 Views and Permissions

**Location**: `backend/prisma/metadata/views/` or database `view` table

**View Structure**:
```json
{
  "id": "supplier_view",
  "name": "supplier_view",
  "model_name": "supplier",
  "data_graph": {
    "select": {
      "id": true,
      "supplier_name": true,
      "email": true,
      "phone": true
    }
  }
}
```

**Permission Structure**:
- Field-level access: `read`, `write`, `none`
- Wildcard: `*` grants all fields
- Role-based: Users get permissions through roles

**Exercise**:
1. Open Prisma Studio: `cd backend && npx prisma studio`
2. Navigate to `view` table
3. Find `supplier_view`
4. Check `permission` table for field-level permissions
5. Check `role_view` table to see which roles have access

#### 2.4 Automatic API Generation

**How it works**:
1. Prisma schema defines models
2. `RestService.ts` auto-generates routes for each model
3. `ModelService.ts` handles CRUD operations
4. `PermissionService.ts` validates access
5. `DataAccessLayer.ts` executes queries with org_id filtering

**API Pattern**:
```
GET    /api/{model}                    → getAll
GET    /api/{model}/:id                → getById
POST   /api/{model}                    → create
PUT    /api/{model}/:id                → update
DELETE /api/{model}/:id                → delete
POST   /api/{model}/search             → search with filters
```

**Exercise**:
1. Open browser DevTools → Network tab
2. Navigate to Suppliers page
3. See the API call: `POST /api/supplier/view/supplier_view/search`
4. Inspect request/response
5. Try creating a new supplier - see the `POST /api/supplier/view/supplier_view` call

---

### Session 3: Hands-On Exercise - Explore Existing Models (1 hour)

**Objective**: Get familiar with existing models and their structure

**Exercise 1**: Explore Supplier Model
1. Open `backend/prisma/schema/data.prisma`
2. Find `model supplier`
3. Note all fields and relations
4. Check `supplier_view` in database
5. Create a supplier via UI
6. Check database to see the record

**Exercise 2**: Explore Invoice Model
1. Find `model invoice` in schema
2. Note workflow field: `wf_instance_id`
3. Check `invoice_view` in database
4. See how it relates to `purchase_order`
5. Navigate to Invoices page in UI

**Exercise 3**: Check Workflow Integration
1. Find a model with `wf_instance_id` (e.g., `purchase_requisition`)
2. Check `workflow_flow` table for this model
3. See workflow states and actions
4. Navigate to Purchase Requisitions page
5. Create a PR and see workflow in action

**Deliverable**: 
- Document 3 models you explored
- Note their key fields
- Note their views and permissions
- Note if they have workflows

---

## Day 2: Forms & Views Configuration

### Session 4: Understanding Forms (3 hours)

**Objective**: Learn how forms work and how to create/edit them

#### 4.1 Form Architecture

**Key Components**:
- `Master.tsx` - Generic list page
- Form components in `frontend-1/src/components/forms/Masters/`
- API integration via `viewAPI` in `frontend-1/src/api/api.ts`

**Form Pattern**:
```tsx
export const SupplierForm = () => {
  const { id, viewId } = useParams();
  const [initialValues, setInitialValues] = useState({});
  const [metadata, setMetadata] = useState({});
  
  // 1. Fetch data + metadata
  useEffect(() => {
    if (id) {
      viewAPI.getById('supplier', id, viewId).then(res => {
        setInitialValues(res.data);
        setMetadata(res.metaData);
      });
    }
  }, [id, viewId]);
  
  // 2. React Hook Form + Zod validation
  const form = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: initialValues
  });
  
  // 3. Submit handler
  const onSubmit = async (data) => {
    if (id) {
      await viewAPI.update('supplier', id, viewId, data);
    } else {
      await viewAPI.create('supplier', viewId, data);
    }
    navigate(-1);
  };
  
  // 4. Render form fields
  return <Form>...</Form>;
};
```

**Exercise**: 
1. Open `frontend-1/src/components/forms/Masters/SupplierForm.tsx`
2. Trace the form flow:
   - How it fetches metadata
   - How it handles create vs edit
   - How it submits data
3. Compare with another form (e.g., `InvoiceForm.tsx`)

#### 4.2 View Configuration

**What Views Control**:
- Which fields are visible
- Which fields are editable
- Which relations to include
- Field display properties (badges, links, etc.)

**View Data Graph**:
```json
{
  "select": {
    "id": true,
    "supplier_name": true,
    "email": true,
    "payment_terms": {
      "select": {
        "id": true,
        "payment_terms": true
      }
    }
  }
}
```

**Exercise**: Modify a View
1. Open Prisma Studio
2. Find `supplier_view` in `view` table
3. Modify `data_graph` to add/remove a field
4. Refresh UI and see the change
5. Check how it affects the form

#### 4.3 Permissions Configuration

**Permission Types**:
- `read` - Can see the field
- `write` - Can edit the field
- `none` - Cannot access the field

**Exercise**: Test Permissions
1. Create a test role: `Test Role`
2. Create a test view: `supplier_test_view` with limited fields
3. Add permissions: only `read` for some fields, `write` for others
4. Assign view to test role
5. Create test user with test role
6. Login as test user and verify permissions

---

### Session 5: Hands-On - Create a Simple Form (2 hours)

**Objective**: Create a complete form for a new master data model

**Task**: Create a "Payment Terms" form

**Steps**:

1. **Check if model exists**:
   ```bash
   # Check backend/prisma/schema/data.prisma
   # Look for payment_terms model
   ```

2. **If model exists, create view** (via SQL or Prisma Studio):
   ```sql
   INSERT INTO view (id, name, model_name, data_graph, description)
   VALUES (
     'payment_terms_view',
     'payment_terms_view',
     'payment_terms',
     '{"select": {"id": true, "payment_terms": true, "days": true}}',
     'Payment terms view'
   );
   
   -- Add permissions
   INSERT INTO permission (view_id, field_name, access)
   VALUES 
     ('payment_terms_view', '*', 'write');
   
   -- Assign to Admin role
   INSERT INTO role_view (role_id, view_id)
   SELECT id, 'payment_terms_view' FROM role WHERE name = 'Administrator';
   ```

3. **Add frontend route** (`frontend-1/src/App.tsx`):
   ```tsx
   <Route path="master/procurement/payment_terms" element={
     <Master 
       type="payment_terms" 
       view="payment_terms_view" 
       displayName="Payment Terms" 
     />
   } />
   <Route path="payment_terms/:id/view/:viewId" element={<PaymentTermsForm />} />
   <Route path="payment_terms/view/:viewId" element={<PaymentTermsForm />} />
   ```

4. **Create form component** (`frontend-1/src/components/forms/Masters/PaymentTermsForm.tsx`):
   ```tsx
   // Copy SupplierForm.tsx as template
   // Modify for payment_terms model
   // Update field names
   ```

5. **Add to sidebar navigation**

6. **Test**:
   - Navigate to Payment Terms page
   - Create a new payment term
   - Edit an existing one
   - Verify CRUD operations work

**Deliverable**: Working Payment Terms form with full CRUD

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
