# Session 2: Understanding the Metadata-Driven Framework
## Developer Onboarding Workbook

**Duration**: 3 hours  
**Objective**: Understand how the system automatically generates CRUD from Prisma models through a metadata-driven architecture.

---

## Prerequisites

Before starting, ensure you have:

- [ ] Completed Session 1 (IDE Setup)
- [ ] Backend server running (`npm run dev` in backend folder)
- [ ] Frontend server running (`npm run dev` in frontend-1 folder)
- [ ] Can login to the application
- [ ] Prisma Studio accessible (`npx prisma studio` in backend folder)

---

## Part 1: The Core Concept - Metadata-Driven Architecture

**Time**: 30 minutes

### What is Metadata-Driven Architecture?

In traditional applications, you write code for each feature:
- Create API endpoints manually
- Write database queries
- Build UI forms
- Implement permissions

**In Fabriq, the framework does this automatically!**

### The Magic Formula

```
Prisma Model → Auto REST API → View (permissions) → Dynamic UI
```

**What this means**:
1. **Define a Prisma model** → Framework generates REST API automatically
2. **Create a view** → Framework applies permissions and controls data access
3. **Add a route** → Framework renders UI automatically

### Example: The Supplier Model

Let's trace how a simple model becomes a full-featured CRUD interface:

#### Step 1: Prisma Model Definition

**Location**: `backend/prisma/schema/data.prisma`

**Example - Supplier Model**:
```prisma
model supplier {
  id          String   @id @default(dbgenerated("'supp_' || gen_random_uuid()"))
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  org_id      String?  // Multi-tenancy isolation
  
  supplier_name String
  email         String?
  phone         String?
  
  @@map("supplier")
}
```

**What happens automatically**:
- ✅ Database table created
- ✅ REST API endpoints generated
- ✅ TypeScript types generated

#### Step 2: View Definition

**Location**: Database `view` table or `backend/prisma/metadata/views/`

**Example - Supplier View**:
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

**What this controls**:
- Which fields are accessible
- Which relations to include
- How data is structured

#### Step 3: Permissions

**Location**: Database `permission` table

**Example - Supplier Permissions**:
```sql
-- Grant write access to all fields
INSERT INTO permission (view_id, field_name, access)
VALUES ('supplier_view', '*', 'write');
```

**What this controls**:
- Who can read fields
- Who can write fields
- Field-level security

#### Step 4: Automatic API Generation

**What you get automatically**:
```
GET    /api/supplier/view/supplier_view              → List all suppliers
GET    /api/supplier/:id/view/supplier_view          → Get one supplier
POST   /api/supplier/view/supplier_view              → Create supplier
PUT    /api/supplier/:id/view/supplier_view          → Update supplier
DELETE /api/supplier/:id/view/supplier_view          → Delete supplier
POST   /api/supplier/view/supplier_view/search        → Search with filters
```

**No code written!** The framework generates these automatically.

#### Step 5: Dynamic UI

**Location**: `frontend-1/src/pages/Master.tsx`

**Example - Generic List Component**:
```tsx
<Master
  type="supplier"              // Model name
  view="supplier_view"         // View name
  displayName="Suppliers"      // Human-readable name
/>
```

**What you get automatically**:
- ✅ Paginated list table
- ✅ Search functionality
- ✅ Filter capabilities
- ✅ Create/Edit/Delete buttons
- ✅ Form validation

---

### Exercise 1: Trace a Request from UI to Database

**Time**: 15 minutes

**Objective**: Follow a data request through the entire stack

#### Steps:

1. **Open Frontend Code**:
   - Navigate to: `frontend-1/src/pages/Master.tsx`
   - Find the `useEffect` that fetches data
   - See how it calls: `viewAPI.search('supplier', 'supplier_view', ...)`

2. **Check API Client**:
   - Navigate to: `frontend-1/src/api/api.ts`
   - Find `viewAPI.search` function
   - See how it constructs: `/api/supplier/view/supplier_view/search`

3. **Open Backend Routes**:
   - Navigate to: `backend/src/rest/routes.ts`
   - Find how routes are auto-generated
   - See the pattern: `/api/:model/view/:view/search`

4. **Check Model Service**:
   - Navigate to: `backend/src/services/core/ModelService.ts`
   - Find the `search` method
   - See how it:
     - Loads view definition
     - Validates permissions
     - Builds Prisma query
     - Executes query

5. **Check Permission Service**:
   - Navigate to: `backend/src/services/permissions/PermissionService.ts`
   - See how it validates field-level access

6. **Check Data Access Layer**:
   - Navigate to: `backend/src/services/dal/DataAccessLayer.ts`
   - See how it:
     - Adds `org_id` filter (multi-tenancy)
     - Executes Prisma query
     - Filters response by permissions

7. **Test in Browser**:
   - Open browser DevTools → Network tab
   - Navigate to Suppliers page
   - See the actual API call
   - Inspect request/response

**Deliverable**: 
- [ ] Can explain the flow: UI → API → Service → Database
- [ ] Understand where each step happens
- [ ] Can see the actual API call in browser DevTools

---

## Part 2: Prisma Models - The Foundation

**Time**: 45 minutes

### Understanding Prisma Models

Prisma models define your database schema. They are the **single source of truth** for your data structure.

### Standard Model Pattern

Every model in Fabriq follows this pattern:

```prisma
model example_model {
  // 1. Primary Key
  id          String   @id @default(dbgenerated("'exmp_' || gen_random_uuid()"))
  
  // 2. Audit Fields (Standard)
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  
  // 3. Multi-tenancy
  org_id      String?
  
  // 4. Task Assignment (Optional)
  assigned_to String?
  
  // 5. Workflow Integration (Optional)
  wf_instance_id String?
  workflow_instance workflow_instance? @relation(...)
  
  // 6. Your Business Fields
  name        String
  description String?
  
  // 7. Relations (Optional)
  category    category? @relation(...)
  
  // 8. Table Mapping
  @@map("example_model")
}
```

### Example: Real Supplier Model

**Location**: `backend/prisma/schema/data.prisma`

**Find and examine the supplier model**:

```prisma
model supplier {
  id          String   @id @default(dbgenerated("'supp_' || gen_random_uuid()"))
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  org_id      String?
  
  supplier_name String
  email         String?  @unique
  phone         String?
  address       String?
  
  // Relations
  payment_term_id String?
  payment_terms   payment_terms? @relation(...)
  
  @@map("supplier")
}
```

**Key Observations**:
- ✅ Standard audit fields present
- ✅ `org_id` for multi-tenancy
- ✅ Business fields (supplier_name, email, phone)
- ✅ Relation to `payment_terms` model
- ✅ Unique constraint on email

### Exercise 2: Explore Models

**Time**: 20 minutes

**Task**: Examine different models to understand patterns

1. **Find Supplier Model**:
   ```bash
   # In backend folder
   grep -A 20 "model supplier" prisma/schema/data.prisma
   ```
   - Note all fields
   - Note relations
   - Note constraints (@unique, etc.)

2. **Find Invoice Model**:
   ```bash
   grep -A 30 "model invoice" prisma/schema/data.prisma
   ```
   - Note `wf_instance_id` field (workflow integration)
   - Note relations to other models
   - Note business fields

3. **Find Purchase Requisition Model**:
   ```bash
   grep -A 30 "model purchase_requisition" prisma/schema/data.prisma
   ```
   - Note workflow field
   - Note relations
   - Note line items relation

4. **Compare Patterns**:
   - What fields are common to all models?
   - Which models have workflows?
   - How are relations defined?

**Deliverable**:
- [ ] Can identify standard fields in any model
- [ ] Understand how relations work
- [ ] Can distinguish workflow-enabled models

---

## Part 3: Views and Permissions - Access Control

**Time**: 60 minutes

### What are Views?

**Views** are the central abstraction for permissions in Fabriq. They define:
- Which fields are accessible
- Which relations to include
- How data is structured

### View Structure

**Location**: Database `view` table

**Example - Supplier View**:

```json
{
  "id": "supplier_view",
  "name": "supplier_view",
  "model_name": "supplier",
  "description": "Default view for supplier master data",
  "data_graph": {
    "select": {
      "id": true,
      "supplier_name": true,
      "email": true,
      "phone": true,
      "address": true,
      "payment_terms": {
        "select": {
          "id": true,
          "payment_terms": true
        }
      }
    }
  }
}
```

**What this means**:
- Only selected fields are returned
- Relations are included via nested `select`
- This becomes the Prisma query structure

### Exercise 3: Explore Views in Prisma Studio

**Time**: 15 minutes

1. **Open Prisma Studio**:
   ```bash
   cd backend
   npx prisma studio
   ```

2. **Navigate to `view` table**:
   - Click on `view` in the left sidebar
   - Find `supplier_view`
   - Click to view details

3. **Examine `data_graph`**:
   - See the JSON structure
   - Note which fields are selected
   - Note nested relations

4. **Compare Different Views**:
   - Look at `invoice_view`
   - Look at `purchase_order_view`
   - Compare their `data_graph` structures

**Key Insight**: The `data_graph` directly maps to Prisma's `select` syntax!

### Permissions - Field-Level Access Control

**Permissions** control who can read/write specific fields.

### Permission Structure

**Location**: Database `permission` table

**Example - Supplier Permissions**:

```sql
-- Wildcard permission (grants all fields)
INSERT INTO permission (view_id, field_name, access)
VALUES ('supplier_view', '*', 'write');

-- OR specific field permissions
INSERT INTO permission (view_id, field_name, access) VALUES
  ('supplier_view', 'supplier_name', 'write'),
  ('supplier_view', 'email', 'write'),
  ('supplier_view', 'phone', 'read'),  -- Read-only
  ('supplier_view', 'address', 'write');
```

**Permission Types**:
- `read` - Can see the field
- `write` - Can edit the field
- `none` - Cannot access the field

**Wildcard `*`**:
- `{ "*": "write" }` - Grants write access to ALL fields
- `{ "*": "read" }` - Grants read access to ALL fields

### Exercise 4: Explore Permissions

**Time**: 15 minutes

1. **In Prisma Studio, navigate to `permission` table**

2. **Filter by view**:
   - Filter: `view_id = 'supplier_view'`
   - See all permissions for supplier view

3. **Check for wildcard**:
   - Look for `field_name = '*'`
   - This grants access to all fields

4. **Check specific fields**:
   - See individual field permissions
   - Note access levels (read/write/none)

5. **Check role assignments**:
   - Navigate to `role_view` table
   - Find which roles have access to `supplier_view`
   - See: Role → RoleView → View → Permissions

**Key Insight**: Permissions are evaluated in this order:
1. Check wildcard permissions first
2. Then check specific field permissions
3. Most permissive level wins

### Role-Based Access Control (RBAC)

**How it works**:

```
User → has → Roles → have → RoleViews → reference → Views → have → Permissions
```

**Example**:
1. User "John" has role "Buyer"
2. Role "Buyer" has access to `supplier_view`
3. `supplier_view` has permissions:
   - `*` = write (all fields)
4. Therefore, John can read/write all supplier fields

### Exercise 5: Trace User Permissions

**Time**: 15 minutes

1. **Find a user in Prisma Studio**:
   - Navigate to `user` table
   - Find `admin@example.com`
   - Note the user ID

2. **Find user's roles**:
   - Navigate to `role_user` table
   - Filter: `user_id = '<admin-user-id>'`
   - See which roles the user has

3. **Find role's views**:
   - Navigate to `role_view` table
   - Filter by one of the role IDs
   - See which views the role has access to

4. **Check view permissions**:
   - For each view, check `permission` table
   - See what permissions exist

5. **Test in UI**:
   - Login as admin user
   - Navigate to Suppliers page
   - Try creating/editing
   - Verify you have full access

**Deliverable**:
- [ ] Can trace user → roles → views → permissions
- [ ] Understand how RBAC works
- [ ] Can identify permission issues

---

## Part 4: Automatic API Generation

**Time**: 45 minutes

### How APIs are Generated

The framework automatically creates REST endpoints for every Prisma model.

### API Route Pattern

**Location**: `backend/src/rest/routes.ts`

**For any model `{model}`, you get**:

```
GET    /api/{model}                          → getAll()
GET    /api/{model}/:id                      → getById()
POST   /api/{model}                          → create()
PUT    /api/{model}/:id                      → update()
DELETE /api/{model}/:id                      → delete()
POST   /api/{model}/search                   → search() with filters

// View-based routes (legacy)
GET    /api/{model}/view/{viewId}            → getAll() with view
POST   /api/{model}/view/{viewId}/search     → search() with view
GET    /api/{model}/:id}/view/{viewId}         → getById() with view
POST   /api/{model}/view/{viewId}             → create() with view
PUT    /api/{model}/:id/view/{viewId}         → update() with view
DELETE /api/{model}/:id/view/{viewId}         → delete() with view
```

### Example: Supplier API Endpoints

**Automatically generated**:
```
GET    /api/supplier                          → List all suppliers
GET    /api/supplier/:id                      → Get one supplier
POST   /api/supplier                          → Create supplier
PUT    /api/supplier/:id                      → Update supplier
DELETE /api/supplier/:id                      → Delete supplier
POST   /api/supplier/search                   → Search suppliers

// With view
GET    /api/supplier/view/supplier_view       → List with permissions
POST   /api/supplier/view/supplier_view/search → Search with permissions
```

**No code written!** These are generated automatically.

### Request Flow

**Example: Creating a Supplier**

1. **Frontend sends request**:
   ```typescript
   POST /api/supplier/view/supplier_view
   Body: {
     supplier_name: "Acme Corp",
     email: "contact@acme.com",
     phone: "123-456-7890"
   }
   ```

2. **Route handler** (`backend/src/rest/routes.ts`):
   - Extracts `model` = "supplier"
   - Extracts `viewId` = "supplier_view"
   - Calls `RestService.create()`

3. **RestService** (`backend/src/rest/RestService.ts`):
   - Loads view definition
   - Validates request
   - Calls `ModelService.create()`

4. **ModelService** (`backend/src/services/core/ModelService.ts`):
   - Validates model exists
   - Checks permissions
   - Calls `PermissionService.validate()`

5. **PermissionService** (`backend/src/services/permissions/PermissionService.ts`):
   - Checks user roles
   - Validates field-level permissions
   - Returns allowed fields

6. **DataAccessLayer** (`backend/src/services/dal/DataAccessLayer.ts`):
   - Adds `org_id` filter
   - Executes Prisma query
   - Returns result

7. **Response**:
   ```json
   {
     "success": true,
     "data": {
       "id": "supp_abc123",
       "supplier_name": "Acme Corp",
       "email": "contact@acme.com",
       "phone": "123-456-7890",
       "org_id": "org_123",
       "created_at": "2024-01-12T10:00:00Z"
     }
   }
   ```

### Exercise 6: Observe API Calls in Browser

**Time**: 20 minutes

1. **Open Browser DevTools**:
   - Press F12 or Right-click → Inspect
   - Go to "Network" tab
   - Clear existing requests

2. **Navigate to Suppliers Page**:
   - In the application, go to Suppliers
   - Watch the Network tab

3. **Observe the API Call**:
   - You should see: `POST /api/supplier/view/supplier_view/search`
   - Click on it to see details
   - **Request**:
     ```json
     {
       "page": 1,
       "pageSize": 10,
       "filters": [],
       "sortOption": null
     }
     ```
   - **Response**:
     ```json
     {
       "success": true,
       "data": [...suppliers...],
       "metaData": {...},
       "total": 25,
       "page": 1,
       "pageSize": 10
     }
     ```

4. **Create a New Supplier**:
   - Click "Create" button
   - Fill in form
   - Submit
   - Watch Network tab

5. **Observe Create API Call**:
   - You should see: `POST /api/supplier/view/supplier_view`
   - **Request**: Your form data
   - **Response**: Created supplier object

6. **Edit a Supplier**:
   - Click on a supplier
   - Make changes
   - Save
   - Watch Network tab

7. **Observe Update API Call**:
   - You should see: `PUT /api/supplier/:id/view/supplier_view`
   - **Request**: Updated data
   - **Response**: Updated supplier object

**Deliverable**:
- [ ] Can identify API endpoints in Network tab
- [ ] Understand request/response structure
- [ ] Can trace API calls

---

## Part 5: Multi-Tenancy - Organization Isolation

**Time**: 15 minutes

### What is Multi-Tenancy?

Every user belongs to an organization (`org_id`). All data is automatically filtered by organization.

### How It Works

**Example**:
- User A belongs to `org_123`
- User B belongs to `org_456`
- When User A queries suppliers, they only see suppliers with `org_id = 'org_123'`
- User B sees completely different data

### Automatic Filtering

**Location**: `backend/src/services/dal/DataAccessLayer.ts`

**The framework automatically adds**:
```typescript
where: {
  ...userFilters,
  org_id: user.org_id  // Auto-added for all queries
}
```

### Exercise 7: Verify Multi-Tenancy

**Time**: 10 minutes

1. **Check User's Org ID**:
   - In Prisma Studio, find your user
   - Note the `org_id` value

2. **Check Supplier Records**:
   - Navigate to `supplier` table
   - Filter by your `org_id`
   - See only your organization's suppliers

3. **Create a Test Supplier**:
   - In the UI, create a new supplier
   - In Prisma Studio, check the new record
   - Verify `org_id` matches your user's `org_id`

**Key Insight**: You can never accidentally see or modify data from another organization!

---

## Part 6: Hands-On Exercise - Complete Flow

**Time**: 30 minutes

### Exercise 8: End-to-End Trace

**Objective**: Trace a complete operation from UI to database and back

**Task**: Create a new supplier and trace it through the entire system

#### Steps:

1. **Start in UI**:
   - Navigate to Suppliers page
   - Click "Create" button
   - Fill in form:
     - Name: "Test Supplier"
     - Email: "test@example.com"
     - Phone: "555-1234"

2. **Watch Network Tab**:
   - See the API call
   - Note the endpoint
   - Note the request body

3. **Check Backend Logs**:
   - Look at terminal where backend is running
   - See any log messages

4. **Verify in Database**:
   - Open Prisma Studio
   - Navigate to `supplier` table
   - Find your new record
   - Verify all fields
   - Verify `org_id` is set
   - Verify `created_by` is set

5. **Refresh UI**:
   - Go back to Suppliers list
   - See your new supplier appears
   - Click on it to view details

6. **Edit the Supplier**:
   - Change the phone number
   - Save
   - Watch Network tab for update call
   - Verify in database that `modified_at` changed

7. **Delete the Supplier**:
   - Delete the test supplier
   - Watch Network tab for delete call
   - Verify in database it's gone

**Deliverable**:
- [ ] Successfully created a supplier
- [ ] Traced the request through all layers
- [ ] Verified data in database
- [ ] Understood the complete flow

---

## Summary & Key Takeaways

### What You've Learned

1. **Metadata-Driven Architecture**:
   - Prisma models automatically generate APIs
   - Views control data access
   - UI is dynamically generated

2. **Prisma Models**:
   - Standard pattern with audit fields
   - Relations between models
   - Workflow integration

3. **Views & Permissions**:
   - Views define accessible fields
   - Permissions control read/write access
   - RBAC through roles

4. **Automatic API Generation**:
   - Every model gets CRUD endpoints
   - No manual API code needed
   - Consistent patterns

5. **Multi-Tenancy**:
   - Automatic organization isolation
   - Data security built-in

### Key Files Reference

| File | Purpose |
|------|---------|
| `backend/prisma/schema/data.prisma` | Model definitions |
| `backend/src/services/core/ModelService.ts` | Core CRUD logic |
| `backend/src/services/permissions/PermissionService.ts` | RBAC engine |
| `backend/src/rest/routes.ts` | Auto-generated routes |
| `frontend-1/src/pages/Master.tsx` | Generic list component |
| `frontend-1/src/api/api.ts` | API client |

### Next Steps

- [ ] Read `docs/ARCHITECTURE.md` for deeper understanding
- [ ] Explore more models in Prisma schema
- [ ] Experiment with views and permissions
- [ ] Prepare for Session 3: Forms & Views Configuration

---

## Session 2 Completion Checklist

Before moving to Session 3, ensure:

- [ ] Understand the Prisma Model → API → View → UI flow
- [ ] Can explain how views control data access
- [ ] Can trace a request from UI to database
- [ ] Understand permission system basics
- [ ] Can identify API endpoints in browser DevTools
- [ ] Understand multi-tenancy concept
- [ ] Completed all exercises
- [ ] No blocking questions

**If all checkboxes are complete, you're ready for Session 3!**

---

**End of Session 2 Workbook**
