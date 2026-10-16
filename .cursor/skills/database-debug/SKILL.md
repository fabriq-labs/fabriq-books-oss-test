---
name: fabriq-database-debug
description: Debug Fabriq Books PostgreSQL database with read-only queries. Use this skill when investigating data issues, counting records, checking workflow states, or verifying permissions.
license: Project-specific skill for Fabriq Books application
---

This skill enables debugging the Fabriq Books PostgreSQL database through read-only SQL queries. It provides model understanding, multi-tenancy rules, and common query patterns to help investigate data issues safely.

## Skill Selection Guide

**Use THIS skill (`fabriq-database-debug`) for**:
- Record counts and simple aggregations
- Single-table lookups
- Basic workflow state queries
- Quick data verification
- Simple permission checks

**Use ADVANCED skill (`fabriq-advanced-db-skill`) for**:
- "Why can't user X do Y?" → Permission chain analysis
- "Workflow is stuck" → Deep workflow debugging
- "Data looks wrong" → Data integrity checks
- "Trace transaction flow" → Cross-module queries (PR → PO → Invoice)
- "Who changed what?" → Audit trail analysis
- Complex multi-table JOINs (3+ tables)

The advanced skill is located at: `.cursor/skills/advanced-db-debug/SKILL.md`

## When to Use This Skill

Use this skill when you need to:
- Count records (e.g., "How many item_masters does an organization have?")
- Check workflow approval status (e.g., "Are there any pending approvals for user X?")
- Verify user permissions and roles
- Investigate data inconsistencies
- Understand relationships between models
- Debug workflow states and transitions

**Important**: This skill is **READ-ONLY**. Only SELECT queries are allowed. No INSERT, UPDATE, DELETE, or DDL operations.

## Database Connection

### Step 1: Read DATABASE_URL Dynamically

The skill must read the `DATABASE_URL` from the backend environment file dynamically for each query:

1. Extract the connection string from `backend/.env` using a terminal command:
   ```bash
   grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//'
   ```
2. This ensures the connection string is always current and read from the source of truth

**Example**:
```
DATABASE_URL=postgresql://user:password@localhost:5432/fabriq_db
```

### Step 2: Execute Queries with psql

Use `psql` command-line tool to execute read-only queries directly against the database.

**Query Execution Pattern**:
1. Dynamically read `DATABASE_URL` from `backend/.env`
2. Compose a SQL SELECT query based on the user's question
3. Execute the query using `psql` with the connection string:
   ```bash
   psql "${DATABASE_URL}" -c "SELECT ..."
   ```
4. Return the formatted results to the user

**Important**: Always use read-only SELECT queries. The `psql` command will execute the query and return results in a formatted table.

## Core Data Models

### Business Data Models

These models contain business data and **MUST** be filtered by `org_id` for multi-tenancy:

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `item_master` | Product/service catalog | `id`, `item_code`, `item_name`, `org_id` |
| `supplier` | Vendor information | `id`, `supplier_name`, `org_id` |
| `customers` | Customer information | `id`, `customer_name`, `org_id` |
| `invoice` | Invoices (PURCHASE or SALES) | `id`, `invoice_number`, `invoice_type`, `org_id`, `wf_instance_id` |
| `invoice_line_item` | Invoice line items | `id`, `instance_id` (FK to invoice), `item_master_id` |
| `purchase_requisition` | Purchase requests | `id`, `pr_number`, `org_id`, `wf_instance_id` |
| `item` | PR line items | `id`, `instance_id` (FK to purchase_requisition), `product_id` |
| `purchase_order` | Purchase orders | `id`, `po_number`, `org_id`, `wf_instance_id` |
| `purchase_order_item` | PO line items | `id`, `instance_id` (FK to purchase_order) |
| `sales_order` | Sales orders | `id`, `so_number`, `customer_id`, `org_id`, `wf_instance_id` |
| `sales_order_item` | SO line items | `id`, `sales_order_id` |

### Metadata/System Models

These models are **NOT** filtered by `org_id` (they are system-wide):

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `user` | System users | `id`, `email`, `name`, `org_id` (user's organization) |
| `org` | Organizations (multi-tenant) | `id`, `name`, `slug` |
| `organizations` | Organization details | `id`, `organization_name`, `org_id` |
| `role` | User roles | `id`, `name` |
| `role_user` | User-role assignments | `id`, `user_id`, `role_id` |
| `role_view` | Role-view assignments | `id`, `role_id`, `view_id` |
| `view` | Data access views | `id`, `name`, `model_name`, `data_graph` |
| `permission` | Field-level permissions | `id`, `view_id`, `field_name`, `access` |
| `workflow_flow` | Workflow definitions | `id`, `name`, `model_name` |
| `workflow_state` | Workflow states | `id`, `flow_id`, `name`, `assigned_for`, `assigned_role_id`, `assigned_user_id` |
| `workflow_action` | State transitions | `id`, `source_state_id`, `target_state_id`, `name` |
| `workflow_instance` | Active workflow instances | `id`, `flow_id`, `model_id`, `current_state`, `current_state_id`, `assigned_user_id`, `status` |
| `workflow_history` | Workflow audit trail | `id`, `instance_id`, `from_state`, `to_state`, `performed_by`, `performed_at` |

## Multi-Tenancy Rules

**CRITICAL**: Fabriq Books is a multi-tenant application. All business data is isolated by organization.

### ALWAYS Filter by `org_id`

When querying business data models, **ALWAYS** include `org_id` in the WHERE clause:

```sql
-- ✅ CORRECT
SELECT COUNT(*) FROM item_master WHERE org_id = 'org_abc123';

-- ❌ WRONG - Missing org_id filter
SELECT COUNT(*) FROM item_master;
```

**Models that require org_id filtering**:
- `item_master`, `supplier`, `customers`
- `invoice`, `invoice_line_item`
- `purchase_requisition`, `item`, `purchase_order`, `purchase_order_item`
- `sales_order`, `sales_order_item`
- `delivery_challan`, `credit_note`, `quote`
- `account`, `posting`, `category`
- All other business data models

### NEVER Filter by `org_id`

Metadata/system tables are **NOT** filtered by org_id:

```sql
-- ✅ CORRECT - No org_id needed
SELECT * FROM view WHERE model_name = 'invoice';

-- ❌ WRONG - Don't filter metadata by org_id
SELECT * FROM view WHERE model_name = 'invoice' AND org_id = 'org_abc123';
```

**Models that should NOT be filtered by org_id**:
- `view`, `permission`
- `role`, `role_user`, `role_view`
- `workflow_flow`, `workflow_state`, `workflow_action`
- `org` (this is the organization table itself)

**Exception**: `workflow_instance` and `workflow_history` DO have `org_id` fields and should be filtered when querying business workflow instances.

## Common Query Templates

### 1. Count Records per Organization

```sql
-- Count item_masters per organization
SELECT org_id, COUNT(*) as item_count 
FROM item_master 
GROUP BY org_id
ORDER BY item_count DESC;
```

### 2. Pending Workflow Approvals for a User

```sql
-- Find all pending approvals assigned to a specific user
SELECT 
    wi.id as instance_id,
    wi.model_id,
    wi.current_state,
    wf.name as workflow_name,
    wf.model_name,
    ws.name as state_name,
    wi.created_at,
    wi.modified_at
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
JOIN workflow_state ws ON wi.current_state_id = ws.id
WHERE wi.status = 'active' 
  AND wi.assigned_user_id = 'user_xyz789'  -- Replace with actual user_id
ORDER BY wi.created_at DESC;
```

### 3. Check User's Roles and Permissions

```sql
-- Get all roles for a user
SELECT 
    r.id as role_id,
    r.name as role_name,
    ru.created_at as assigned_at
FROM role r
JOIN role_user ru ON r.id = ru.role_id
WHERE ru.user_id = 'user_xyz789';  -- Replace with actual user_id

-- Get all views accessible to a user through their roles
SELECT DISTINCT
    v.id as view_id,
    v.name as view_name,
    v.model_name,
    r.name as role_name
FROM view v
JOIN role_view rv ON v.id = rv.view_id
JOIN role r ON rv.role_id = r.id
JOIN role_user ru ON r.id = ru.role_id
WHERE ru.user_id = 'user_xyz789';  -- Replace with actual user_id
```

### 4. Invoices by Status

```sql
-- Count invoices by status for an organization
SELECT 
    invoice_status,
    invoice_type,
    COUNT(*) as count,
    SUM(invoice_total) as total_amount
FROM invoice 
WHERE org_id = 'org_abc123'  -- Replace with actual org_id
GROUP BY invoice_status, invoice_type
ORDER BY count DESC;
```

### 5. Workflow State for a Specific Record

```sql
-- Get workflow state and available actions for a record
SELECT 
    wi.id as instance_id,
    wi.model_id,
    wi.current_state,
    wi.status as instance_status,
    ws.name as state_name,
    ws.assigned_for,
    ws.assigned_role_id,
    ws.assigned_user_id,
    wa.name as available_action,
    wa.target_state_id
FROM workflow_instance wi
JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
WHERE wi.model_id = 'preq_xyz123'  -- Replace with actual record ID
  AND wi.status = 'active';
```

## Safety Rules

**READ-ONLY ENFORCEMENT**:

1. **Only SELECT statements** are allowed
2. **No DDL**: Do not execute CREATE, ALTER, DROP, TRUNCATE
3. **No DML**: Do not execute INSERT, UPDATE, DELETE
4. **No transactions**: Do not use BEGIN, COMMIT, ROLLBACK
5. **No system functions**: Avoid functions that modify database state

**Data Sensitivity**:
- Be cautious when displaying user passwords (they should be hashed anyway)
- Do not expose connection strings or API keys in query results
- Respect data privacy when querying user data

## Documentation References

For deeper understanding, refer to these documentation files:

- **[../../CLAUDE.md](../../CLAUDE.md)** - Quick debugging SQL examples (lines 127-142) and system overview
- **[../../docs/kernel/metadata.md](../../docs/kernel/metadata.md)** and **[../../docs/kernel/tenancy.md](../../docs/kernel/tenancy.md)** - views, permissions, and org scope
- **[../../docs/WORKFLOWS.md](../../docs/WORKFLOWS.md)** - Workflow engine details, schema relationships, debugging tips
- **[../../docs/BUSINESS_DOMAIN.md](../../docs/BUSINESS_DOMAIN.md)** - Business context, module relationships, business rules

## Query Composition Guidelines

When composing queries:

1. **Identify the model**: Determine which Prisma model(s) contain the data you need
2. **Check relationships**: Use JOINs to connect related models (e.g., `workflow_instance` → `workflow_state`)
3. **Apply org_id filter**: Always filter business data by `org_id` unless querying metadata
4. **Use appropriate aggregations**: COUNT, SUM, AVG, GROUP BY for statistics
5. **Limit results**: Use LIMIT for large result sets
6. **Validate model names**: Table names in PostgreSQL match Prisma model names (snake_case)

## Example Workflows

### Example 1: "How many item_masters does org X have?"

1. Dynamically read `DATABASE_URL` from `backend/.env` using terminal command
2. Compose query: `SELECT COUNT(*) FROM item_master WHERE org_id = 'org_X'`
3. Execute via `psql "${DATABASE_URL}" -c "SELECT COUNT(*) FROM item_master WHERE org_id = 'org_X'"`
4. Return result: "Organization X has 150 item_masters"

### Example 2: "Are there pending approvals for user Y?"

1. Dynamically read `DATABASE_URL` from `backend/.env` using terminal command
2. Compose query using template #2 above with `user_id = 'user_Y'`
3. Execute via `psql "${DATABASE_URL}" -c "SELECT ..."`
4. Return list of pending approvals with workflow details

### Example 3: "What's the workflow state of purchase_requisition Z?"

1. Dynamically read `DATABASE_URL` from `backend/.env` using terminal command
2. Compose query using template #5 above with `model_id = 'preq_Z'`
3. Execute via `psql "${DATABASE_URL}" -c "SELECT ..."`
4. Return current state, assigned user, and available actions

## Notes

- The Prisma schema is split across multiple files in `backend/prisma/schema/`:
  - `data.prisma` - Core business models
  - `metadata.prisma` - System/metadata models
  - `sales.prisma` - Sales module models
  - `zeiv.prisma` - Procurement and master data models
- For complex queries involving multiple models, refer to the full Prisma schema files
- Table names in PostgreSQL use snake_case (matching Prisma model names)
- All models include standard audit fields: `created_by`, `modified_by`, `created_at`, `modified_at`
