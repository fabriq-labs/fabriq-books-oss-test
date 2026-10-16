---
name: fabriq-advanced-db-skill
description: Advanced database debugging for Fabriq Books. Use for permission chain analysis, workflow debugging, data integrity checks, and cross-module tracing.
license: Project-specific skill for Fabriq Books application
---

This skill provides advanced database debugging capabilities for the Fabriq Books application, including complex multi-table queries, permission chain analysis, workflow debugging, and cross-module tracing.

## Skill Selection Guide

| Question Type | Recommended Skill |
|---------------|-------------------|
| Simple counts, lookups | `fabriq-database-debug` (basic) |
| "Why can't user X do Y?" | **This skill** (permission chain) |
| "Workflow is stuck" | **This skill** (workflow debugging) |
| "Data looks wrong" | **This skill** (data integrity) |
| "Trace PR → PO → Invoice" | **This skill** (cross-module) |
| "Who changed what?" | **This skill** (audit trail) |

## Prerequisites

This skill builds on `fabriq-database-debug`. Before using this skill, ensure you understand:
- Multi-tenancy rules (org_id filtering)
- Basic model structure
- Database connection method (psql via `backend/.env`)

Reference: `.cursor/skills/database-debug/SKILL.md`

## Entity Reference

For comprehensive model relationships, foreign keys, and join paths, read:

**`.cursor/skills/advanced-db-debug/BUSINESS_MODELS.md`**

**Read BUSINESS_MODELS.md when**:
- Query involves 3+ tables
- Need to understand FK relationships
- Debugging cross-module issues
- Unsure about join paths

## Database Connection

Same as basic skill - dynamically read `DATABASE_URL` from `backend/.env`:

```bash
# Extract connection string
DATABASE_URL=$(grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//')

# Execute query
psql "${DATABASE_URL}" -c "SELECT ..."
```

---

## Permission Chain Debugging

Use these queries when investigating "permission denied" or "user can't access" issues.

### 1. Full Permission Chain for a User

Traces the complete path: User → Roles → Views → Permissions

```sql
-- Step 1: Get user's roles
SELECT 
    u.id as user_id,
    u.email,
    u.name as user_name,
    r.id as role_id,
    r.name as role_name
FROM "user" u
JOIN role_user ru ON u.id = ru.user_id
JOIN role r ON ru.role_id = r.id
WHERE u.id = '{USER_ID}';

-- Step 2: Get views accessible via those roles
SELECT DISTINCT
    r.name as role_name,
    v.id as view_id,
    v.name as view_name,
    v.model_name
FROM role r
JOIN role_user ru ON r.id = ru.role_id
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
WHERE ru.user_id = '{USER_ID}'
ORDER BY v.model_name, v.name;

-- Step 3: Get permissions for a specific model
SELECT 
    v.name as view_name,
    v.model_name,
    p.field_name,
    p.access
FROM view v
JOIN role_view rv ON v.id = rv.view_id
JOIN role_user ru ON rv.role_id = ru.role_id
JOIN permission p ON v.id = p.view_id
WHERE ru.user_id = '{USER_ID}'
  AND v.model_name = '{MODEL_NAME}'
ORDER BY v.name, p.field_name;
```

### 2. Combined Permission Chain Query

Single query to get all permissions for a user on a model:

```sql
SELECT 
    u.email,
    r.name as role_name,
    v.name as view_name,
    v.model_name,
    p.field_name,
    p.access
FROM "user" u
JOIN role_user ru ON u.id = ru.user_id
JOIN role r ON ru.role_id = r.id
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
JOIN permission p ON v.id = p.view_id
WHERE u.id = '{USER_ID}'
  AND v.model_name = '{MODEL_NAME}'
ORDER BY r.name, v.name, p.field_name;
```

### 3. Find Roles with Access to a Model

```sql
SELECT DISTINCT
    r.id as role_id,
    r.name as role_name,
    v.name as view_name,
    string_agg(DISTINCT p.access, ', ') as access_levels
FROM role r
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
JOIN permission p ON v.id = p.view_id
WHERE v.model_name = '{MODEL_NAME}'
GROUP BY r.id, r.name, v.name
ORDER BY r.name;
```

### 4. Users with Wildcard Permissions

Find users who have full access (field_name = '*'):

```sql
SELECT DISTINCT
    u.id as user_id,
    u.email,
    r.name as role_name,
    v.name as view_name,
    v.model_name,
    p.access
FROM "user" u
JOIN role_user ru ON u.id = ru.user_id
JOIN role r ON ru.role_id = r.id
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
JOIN permission p ON v.id = p.view_id
WHERE p.field_name = '*'
ORDER BY u.email, v.model_name;
```

---

## Workflow Debugging

Use these queries when workflows are stuck, not progressing, or behaving unexpectedly.

### 1. Find Stuck Workflows (Active > X Days)

```sql
SELECT 
    wi.id as instance_id,
    wi.model_id,
    wf.name as workflow_name,
    wf.model_name,
    wi.current_state,
    ws.name as state_name,
    wi.assigned_user_id,
    u.email as assigned_to_email,
    wi.created_at,
    wi.modified_at,
    EXTRACT(DAY FROM NOW() - wi.modified_at) as days_stuck
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
LEFT JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN "user" u ON wi.assigned_user_id = u.id
WHERE wi.status = 'active'
  AND wi.modified_at < NOW() - INTERVAL '{DAYS} days'
ORDER BY wi.modified_at ASC;
```

### 2. Workflow State Distribution

```sql
SELECT 
    wf.name as workflow_name,
    wf.model_name,
    ws.name as state_name,
    ws.is_initial,
    ws.is_final,
    COUNT(wi.id) as instance_count
FROM workflow_flow wf
JOIN workflow_state ws ON wf.id = ws.flow_id
LEFT JOIN workflow_instance wi ON ws.id = wi.current_state_id AND wi.status = 'active'
WHERE wf.is_active = true
GROUP BY wf.name, wf.model_name, ws.name, ws.is_initial, ws.is_final, ws.sequence
ORDER BY wf.name, ws.sequence;
```

### 3. Skip Chain Analysis

Find states configured to be skipped:

```sql
SELECT 
    wf.name as workflow_name,
    ws.name as state_name,
    ws.skip,
    ws.skip_target_state_id,
    target_ws.name as skip_to_state,
    ws.assigned_for,
    r.name as assigned_role
FROM workflow_state ws
JOIN workflow_flow wf ON ws.flow_id = wf.id
LEFT JOIN workflow_state target_ws ON ws.skip_target_state_id = target_ws.id
LEFT JOIN role r ON ws.assigned_role_id = r.id
WHERE ws.skip = true
ORDER BY wf.name, ws.sequence;
```

### 4. Available Actions from Current State

```sql
SELECT 
    wi.id as instance_id,
    wi.model_id,
    wi.current_state,
    ws.name as current_state_name,
    ws.assigned_for,
    ws.assigned_role_id,
    ws.assigned_user_id,
    wa.id as action_id,
    wa.name as action_name,
    target_ws.name as target_state_name,
    wa.side_effects
FROM workflow_instance wi
JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
LEFT JOIN workflow_state target_ws ON wa.target_state_id = target_ws.id
WHERE wi.model_id = '{RECORD_ID}'
  AND wi.status = 'active';
```

### 5. Workflow History Timeline

```sql
SELECT 
    wh.id as history_id,
    wh.from_state,
    wh.to_state,
    wh.performed_at,
    wh.performed_by_name,
    wh.performed_by_email,
    wa.name as action_name,
    wh.comments,
    wh.skipped_states
FROM workflow_history wh
JOIN workflow_instance wi ON wh.instance_id = wi.id
LEFT JOIN workflow_action wa ON wh.action_id = wa.id
WHERE wi.model_id = '{RECORD_ID}'
ORDER BY wh.performed_at ASC;
```

---

## Data Integrity Checks

Use these queries to find orphan records, missing relationships, and data inconsistencies.

### 1. Orphan Line Items (No Parent)

```sql
-- Invoice line items without invoice
SELECT ili.id, ili.item_name, ili.instance_id, ili.created_at
FROM invoice_line_item ili
LEFT JOIN invoice i ON ili.instance_id = i.id
WHERE i.id IS NULL;

-- Purchase order items without purchase order
SELECT poi.id, poi.item_name, poi.instance_id, poi.created_at
FROM purchase_order_item poi
LEFT JOIN purchase_order po ON poi.instance_id = po.id
WHERE po.id IS NULL;

-- Sales order items without sales order
SELECT soi.id, soi.item_name, soi.sales_order_id, soi.created_at
FROM sales_order_item soi
LEFT JOIN sales_order so ON soi.sales_order_id = so.id
WHERE so.id IS NULL;
```

### 2. Workflow Instances Without Matching Records

```sql
-- Find workflow instances where the model record doesn't exist
SELECT 
    wi.id as instance_id,
    wi.model_id,
    wf.model_name,
    wi.current_state,
    wi.status,
    wi.created_at
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
WHERE wi.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM purchase_requisition pr WHERE pr.id = wi.model_id AND wf.model_name = 'purchase_requisition'
    UNION ALL
    SELECT 1 FROM purchase_order po WHERE po.id = wi.model_id AND wf.model_name = 'purchase_order'
    UNION ALL
    SELECT 1 FROM invoice inv WHERE inv.id = wi.model_id AND wf.model_name = 'invoice'
    UNION ALL
    SELECT 1 FROM sales_order so WHERE so.id = wi.model_id AND wf.model_name = 'sales_order'
  );
```

### 3. Records with Null org_id (Data Isolation Check)

```sql
-- Check for business data without org_id (potential data leakage)
SELECT 'item_master' as table_name, COUNT(*) as null_count FROM item_master WHERE org_id IS NULL
UNION ALL
SELECT 'supplier', COUNT(*) FROM supplier WHERE org_id IS NULL
UNION ALL
SELECT 'customers', COUNT(*) FROM customers WHERE org_id IS NULL
UNION ALL
SELECT 'invoice', COUNT(*) FROM invoice WHERE org_id IS NULL
UNION ALL
SELECT 'purchase_requisition', COUNT(*) FROM purchase_requisition WHERE org_id IS NULL
UNION ALL
SELECT 'purchase_order', COUNT(*) FROM purchase_order WHERE org_id IS NULL
UNION ALL
SELECT 'sales_order', COUNT(*) FROM sales_order WHERE org_id IS NULL;
```

---

## Cross-Module Tracing

Use these queries to trace transaction flows across multiple modules.

### 1. PR → PO → Invoice Chain

Trace a purchase requisition through to invoicing:

```sql
SELECT 
    pr.id as pr_id,
    pr.pr_number,
    pr.status as pr_status,
    pr.total_price as pr_total,
    po.id as po_id,
    po.po_number,
    po.status as po_status,
    po.total_price as po_total,
    inv.id as invoice_id,
    inv.invoice_number,
    inv.invoice_status,
    inv.invoice_total
FROM purchase_requisition pr
LEFT JOIN purchase_order po ON po.purchase_id = pr.id
LEFT JOIN invoice inv ON inv.purchase_order_id = po.id
WHERE pr.id = '{PR_ID}'
   OR pr.pr_number = '{PR_NUMBER}';
```

### 2. Sales Order → Delivery → Invoice → Payment Chain

```sql
SELECT 
    so.id as so_id,
    so.so_number,
    so.status as so_status,
    so.total_amount as so_total,
    dc.id as challan_id,
    dc.challan_number,
    dc.delivery_status,
    inv.id as invoice_id,
    inv.invoice_number,
    inv.invoice_status,
    inv.invoice_total,
    pr.id as payment_id,
    pr.receipt_number,
    pr.amount as payment_amount,
    pr.payment_type
FROM sales_order so
LEFT JOIN delivery_challan dc ON dc.sales_order_id = so.id
LEFT JOIN invoice inv ON inv.sales_order_id = so.id
LEFT JOIN payment_receipt pr ON pr.invoice_id = inv.id
WHERE so.id = '{SO_ID}'
   OR so.so_number = '{SO_NUMBER}';
```

### 3. Account Postings for a Transaction

```sql
SELECT 
    p.id as posting_id,
    p.posting_date,
    p.posting_type,
    p.amount,
    debit_acc.name as debit_account,
    debit_acc.code as debit_code,
    credit_acc.name as credit_account,
    credit_acc.code as credit_code,
    p.description,
    p.invoice_id,
    p.status
FROM posting p
LEFT JOIN account debit_acc ON p.account_id = debit_acc.id
LEFT JOIN account credit_acc ON p.credit_account_id = credit_acc.id
WHERE p.invoice_id = '{INVOICE_ID}'
   OR p.id = '{POSTING_ID}'
ORDER BY p.posting_date;
```

---

## Audit & Analysis

Use these queries to track changes and analyze user activity.

### 1. Recent Changes by User

```sql
-- Recent workflow actions by a user
SELECT 
    wh.performed_at,
    wf.model_name,
    wi.model_id,
    wa.name as action,
    wh.from_state,
    wh.to_state,
    wh.comments
FROM workflow_history wh
JOIN workflow_instance wi ON wh.instance_id = wi.id
JOIN workflow_flow wf ON wi.flow_id = wf.id
LEFT JOIN workflow_action wa ON wh.action_id = wa.id
WHERE wh.performed_by = '{USER_ID}'
ORDER BY wh.performed_at DESC
LIMIT 50;
```

### 2. Records Created in Date Range

```sql
-- Count records created by model type
SELECT 
    'purchase_requisition' as model,
    COUNT(*) as count,
    COUNT(DISTINCT created_by) as unique_creators
FROM purchase_requisition
WHERE created_at BETWEEN '{START_DATE}' AND '{END_DATE}'
  AND org_id = '{ORG_ID}'
UNION ALL
SELECT 'purchase_order', COUNT(*), COUNT(DISTINCT created_by)
FROM purchase_order
WHERE created_at BETWEEN '{START_DATE}' AND '{END_DATE}'
  AND org_id = '{ORG_ID}'
UNION ALL
SELECT 'invoice', COUNT(*), COUNT(DISTINCT created_by)
FROM invoice
WHERE created_at BETWEEN '{START_DATE}' AND '{END_DATE}'
  AND org_id = '{ORG_ID}'
UNION ALL
SELECT 'sales_order', COUNT(*), COUNT(DISTINCT created_by)
FROM sales_order
WHERE created_at BETWEEN '{START_DATE}' AND '{END_DATE}'
  AND org_id = '{ORG_ID}';
```

### 3. Most Active Users by Workflow Actions

```sql
SELECT 
    u.id as user_id,
    u.email,
    u.name,
    COUNT(wh.id) as action_count,
    COUNT(DISTINCT wi.flow_id) as workflows_touched,
    MAX(wh.performed_at) as last_action
FROM "user" u
JOIN workflow_history wh ON u.id = wh.performed_by
JOIN workflow_instance wi ON wh.instance_id = wi.id
WHERE wh.performed_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email, u.name
ORDER BY action_count DESC
LIMIT 20;
```

---

## Error Pattern Recognition

### Common Errors and Diagnostic Queries

| Error | Likely Cause | Diagnostic Query |
|-------|--------------|------------------|
| "Permission denied" | User lacks role/view access | Use Permission Chain Query #2 |
| "Workflow action not available" | Wrong state or not assigned | Use Workflow Query #4 |
| "Record not found" | Wrong org_id or deleted | Check with org_id filter |
| "Cannot transition" | Skip chain misconfigured | Use Workflow Query #3 |
| "Data not showing" | View data_graph missing field | Query view.data_graph |

### Permission Denied Debugging Steps

1. **Get user's roles**: Query #1 from Permission section
2. **Check if role has view for model**: Query #2
3. **Verify field-level permissions**: Query #3
4. **Check for wildcard access**: Query #4

### Workflow Stuck Debugging Steps

1. **Check current state**: Query #4 from Workflow section
2. **Verify assignment**: Is user assigned to this state?
3. **Check skip configuration**: Query #3
4. **Review history**: Query #5 for what happened before

---

## Safety Rules

**READ-ONLY ENFORCEMENT** (same as basic skill):

1. Only SELECT statements allowed
2. No DDL: CREATE, ALTER, DROP, TRUNCATE
3. No DML: INSERT, UPDATE, DELETE
4. No transactions: BEGIN, COMMIT, ROLLBACK

**Multi-Tenancy** (same as basic skill):

- Always filter business data by org_id
- Metadata tables (view, role, permission, workflow_*) don't need org_id filter

---

## Documentation References

- **[../database-debug/SKILL.md](../database-debug/SKILL.md)** - Basic skill for simple queries
- **[./BUSINESS_MODELS.md](./BUSINESS_MODELS.md)** - Comprehensive entity relationships
- **[../../CLAUDE.md](../../CLAUDE.md)** - System overview
- **[../../docs/kernel/metadata.md](../../docs/kernel/metadata.md)** - views and permissions
- **[../../docs/WORKFLOWS.md](../../docs/WORKFLOWS.md)** - Workflow engine details
