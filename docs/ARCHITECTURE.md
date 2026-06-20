# Fabriq Financial Suite - Architecture Guide

**When to read**: Understanding how the system works, building new features, debugging issues
**Related docs**: [BACKEND.md](./BACKEND.md), [FRONTEND.md](./FRONTEND.md), [AUTHENTICATION_AND_AUTHORIZATION.md](./AUTHENTICATION_AND_AUTHORIZATION.md)

---

## Project Overview

Fabriq is a **metadata-driven financial management platform** that automatically generates full-stack CRUD applications from Prisma schemas. The system provides integrated modules for procurement, sales, accounting, and investment tracking through a unified, permission-controlled platform.

### Unified Application

**Important**: The frontend (frontend-1) is now a **unified application** that includes all business modules:

**Procurement Module:**
- ✅ Purchase Requisition - Request items for purchase with multi-level approval
- ✅ Purchase Order - Convert approved requisitions to purchase orders
- ✅ Invoice Management - Process supplier invoices
- ✅ Supplier Management - Manage vendor relationships
- ✅ Item Master - Product/service catalog
- ✅ Approval Workflows - State-based approval processes

**Sales Module:**
- ✅ Customer Management - Manage customer relationships
- ✅ Quotes - Create and manage sales quotes
- ✅ Sales Orders - Order-to-cash process with workflow
- ✅ Delivery Challans - Track goods delivery
- ✅ Credit Notes - Handle returns and adjustments

**Accounting & Bookkeeping:**
- ✅ Postings - Double-entry bookkeeping transactions
- ✅ Accounts - Chart of accounts with hierarchical structure
- ✅ Categories & Category Groups - Expense/income classification

**Investment Management:**
- ✅ Instruments - Investment instrument catalog
- ✅ Trades - Trade execution (buy/sell)
- ✅ Holdings - Portfolio tracking

### Core Innovation

The entire platform operates on a **metadata-driven architecture** where:
- ✅ Define a Prisma model → Get automatic REST & GraphQL APIs
- ✅ Create a view → Get field-level permissions and data access
- ✅ Add a workflow → Get state-based approval processes
- ✅ Add a frontend route → Get complete CRUD UI with zero custom code

---

## Repository Structure

### Backend: `backend` (TypeScript/Node.js)
```
backend/
├── src/
│   ├── auth/                    # JWT + multi-provider authentication
│   ├── workflow-engine/         # State machine workflow system
│   ├── agent/                   # AI agent for natural language queries
│   ├── services/
│   │   ├── core/ModelService.ts        # Core CRUD operations
│   │   ├── dal/DataAccessLayer.ts      # Prisma abstraction layer
│   │   ├── permissions/PermissionService.ts  # RBAC engine
│   │   └── query/SearchQueryBuilder.ts # Query DSL
│   ├── rest/
│   │   ├── RestService.ts       # Generic REST service
│   │   └── routes.ts            # Auto-generated routes
│   ├── schema/SchemaBuilder.ts  # GraphQL schema generator
│   ├── models/ModelRegistry.ts  # Entity definition registry
│   ├── utils/PrismaSchemaParser.ts  # Schema parser
│   └── lib/extractors/          # PDF document extraction (AI)
├── prisma/
│   └── schema/
│       ├── data.prisma          # Business models
│       ├── metadata.prisma      # Framework models (view, role, workflow)
│       └── zeiv.prisma          # Additional models
└── model-registry.json          # Business context metadata
```

### Frontend: `frontend-1` (React/TypeScript)
```
frontend-1/
├── src/
│   ├── pages/
│   │   └── Master.tsx           # Generic master data component
│   ├── components/
│   │   ├── forms/Masters/       # Model-specific forms
│   │   ├── masters/table-columns/  # Dynamic table generators
│   │   ├── chat/ChatUI.tsx      # Context-aware AI chat
│   │   └── ui/                  # Shadcn/UI components
│   ├── contexts/
│   │   ├── AuthContext.tsx      # Authentication state
│   │   └── ChatContext.tsx      # Chat context management
│   ├── api/api.ts               # Unified API client
│   └── models/                  # TypeScript interfaces
└── App.tsx                      # Route definitions
```

---

## Backend Architecture: Metadata-Driven Framework

### 1. Request to Response Flow

```
CLIENT REQUEST (with JWT token)
    ↓
[Auth Middleware]
    → Verify JWT token (LocalAuthAdapter/ClerkAdapter/Auth0/Cognito)
    → Load user from database by external_id
    → Fetch user roles via PermissionService
    → Create AuthContext: { user, permissions }
    ↓
[Route Handler - RestService]
    → Extract modelName from path (e.g., "invoice")
    → Extract viewName from query/body
    → Parse filters, pagination, sort options
    ↓
[ModelService]
    → Fetch view definition from database
    → Parse data_graph (which fields/relations to select)
    → Validate user has permission for the model
    → Build Prisma query options
    ↓
[PermissionService]
    → Validate model-level permissions (read/write)
    → Validate field-level permissions for each requested field
    → Check wildcard permissions ("*" grants all)
    ↓
[DataAccessLayer]
    → Add org_id filter (multi-tenancy isolation)
    → Add user filters (status, search terms)
    → Execute: prisma[modelName].findMany(...)
    → Get total count for pagination
    → Filter response fields by permissions
    ↓
[Response]
    {
      success: true,
      data: [...filtered records...],
      metaData: {...view data_graph...},
      total: 150,
      page: 1,
      pageSize: 10
    }
```

### 2. Automatic Route Generation

Every Prisma model automatically gets these REST endpoints:

```typescript
For model "invoice":

GET    /api/invoice                          → getAll()
GET    /api/invoice/:id                      → getById()
POST   /api/invoice                          → create()
PUT    /api/invoice/:id                      → update()
DELETE /api/invoice/:id                      → delete()
POST   /api/invoice/search                   → search() with filters

// Legacy view-based routes
GET    /api/invoice/view/:viewId             → getAll() with view
POST   /api/invoice/view/:viewId/search      → search() with view

// Relationship management
POST   /api/invoice/:id/:relation            → addChildrenToParent()
PUT    /api/invoice/:id/:relation/:childId   → updateChild()
DELETE /api/invoice/:id/:relation/:childId   → deleteRelation()
```

### 3. View-Based Access Control

**Core Concept**: Views are the central abstraction for permissions.

```typescript
User → has → Roles → have → RoleViews → reference → Views → have → Permissions

View {
  id: "admin_invoice_view",
  name: "admin",
  model_name: "invoice",
  data_graph: {
    select: {
      id: true,
      amount: true,
      status: true,
      vendor: {
        select: { id: true, name: true }
      }
    }
  },
  permissions: [
    { field_name: "amount", access: "write" },
    { field_name: "status", access: "read" },
    { field_name: "*", access: "read" }  // Wildcard grants all fields
  ]
}
```

**Permission Evaluation**:
1. Load all views accessible to user's roles
2. Consolidate permissions: `{ invoice: { amount: 'write', status: 'read', ... } }`
3. Wildcard `*` grants access to all fields
4. Take most permissive level when roles overlap
5. Validate on EVERY query/mutation
6. Filter response to include only accessible fields

### 4. Multi-Tenancy & Security

**Organization Isolation**:
- Every user belongs to an `org_id`
- Every data model has `org_id` field
- DataAccessLayer automatically adds: `WHERE org_id = user.org_id`
- Metadata models (role, view, workflow) exempt from filter

**Multi-Level Security**:
1. **Organization**: Isolated by org_id
2. **Model**: Must have at least one permission
3. **Field**: Each field validated against permission map
4. **Operation**: Separate 'read' and 'write' permissions
5. **Wildcard**: `{ "*": "write" }` grants full access

### 5. Search & Query Builder

Converts REST filters to Prisma queries:

```typescript
POST /api/invoice/search
Body: {
  filters: [
    { field: "amount", operator: "gte", value: 1000 },
    { field: "status", operator: "in", value: ["pending", "approved"] }
  ],
  sortOption: "-created_at",
  page: 1,
  pageSize: 20
}

Converts to Prisma:
{
  where: {
    amount: { gte: 1000 },
    status: { in: ["pending", "approved"] },
    org_id: "user-org-id"  // Auto-added for multi-tenancy
  },
  orderBy: { created_at: 'desc' },
  skip: 0,
  take: 20
}
```

**Supported Operators**: eq, neq, gt, gte, lt, lte, in, nin, contains, startsWith, endsWith, is_null, and, or, not, some, every, none

---

## Frontend Architecture: Dynamic UI from Metadata

### 1. Master Component - The Heart of the UI

A **completely generic component** that works for ANY model:

```tsx
<Master
  type="supplier"              // Model name
  view="supplier_view"         // View for metadata
  displayName="Suppliers"      // Human-readable name
  filterConfig={{ enableFilters: true }}
  defaultSortOption={{ field: 'name', direction: 'asc' }}
/>
```

**What it does**:
1. Fetches data + metadata from `/api/${type}/view/${view}/search`
2. Passes metadata to `DynamicTable` for auto-column generation
3. Handles pagination, filtering, searching, sorting
4. Provides bulk operations (delete, export)
5. Manages create/edit forms

### 2. Routing Patterns

**A. View-Based Routing** (for master data):
```tsx
// List page
<Route path="master/procurement/supplier" element={
  <Master type="supplier" view="supplier_view" displayName="Suppliers" />
} />

// Form page (create/edit)
<Route path="supplier/:id/view/:viewId" element={<SupplierForm />} />
<Route path="supplier/view/:viewId" element={<SupplierForm />} />
```

**B. State-Based Routing** (for workflow entities):
```tsx
// List by workflow state
<Route path="purchase_requisition/state/:stateId" element={<PurchaseRequisition />} />

// Detail page with workflow actions
<Route path="purchase_requisition/:id/state/:stateId" element={<PRDetailsPage />} />
```

### 3. API Integration

```typescript
export const viewAPI = {
  // List with metadata
  search: (type, view, page, pageSize, searchTerm, filters, sortOption) =>
    fetchAPI(`/api/${type}/view/${view}/search`, {
      method: "POST",
      body: JSON.stringify({ filters, page, pageSize, sortOption })
    }),

  // Single record with metadata
  getById: (type, id, view) =>
    fetchAPI(`/api/${type}/${id}/view/${view}`),

  // Create
  create: (type, view, data) =>
    fetchAPI(`/api/${type}/view/${view}`, {
      method: "POST",
      body: JSON.stringify(data)
    }),

  // Update
  update: (type, id, view, data) =>
    fetchAPI(`/api/${type}/${id}/view/${view}`, {
      method: "PUT",
      body: JSON.stringify(data)
    }),

  // Delete
  delete: (type, id, view) =>
    fetchAPI(`/api/${type}/${id}/view/${view}`, {
      method: "DELETE"
    })
};
```

---

## Adding a New Model: Step-by-Step

### Backend Steps:

**1. Define Prisma Model** (`prisma/schema/data.prisma`):
```prisma
model vendor {
  id              String   @id @default(dbgenerated("'vend_' || gen_random_uuid()")) @db.VarChar(50)
  created_by      String?
  modified_by     String?
  created_at      DateTime @default(now())
  modified_at     DateTime @updatedAt
  org_id          String?
  assigned_to     String?
  
  name            String
  email           String?  @unique
  phone           String?
  
  @@map("vendor")
}
```

**2. Run Migrations**:
```bash
cd backend
npx prisma db push
npx prisma generate
```

**3. Create View & Permissions** (via SQL or admin UI):
```sql
-- Create view
INSERT INTO view (id, name, model_name, data_graph, description)
VALUES (
  'vendor_view',
  'vendor_view',
  'vendor',
  '{"select": {"id": true, "name": true, "email": true, "phone": true}}',
  'Default vendor view'
);

-- Grant wildcard permission
INSERT INTO permission (id, view_id, field_name, access)
VALUES (gen_random_uuid(), 'vendor_view', '*', 'write');

-- Assign to Admin role
INSERT INTO role_view (id, role_id, view_id)
SELECT gen_random_uuid(), r.id, 'vendor_view'
FROM role r WHERE r.name = 'Administrator';
```

**That's it for backend!** Routes are auto-generated.

### Frontend Steps:

**4. Add Routes** (`src/App.tsx`):
```tsx
// List page
<Route path="master/procurement/vendor" element={
  <Master type="vendor" view="vendor_view" displayName="Vendors" />
} />

// Form pages
<Route path="vendor/:id/view/:viewId" element={<VendorForm />} />
<Route path="vendor/view/:viewId" element={<VendorForm />} />
```

**5. Create Form Component** (`src/components/forms/Masters/VendorForm.tsx`)

**6. Add Navigation** (update sidebar config)

### What You Get Automatically:

✅ **Backend**: All CRUD endpoints, GraphQL, permissions
✅ **Frontend**: Paginated list, search, filters, create/edit/delete, bulk operations, AI chat integration

---

## Key Architectural Patterns

### 1. Metadata as Single Source of Truth
- Prisma schema defines data structure
- Views define permissions and data access
- Frontend adapts to metadata dynamically

### 2. Convention Over Configuration
- URL pattern: `/{modelName}/{id?}/view/{viewId}`
- API pattern: `/api/{modelName}/view/{viewName}`
- Consistent everywhere

### 3. Separation of Concerns
- **Backend**: Business logic, permissions, workflows
- **Frontend**: Presentation, user interactions
- **Metadata**: Configuration, access control

### 4. Security in Depth
- Organization-level isolation
- Model-level permissions
- Field-level access control
- Row-level security (future)

---

## Database Schema Patterns

### Standard Model Fields
```prisma
model example {
  id          String   @id @default(dbgenerated("'exmp_' || gen_random_uuid()")) @db.VarChar(50)
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  org_id      String?  // For multi-tenancy
  assigned_to String?  // For task assignment

  // Your fields here

  @@map("example")
}
```

### Workflow-Enabled Model
Add this field:
```prisma
wf_instance_id String?
workflow_instance workflow_instance? @relation(fields: [wf_instance_id], references: [id])
```

---

## Best Practices

### Security
- ✅ Always use views for data access
- ✅ Never bypass permission checks
- ✅ Validate org_id in custom endpoints
- ✅ Use transactions for multi-step operations

### Performance
- ✅ Use data_graph to limit selected fields
- ✅ Add database indexes for filtered fields
- ✅ Paginate large result sets
- ✅ Cache metadata queries

### Code Quality
- ✅ Follow naming conventions (snake_case for DB, camelCase for TS)
- ✅ Write Zod schemas for validation
- ✅ Add JSDoc comments for complex logic
- ✅ Use TypeScript strict mode

---

## Debugging Tips

### Backend Issues

**Permission Denied**:
1. Check user roles: `SELECT * FROM role_user WHERE user_id = ?`
2. Check role views: `SELECT * FROM role_view WHERE role_id = ?`
3. Check view permissions: `SELECT * FROM permission WHERE view_id = ?`
4. Check wildcard: Does permission include `field_name = '*'`?

**Data Not Showing**:
1. Check org_id: Is data in same org as user?
2. Check view data_graph: Are fields included in select?
3. Check permissions: Does user have read access?

### Frontend Issues

**Table Not Rendering**:
1. Check metadata: Is `isColumnShow: true`?
2. Check API response: Is `metaData` present?
3. Check console for errors

**Form Not Submitting**:
1. Check Zod validation errors
2. Check network tab for API errors
3. Check backend logs for permission errors

---

**End of Architecture Guide**

