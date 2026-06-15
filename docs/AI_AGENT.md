# AI Metadata Context Guide for Fabriq Base

**When to read**: AI agent integration, LLM tool development, understanding metadata queries
**Related docs**: [BACKEND.md](./BACKEND.md), [WORKFLOWS.md](./WORKFLOWS.md), [BUSINESS_DOMAIN.md](./BUSINESS_DOMAIN.md), [agent/README.md](./agent/README.md) (agent system docs index, including reconciliation and categorization)

---

This document provides comprehensive context for AI agents to understand and work with the Fabriq Base metadata framework and workflow system. Use this as reference material for understanding the system architecture and generating appropriate metadata configurations.

## 🚨 CRITICAL REQUIREMENT: Always Query Real-Time Database State

**AI agents MUST use MCP PostgreSQL tools to query the actual database before explaining workflows, models, or permissions.** Do not rely on static documentation or assumptions. Always query the current state using the provided SQL patterns below.

**Example: When asked "Explain the purchase requisition workflow"**
1. First query: `SELECT * FROM workflow_flow WHERE model_name = 'purchase_requisition'`
2. Then query: `SELECT * FROM workflow_state WHERE flow_id = [result]`
3. Then query: `SELECT * FROM workflow_action WHERE source_state_id IN [states]`
4. Finally query: `SELECT * FROM workflow_instance WHERE flow_id = [flow_id] AND status = 'active'`
5. Provide explanation based on ACTUAL database results

## System Architecture Overview

### Core Components

1. **Metadata Framework**: Automatic REST API generation from Prisma schemas
2. **Workflow Engine**: State-based approval processes for transactional models  
3. **Permission System**: Role-based access control with field-level permissions
4. **Model Registry**: Business metadata for AI agent understanding
5. **Database Query Capabilities**: PostgreSQL MCP tools for real-time metadata queries
6. **Authentication System**: Local and external authentication providers with JWT tokens

### Key Principles

- **Automatic Route Generation**: Backend automatically generates identical REST routes for every model in `routes.ts`
- **View-Based Access**: Models are accessed through "views" that define permissions
- **Workflow Integration**: Transactional models automatically get workflow instances
- **Generic Frontend**: Single set of components handles all models
- **Real-time Metadata**: Query current database state before making changes

## Authentication System

### Overview
The Fabriq Base system supports multiple authentication providers with a unified JWT-based authentication flow. All API endpoints require authentication via JWT tokens.

### Authentication Providers

#### 1. Local Authentication Provider
**Purpose**: Internal authentication for development and testing
**Location**: `src/auth/adapters/local.ts`

**Features**:
- Email/password based authentication
- JWT token generation and validation
- Database user lookup by `external_id` (email)
- Role-based access control

**JWT Token Structure**:
```json
{
  "sub": "user@email.com",        // External ID (email) for database lookup
  "email": "user@email.com",      // User email
  "roles": ["Administrator"],     // User roles
  "iat": 1761072156,             // Issued at timestamp
  "exp": 1761158556              // Expiration timestamp
}
```

**Login Endpoint**:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@email.com",
  "password": "password"
}
```

**Response**:
```json
{
  "user": {
    "id": "user_id",
    "name": "User Name",
    "email": "user@email.com",
    "roles": ["Administrator"]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 2. Clerk Authentication Provider
**Purpose**: External authentication via Clerk service
**Location**: `src/auth/adapters/clerk.ts`

**Features**:
- External OAuth integration
- Clerk session management
- Automatic user synchronization

### Authentication Flow

#### 1. Login Process
1. **User submits credentials** → `POST /api/auth/login`
2. **System validates credentials** → Database lookup by email
3. **Password verification** → bcrypt comparison
4. **JWT token generation** → Contains user info and roles
5. **Response with token** → Client stores token for future requests

#### 2. Request Authentication
1. **Client sends request** → Includes `Authorization: Bearer <token>` header
2. **Auth middleware validates token** → JWT verification
3. **User lookup** → Database query by `external_id` (from JWT `sub` field)
4. **Permission loading** → User roles and permissions fetched
5. **Request proceeds** → With authenticated context

#### 3. Database User Model
```prisma
model user {
  id            String   @id @default(dbgenerated("'user_' || gen_random_uuid()"))
  email         String   @unique
  name          String?
  password      String?  // For local auth provider (bcrypt hashed)
  external_id   String   @unique @map("auth_id") // For external auth systems
  auth_provider String?  // 'local', 'clerk', etc.
  org_id        String?
  // ... other fields
}
```

### Authentication Middleware

**Location**: `src/auth/middleware.ts`

**Process**:
1. **Token extraction** → From `Authorization` header
2. **JWT verification** → Using configured secret
3. **User lookup** → Database query by `external_id`
4. **Permission loading** → Role-based permissions
5. **Context creation** → Attached to request object

**Request Context Structure**:
```typescript
interface AuthContext {
  user: {
    id: string;           // Database user ID
    email: string;        // User email
    org_id: string;       // Organization ID
    name: string;         // User name
  };
  permissions: Record<string, any>; // Model permissions
}
```

### API Usage Examples

#### 1. Login and Get Token
```bash
# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "bruce.wayne@wayneenterprises.com", "password": "password"}'

# Response
{
  "user": {
    "id": "user_bruce_wayne",
    "name": "Bruce Wayne",
    "email": "bruce.wayne@wayneenterprises.com",
    "roles": ["Administrator"]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 2. Authenticated API Request
```bash
# Get user profile
curl -X GET http://localhost:4000/api/metadata/user/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get model data
curl -X GET http://localhost:4000/api/posting/view/view_id \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Security Considerations

#### 1. JWT Token Security
- **Secret Key**: Configured via `JWT_SECRET` environment variable
- **Expiration**: Tokens expire after 24 hours by default
- **Validation**: All tokens verified on each request

#### 2. Password Security
- **Hashing**: Passwords stored using bcrypt
- **Salt**: Automatic salt generation
- **Verification**: Secure comparison during login

#### 3. Database Security
- **External ID Lookup**: Uses `external_id` field for user identification
- **Organization Isolation**: All queries filtered by `org_id`
- **Role-Based Access**: Permissions enforced at middleware level

### Development Setup

#### 1. Environment Variables
```bash
# Required for local authentication
JWT_SECRET=your-secret-key-here

# Database connection
DATABASE_URL=postgresql://user:password@localhost:5432/database
```

#### 2. User Creation
Users can be created via:
- **Setup Scripts**: `scripts/setup-dev-data.ts`
- **Database Seeding**: `prisma/seed.ts`
- **API Endpoints**: User management endpoints

#### 3. Testing Authentication
```bash
# Test login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password"}'

# Test authenticated endpoint
curl -X GET http://localhost:4000/api/metadata/user/me \
  -H "Authorization: Bearer <token>"
```

### Troubleshooting Authentication

#### Common Issues
1. **"User not authenticated"** → Check JWT token validity and user existence
2. **"Invalid credentials"** → Verify email/password combination
3. **"User not found"** → Ensure user exists with correct `external_id`
4. **Permission errors** → Check user roles and view permissions

#### Debug Steps
1. **Verify token**: Decode JWT to check `sub` field
2. **Check user exists**: Query database by `external_id`
3. **Validate permissions**: Check role assignments and view access
4. **Review logs**: Check server logs for authentication errors

## Metadata Framework Components

### 1. Prisma Schema Models

#### Data Models (`data.prisma`)
Contains core business entities:
- **Financial Models**: `account`, `posting`, `trade`, `holding`, `instrument`, `category`
- **Procurement Models**: `supplier`, `item_master`, `purchase_requisition`, `purchase_order`, `invoice`
- **Organizational Models**: `user`, `department`, `organization`

#### Metadata Models (`metadata.prisma`)
Contains framework infrastructure:
- **Permission System**: `role`, `view`, `permission`, `role_view`, `role_user`
- **Workflow System**: `workflow_flow`, `workflow_state`, `workflow_action`, `workflow_instance`, `workflow_history`
- **Organization**: `org`, `user`, `base_model`

### 2. Model Registry (`model-registry.json`)

Business metadata for each model including:
```json
{
  "name": "model_name",
  "description": "Business description",
  "businessContext": "Domain context",
  "examples": ["Example use cases"],
  "synonyms": ["Alternative names"]
}
```

### 3. Automatic Route Generation Pattern

The backend automatically generates identical REST routes for every model in `backend/src/rest/routes.ts`:

```typescript
// Backend automatically creates these routes for ALL models:
models.forEach(model => {
  const basePath = `/${model.toLowerCase()}`;
  
  // GET /model/view/:viewId - List records
  router.get(`${basePath}/view/:viewId`, authMiddleware, restService.getAll.bind(restService));
  
  // GET /model/:id/view/:viewId - Get single record  
  router.get(`${basePath}/:id/view/:viewId`, authMiddleware, restService.getById.bind(restService));
  
  // POST /model/view/:viewId - Create record
  router.post(`${basePath}/view/:viewId`, authMiddleware, restService.create.bind(restService));
  
  // PUT /model/:id/view/:viewId - Update record
  router.put(`${basePath}/:id/view/:viewId`, authMiddleware, restService.update.bind(restService));
  
  // DELETE /model/:id/view/:viewId - Delete record
  router.delete(`${basePath}/:id/view/:viewId`, authMiddleware, restService.delete.bind(restService));
  
  // POST /model/view/:viewId/search - Search with filters
  router.post(`${basePath}/view/:viewId/search`, authMiddleware, restService.search.bind(restService));
});
```

**Key Backend Features:**
- **Dynamic Route Generation**: Routes are created automatically for any model in the system
- **Consistent API Structure**: All models follow the same URL pattern
- **View-Based Access Control**: Every operation requires a `viewId` parameter for permission validation
- **Generic Service Layer**: Single `RestService` handles all model operations
- **Automatic Permission Enforcement**: All routes go through `authMiddleware` and permission checks

## Workflow System Components

### 1. Workflow Flow Structure

Each transactional model needs:
```typescript
{
  name: "Model Name Approval",
  model_name: "model_name",
  description: "Workflow description",
  is_active: true
}
```

### 2. Workflow States

States define the approval process:
```typescript
{
  name: "State Name",
  description: "State description",
  is_initial: boolean,
  is_final: boolean,
  assigned_for: "USER" | "ROLE" | "EXPRESSION",
  assigned_user_id?: string,
  assigned_role_id?: string,
  assigned_expression?: string,
  entry_conditions?: object,
  exit_conditions?: object
}
```

### 3. Workflow Actions

Actions connect states:
```typescript
{
  name: "Action Name",
  description: "Action description",
  source_state_id: string,
  target_state_id: string,
  conditions?: object,
  side_effects?: object
}
```

## Model Generation Patterns

### Pattern 1: Basic Model Setup

When a user describes a new business entity, generate:

1. **Prisma Model** (add to `data.prisma` or `zeiv.prisma`)
2. **Model Registry Entry** (add to `model-registry.json`)
3. **Default View** (create in database)
4. **Basic Permissions** (create role-view-permission relationships)

**Example: `expense_category`**

```prisma
model expense_category {
  id          String   @id @default(dbgenerated("'exca_' || gen_random_uuid()")) @db.VarChar(50)
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  org_id      String?
  assigned_to String?
  name        String
  description String?
  is_active   Boolean  @default(true)
  
  @@map("expense_category")
}
```

```json
"expense_category": {
  "name": "expense_category",
  "description": "Used for categorizing expense types and organizing expense reports",
  "businessContext": "Expense management and financial categorization",
  "examples": [
    "Create a new expense category",
    "Update category details",
    "View expense categories",
    "Assign categories to expense reports"
  ],
  "synonyms": [
    "expense type",
    "cost category",
    "expense classification"
  ]
}
```

### Pattern 2: Workflow Model Setup

When a user describes a transactional/approval process, generate:

1. **Prisma Model** with `wf_instance_id` field
2. **Model Registry Entry**
3. **Workflow Flow**
4. **Workflow States** (Draft, Review, Approved, etc.)
5. **Workflow Actions** (connecting states)
6. **Roles** (if needed)
7. **Views and Permissions**

**Example: `budget_request`**

```prisma
model budget_request {
  id             String   @id @default(dbgenerated("'budr_' || gen_random_uuid()")) @db.VarChar(50)
  created_by     String?
  modified_by    String?
  created_at     DateTime @default(now())
  modified_at    DateTime @updatedAt
  org_id         String?
  assigned_to   String?
  wf_instance_id String?
  
  title          String
  description    String?
  amount         Decimal  @db.Decimal(19, 4)
  currency       String   @default("USD")
  department_id  String?
  fiscal_year    String?
  status         String?
  
  workflow_instance workflow_instance? @relation(fields: [wf_instance_id], references: [id])
  department        department?         @relation(fields: [department_id], references: [id])
  
  @@map("budget_request")
}
```

### Pattern 3: Relationship Model Setup

When a user describes many-to-many relationships, generate:

1. **Junction Table Model**
2. **Model Registry Entry**
3. **Frontend Integration Notes**

**Example: `project_member`**

```prisma
model project_member {
  id         String   @id @default(dbgenerated("'prme_' || gen_random_uuid()")) @db.VarChar(50)
  created_by String?
  modified_by String?
  created_at DateTime @default(now())
  modified_at DateTime @updatedAt
  org_id     String?
  assigned_to String?
  
  project_id String
  user_id    String
  role       String? // e.g., 'lead', 'member', 'observer'
  joined_at  DateTime @default(now())
  
  project    project @relation(fields: [project_id], references: [id])
  user       user    @relation(fields: [user_id], references: [id])
  
  @@unique([project_id, user_id])
  @@map("project_member")
}
```

## Common Workflow Patterns

### 1. Simple Approval Workflow
```
Draft → Manager Review → Approved/Rejected
```

### 2. Multi-Level Approval Workflow
```
Draft → Manager Review → Finance Review → Approved/Rejected
```

### 3. Department-Based Workflow
```
Draft → Department Head → Finance → Approved/Rejected
```

### 4. Expression-Based Assignment
```sql
-- Assign to creator's manager
assigned_expression: 'created_by.manager'

-- Assign to department head
assigned_expression: 'department.head'
```

## Frontend Integration Patterns

### 1. State-Based Routing (Workflow Models)
```typescript
// After creating a workflow model record
navigate(`/${modelName}/${recordId}/state/Draft`);
```

### 2. View-Based Routing (Regular Models)
```typescript
// After creating a regular model record
navigate(`/${modelName}/${recordId}/view/default`);
```

### 3. Master Component Usage
```typescript
<Master
  type="model_name"
  view="model_name_view"
  displayName="Display Name"
  filterConfig={{ enableFilters: true, enableSearch: true }}
/>
```

## Permission Patterns

### 1. Wildcard Permissions
```sql
-- Grant read access to all fields
INSERT INTO permission (view_id, field_name, access) 
VALUES ('view_id', '*', 'read');
```

### 2. Field-Specific Permissions
```sql
-- Grant specific field permissions
INSERT INTO permission (view_id, field_name, access) VALUES
('view_id', 'name', 'write'),
('view_id', 'description', 'write'),
('view_id', 'amount', 'read');
```

### 3. Role-Based Views
```sql
-- Assign view to role
INSERT INTO role_view (role_id, view_id) 
VALUES ('role_id', 'view_id');
```

## Database Query Patterns for Understanding Current State

### Essential Metadata Queries

#### 1. Get Model Views and Permissions
```sql
SELECT 
    v.id, v.name, v.description, v.data_graph,
    p.field_name, p.access,
    r.id as role_id, r.name as role_name
FROM view v
LEFT JOIN permission p ON v.id = p.view_id
LEFT JOIN role_view rv ON v.id = rv.view_id
LEFT JOIN role r ON rv.role_id = r.id
WHERE v.model_name = 'invoice'
ORDER BY v.name, p.field_name
```

#### 2. Get Active Workflow Instances
```sql
SELECT 
    wi.id as instance_id,
    wi.model_id,
    wi.current_state,
    wi.status,
    wi.assigned_user_id,
    wi.created_at,
    wf.name as workflow_name,
    ws.name as current_state_name
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
LEFT JOIN workflow_state ws ON wi.current_state_id = ws.id
WHERE wf.model_name = 'invoice' 
    AND wi.status = 'active'
ORDER BY wi.created_at DESC
```

#### 3. Get Workflow Configuration
```sql
SELECT 
    wf.id, wf.name, wf.description, wf.is_active,
    ws.id as state_id, ws.name as state_name, ws.is_initial, ws.is_final,
    ws.assigned_for, ws.assigned_role_id, ws.assigned_expression,
    wa.id as action_id, wa.name as action_name, wa.description as action_description,
    ts.name as target_state_name
FROM workflow_flow wf
LEFT JOIN workflow_state ws ON wf.id = ws.flow_id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
LEFT JOIN workflow_state ts ON wa.target_state_id = ts.id
WHERE wf.model_name = 'invoice'
ORDER BY ws.name, wa.name
```

#### 4. Get System Overview
```sql
-- Get all models with view counts
SELECT DISTINCT v.model_name, COUNT(v.id) as view_count
FROM view v
GROUP BY v.model_name
ORDER BY v.model_name

-- Get all workflow flows
SELECT wf.name, wf.model_name, wf.description, wf.is_active,
       COUNT(ws.id) as state_count,
       COUNT(wa.id) as action_count
FROM workflow_flow wf
LEFT JOIN workflow_state ws ON wf.id = ws.flow_id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
GROUP BY wf.id, wf.name, wf.model_name, wf.description, wf.is_active
ORDER BY wf.model_name
```

## Best Practices

### 1. Naming Conventions
- **Models**: Use snake_case (`budget_request`)
- **Views**: Use `{model}_view` pattern (`budget_request_view`)
- **Roles**: Use descriptive names (`Budget Manager`, `Finance Approver`)
- **States**: Use clear action names (`Draft`, `Manager Review`, `Approved`)

### 2. Workflow Design
- Always start with `Draft` state (`is_initial: true`)
- Always end with `Approved`/`Rejected` states (`is_final: true`)
- Use clear, descriptive state names
- Consider parallel approval paths for complex workflows

### 3. Permission Design
- Start with wildcard read permissions (`*: read`)
- Add specific write permissions for editable fields
- Use role-based views for different user types
- Test permission inheritance through roles

### 4. Model Relationships
- Use junction tables for many-to-many relationships
- Include `org_id` for multi-tenant support
- Add `wf_instance_id` for workflow-enabled models
- Use proper foreign key constraints

### 5. Database Query Best Practices
- Always query current state before making changes
- Use specific field queries instead of wildcards when possible
- Check for existing views/permissions before creating new ones
- Validate role assignments before granting access
- Use transaction blocks for complex metadata changes

## Key Database Tables

- `view` - Model views with data_graph configuration
- `permission` - Field-level access control
- `role` - User roles
- `role_view` - Role-view assignments
- `workflow_flow` - Workflow definitions
- `workflow_state` - Workflow states
- `workflow_action` - State transitions
- `workflow_instance` - Active workflow instances

## AI Agent Integration Guidelines

### 1. CRITICAL: Always Query Real-Time Metadata First

**Before explaining any workflow, model, or permission configuration, AI agents MUST:**

1. **Query Current Database State** using MCP PostgreSQL tools
2. **Understand Actual Configuration** rather than making assumptions
3. **Provide Accurate Information** based on real data

**Example Workflow:**
```
User: "Explain the purchase requisition workflow"
AI Response Process:
1. Query: SELECT * FROM workflow_flow WHERE model_name = 'purchase_requisition'
2. Query: SELECT * FROM workflow_state WHERE flow_id = [result]
3. Query: SELECT * FROM workflow_action WHERE source_state_id IN [states]
4. Query: SELECT * FROM workflow_instance WHERE flow_id = [flow_id] AND status = 'active'
5. Provide explanation based on ACTUAL database state
```

### 2. Essential MCP Queries for Real-Time Understanding

#### Query Current Workflow Configuration
```sql
-- Get complete workflow setup for any model
SELECT 
    wf.id, wf.name, wf.description, wf.is_active,
    ws.id as state_id, ws.name as state_name, ws.is_initial, ws.is_final,
    ws.assigned_for, ws.assigned_role_id, ws.assigned_expression,
    wa.id as action_id, wa.name as action_name, wa.description as action_description,
    ts.name as target_state_name
FROM workflow_flow wf
LEFT JOIN workflow_state ws ON wf.id = ws.flow_id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
LEFT JOIN workflow_state ts ON wa.target_state_id = ts.id
WHERE wf.model_name = 'purchase_requisition'
ORDER BY ws.name, wa.name
```

#### Query Active Workflow Instances
```sql
-- Get current active instances
SELECT 
    wi.id as instance_id, wi.model_id, wi.current_state, wi.status,
    wi.assigned_user_id, wi.created_at,
    wf.name as workflow_name, ws.name as current_state_name
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
LEFT JOIN workflow_state ws ON wi.current_state_id = ws.id
WHERE wf.model_name = 'purchase_requisition' AND wi.status = 'active'
ORDER BY wi.created_at DESC
```

#### Query Model Views and Permissions
```sql
-- Get current view and permission configuration
SELECT 
    v.id, v.name, v.description, v.data_graph,
    p.field_name, p.access,
    r.id as role_id, r.name as role_name
FROM view v
LEFT JOIN permission p ON v.id = p.view_id
LEFT JOIN role_view rv ON v.id = rv.view_id
LEFT JOIN role r ON rv.role_id = r.id
WHERE v.model_name = 'purchase_requisition'
ORDER BY v.name, p.field_name
```

### 3. Response Pattern for Workflow Explanations

**When explaining workflows, AI agents should:**

1. **Start with Database Query**: "Let me check the current purchase requisition workflow configuration..."
2. **Show Real Data**: Display actual states, actions, and current instances
3. **Explain Based on Facts**: "Based on the current configuration, the workflow has these states..."
4. **Provide Context**: "Currently, there are X active instances in Y state..."

**Example Response Structure:**
```
## Purchase Requisition Workflow Analysis

### Current Configuration (from database):
- **Workflow Name**: Purchase Requisition Approval
- **States**: Draft → Manager Review → Finance Review → Approved/Rejected
- **Active Instances**: 3 currently in "Manager Review" state
- **Assigned Roles**: Manager role, Finance role

### Workflow Flow:
[Draft] --Submit--> [Manager Review] --Approve--> [Finance Review] --Approve--> [Approved]
                                    --Reject--> [Rejected]        --Reject--> [Rejected]

### Current Active Instances:
- PR-001: In Manager Review (assigned to Manager Role)
- PR-002: In Finance Review (assigned to Finance Role)
- PR-003: In Draft (assigned to User)
```

### 4. Model Resolution with Real-Time Context
The system automatically resolves models from user intent using:
- Model registry synonyms
- Business context matching
- Example query patterns
- **REAL-TIME database queries to verify current state**

### 5. Permission Validation with Live Data
All operations automatically validate:
- User authentication
- Role-based access
- Field-level permissions
- Organization context
- **Current database state**

### 6. Context Building Process
When users describe business processes:
1. **Query Current State**: Use MCP tools to get actual database configuration
2. **Understand the Domain**: Use model registry to understand business context
3. **Identify Model Type**: Determine if it's a basic entity or transactional workflow
4. **Analyze Existing Setup**: Check current views, permissions, and workflows
5. **Generate Appropriate Metadata**: Create complete setup based on current state
6. **Provide Implementation Guidance**: Include SQL commands and frontend integration notes

## Analytical Query Capabilities

The AI agent includes advanced analytical query capabilities for answering complex business questions that require aggregations, multi-table joins, and workflow analysis.

### Question Classification System

The agent automatically classifies user questions to determine the appropriate handling strategy:

#### Transactional Queries (2 steps max)
- Simple CRUD operations
- Single record lookups
- Basic searches

**Examples:**
- "Create a new purchase requisition"
- "Show me PR-001"
- "Update the supplier name"

#### Analytical Queries (5-8 steps max)
- Aggregations (count, sum, average)
- Workflow state analysis
- Cross-module queries
- Pending approval analysis

**Examples:**
- "How many PRs are pending manager approval?"
- "What is the average wait time for approvals?"
- "Who raised this PR and who is it pending with?"
- "Show me the total spend by department"

### Analytics Tools

#### 1. getAnalyticsContext Tool

**Purpose:** Provides schema context, multi-tenancy rules, and actual workflow state names from the database.

**CRITICAL:** This tool fetches **real workflow state names** from the database, ensuring the LLM uses exact values like "Manager Review" instead of guessing names like "Pending Approval".

**Returns:**
```json
{
  "user": {
    "org_id": "org_techflow_us",
    "user_id": "user_123",
    "note": "ALWAYS use org_id in WHERE clause for business table queries"
  },
  "accessibleModels": ["purchase_requisition", "invoice", ...],
  "multiTenancyRules": {
    "businessTables": ["purchase_requisition", "workflow_instance", ...],
    "metadataTables": ["workflow_flow", "workflow_state", "role", ...]
  },
  "workflow": {
    "actualStates": {
      "note": "USE THESE EXACT STATE NAMES - do not guess!",
      "byModel": {
        "purchase_requisition": [
          { "state_name": "Draft", "state_id": "...", "is_initial": true },
          { "state_name": "Buyer Review", "state_id": "...", "sequence": 2 },
          { "state_name": "Manager Review", "state_id": "...", "sequence": 3 }
        ]
      }
    },
    "activeInstancesSummary": {
      "data": [
        { "model_name": "purchase_requisition", "state_name": "Manager Review", "count": 1, "avg_hours_in_state": 97.34 }
      ]
    }
  }
}
```

#### 2. analyticsQuery Tool

**Purpose:** Executes analytical SQL queries with permission and multi-tenancy enforcement.

**Parameters:**
- `query` - SQL SELECT query (must include org_id for business tables)
- `description` - What the query is answering
- `step` - Current step number in multi-step analysis (1, 2, 3...)
- `reasoning` - Why this query is needed
- `uiHint` - How to display results (table, metrics, chart, card)

**Example Multi-Step Analysis:**
```
Step 1: Get workflow state ID for "Manager Review"
Step 2: Count instances in that state and calculate average wait time
Step 3: Get details of assigned users
```

### Multi-Tenancy Rules

**CRITICAL:** All queries must respect multi-tenancy:

| Table Type | org_id Filter | Examples |
|------------|---------------|----------|
| Business Tables | **REQUIRED** | purchase_requisition, invoice, workflow_instance |
| Metadata Tables | **NOT NEEDED** | workflow_flow, workflow_state, role, view |

```sql
-- ✅ CORRECT: Business table with org_id
SELECT COUNT(*) FROM purchase_requisition WHERE org_id = 'org_techflow_us';

-- ✅ CORRECT: Metadata table without org_id  
SELECT * FROM workflow_state WHERE flow_id = 'flow_123';

-- ❌ WRONG: Business table missing org_id
SELECT COUNT(*) FROM purchase_requisition;
```

### Analytics Prompt Loading

For analytical questions, the system automatically:
1. Classifies the question as `analytical`
2. Requests `promptTypes: ['analytics', 'default']`
3. Loads the analytics-specific prompt template
4. Provides analytics tools instead of CRUD tools

### Example Analytics Queries

#### Count PRs Pending Approval
```
User: "How many PRs are waiting for manager approval?"

Agent Process:
1. Classify as 'analytical' → maxSteps: 5
2. Call getAnalyticsContext → Get actual state names
3. Find "Manager Review" in actualStates
4. Call analyticsQuery:
   SELECT COUNT(*) 
   FROM purchase_requisition pr
   JOIN workflow_instance wi ON pr.wf_instance_id = wi.id
   JOIN workflow_state ws ON wi.current_state_id = ws.id
   WHERE ws.name = 'Manager Review' 
     AND wi.org_id = 'org_techflow_us'
```

#### Average Wait Time by State
```
User: "What's the average wait time for approvals?"

Agent Process:
1. Call getAnalyticsContext → Get schema and org_id
2. Use the averageWaitTime query pattern:
   SELECT 
     ws.name as state_name,
     COUNT(*) as count,
     AVG(EXTRACT(EPOCH FROM (NOW() - wi.modified_at))/3600) as avg_hours
   FROM workflow_instance wi
   JOIN workflow_flow wf ON wi.flow_id = wf.id
   JOIN workflow_state ws ON wi.current_state_id = ws.id
   WHERE wi.status = 'active' 
     AND wi.org_id = 'org_techflow_us'
   GROUP BY ws.name
```

#### Who Raised and Who Is It Pending With
```
User: "Who raised the pending PR and who is it assigned to?"

Agent Process:
1. Call getAnalyticsContext
2. Call analyticsQuery (Step 1): Get pending PRs
3. Call analyticsQuery (Step 2): Join with user table for requester
4. Call analyticsQuery (Step 3): Get assigned user details
```

### Configuration

#### Enable Analytics Prompt Templates

1. **Sync prompt templates to database:**
```bash
cd backend
npx ts-node prisma/sync-prompt-templates.ts
```

2. **Or use local files (development):**
```bash
# In backend/.env
USE_LOCAL_PROMPT=true
```

#### Analytics Prompt Template Location
```
backend/prisma/metadata/prompt-templates/
├── view_{view_id}_analytics_{app_name}.json  # Metadata
└── view_{view_id}_analytics_{app_name}.txt   # Prompt content
```

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Question                                 │
│              "How many PRs are pending manager approval?"            │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Question Classifier                               │
│  • Detects: "how many", "pending", "approval" → ANALYTICAL          │
│  • Sets: maxSteps = 5, promptTypes = ['analytics', 'default']       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Tool Selection                                    │
│  • getAnalyticsContext  (schema + actual state names)               │
│  • analyticsQuery       (permission-aware SQL execution)            │
│  • searchRecords        (for lookups during analysis)               │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    LLM with Analytics Prompt                         │
│  1. Call getAnalyticsContext → Get org_id, actual state names       │
│  2. Find "Manager Review" in actualStates (NOT "Pending Approval")  │
│  3. Call analyticsQuery with correct state name                     │
│  4. Format and present results                                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Response                                      │
│  "There is 1 PR in Manager Review state, pending for 97 hours,      │
│   assigned to Daniel Lee (daniel.lee@techflowsolutions.com)"        │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/agent/utils/questionClassifier.ts` | Classifies questions as transactional or analytical |
| `src/agent/tools/analyticsContext.ts` | Provides schema context and actual workflow states |
| `src/agent/tools/analyticsQuery.ts` | Executes analytical SQL with multi-tenancy enforcement |
| `src/agent/ToolManager.ts` | Selects tools based on question classification |
| `src/agent/AgentService.ts` | Orchestrates classification, prompt loading, and execution |

## ERP Integration Handlers

### Overview

The AI agent system includes a specialized handler layer for ERP connector methods located in `backend/src/agent/handlers/erp/`. These handlers are **AI-agent-specific** and provide a wrapper/adapter layer between the AI agent tool system and the existing ERP connector implementations.

### Purpose and Rationale

**Why handlers exist:**

1. **Parameter Validation & Transformation**: Handlers validate and transform parameters from AI tool calls before invoking the underlying ERP connector methods
2. **Context Resolution**: Handlers can automatically resolve parameters from request context (e.g., `context.recordId` → `externalId` for purchase orders)
3. **AI Tool Integration**: Provides a consistent interface for the AI agent tool system (`erpConnector` tool) to interact with ERP connectors

**Why they're AI-agent-specific:**

- **REST API** (`rest/routes.ts`): Calls ERP connector methods directly without handlers
- **Workflow Actions** (`lib/actions/purchase_order.ts`): Calls ERP connector methods directly without handlers
- **Tests**: Call ERP connector methods directly without handlers
- **AI Agent Only**: Uses handlers via `getHandler()` in `AgentTools.ts`

The handlers are **not required** for other parts of the system - they're exclusively for the AI agent's tool system.

### Architecture

```
AI Agent Tool Call (erpConnector)
    ↓
Handler (agent/handlers/erp/) 
    • Validates parameters
    • Resolves context (e.g., recordId → externalId)
    • Provides consistent interface
    ↓
ERP Connector (lib/integrations/connectors/)
    • Actual implementation (ZohoBooksConnector, QuickBooksConnector)
    ↓
ERP API Client
    • Makes HTTP calls to external ERP systems
```

### Handler Structure

Each handler implements the `ERPMethodHandler` interface:

```typescript
interface ERPMethodHandler {
  method: string;                    // Method name (e.g., 'getPurchaseOrder')
  validateParams(params?, context?, auth?): any;  // Parameter validation
  execute(connector, params, context?, auth?): Promise<any>;  // Execution
  requiresContext?: boolean;         // Whether context is needed
  description?: string;              // Description for AI prompts
}
```

### Current Handlers

Located in `backend/src/agent/handlers/erp/`:

1. **`getPurchaseOrder.ts`**: 
   - Fetches purchase orders from ERP systems
   - Supports automatic resolution from `context.recordId` for purchase_order model
   - Validates `externalId` parameter or resolves from context

2. **`getExpenseAccounts.ts`**:
   - Fetches expense accounts from ERP systems
   - No parameters required

3. **`getSystemType.ts`**:
   - Returns ERP system type identifier (e.g., 'zoho_books', 'quickbooks')
   - No parameters required

### Registry Pattern

Handlers are registered in `registry.ts` using a registry pattern:

- **Automatic Registration**: All handlers in the `erp/` directory are automatically registered
- **Fast Lookup**: Handler map is populated on first access for O(1) lookup
- **Extensibility**: New methods can be added by creating handler files without modifying core tool code

### Adding New ERP Methods

To add support for a new ERP connector method:

1. **Create Handler File**: Create `backend/src/agent/handlers/erp/<methodName>.ts`
2. **Implement Interface**: Implement `ERPMethodHandler` interface
3. **Register**: Import and add to handlers array in `registry.ts`
4. **No Core Changes**: The `erpConnector` tool automatically discovers new methods

**Example:**
```typescript
// backend/src/agent/handlers/erp/getVendors.ts
export const getVendorsHandler: ERPMethodHandler = {
  method: 'getVendors',
  requiresContext: false,
  description: 'Get all vendors from the ERP system',
  
  validateParams(params?: any): any {
    // Validate parameters if needed
    return {};
  },
  
  async execute(connector: ERPConnector): Promise<any> {
    return await connector.getVendors();
  },
};
```

### Key Files

| File | Purpose |
|------|---------|
| `src/agent/handlers/erp/registry.ts` | Handler registry and lookup functions |
| `src/agent/handlers/erp/types.ts` | `ERPMethodHandler` interface definition |
| `src/agent/handlers/erp/getPurchaseOrder.ts` | Purchase order retrieval handler |
| `src/agent/handlers/erp/getExpenseAccounts.ts` | Expense accounts retrieval handler |
| `src/agent/handlers/erp/getSystemType.ts` | System type retrieval handler |
| `src/agent/AgentTools.ts` | Uses handlers via `getHandler()` in `erpConnector` tool |

### Relationship to ERP Connectors

The handlers **do not implement** the ERP connector methods - those are already implemented in:
- `lib/integrations/connectors/types.ts` - Interface definition
- `lib/integrations/zoho_books/connectors/purchase_order_connector.ts` - Zoho implementation
- `lib/integrations/quickbooks/connectors/purchase_order_connector.ts` - QuickBooks implementation

The handlers are a **thin wrapper layer** that adds:
- Parameter validation for AI tool calls
- Context-aware parameter resolution
- Consistent error handling for the AI agent

---

This guide provides everything needed for AI agents to understand the Fabriq Base system and generate appropriate metadata configurations for any business process described by users.
