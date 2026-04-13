# Fabriq Advanced Database Debug

Advanced database debugging for Fabriq Books — permission chains, workflow debugging, data integrity checks, cross-module tracing.

## Connection

```bash
DATABASE_URL=$(grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//') && psql "${DATABASE_URL}" -c "SELECT ..."
```

**READ-ONLY**: Only SELECT. No INSERT, UPDATE, DELETE, DDL, or transactions.

## When to use this vs /db

| Task | Command |
|------|---------|
| Simple counts, single-table lookups | `/db` |
| "Why can't user X do Y?" | `/db-advanced` |
| Workflow stuck / not progressing | `/db-advanced` |
| Data integrity / orphan records | `/db-advanced` |
| PR → PO → Invoice tracing | `/db-advanced` |
| Who changed what / audit trail | `/db-advanced` |
| Complex JOINs (3+ tables) | `/db-advanced` |

## Multi-tenancy rules

- Business models require `org_id` filter. Metadata tables (`view`, `permission`, `role*`, `workflow_flow/state/action`) do not.
- `workflow_instance` and `workflow_history` DO need `org_id` filter.

---

## Permission Chain Debugging

### Full permission chain for a user

```sql
-- Step 1: User's roles
SELECT u.id, u.email, r.id as role_id, r.name as role_name
FROM "user" u
JOIN role_user ru ON u.id = ru.user_id
JOIN role r ON ru.role_id = r.id
WHERE u.id = '{USER_ID}';

-- Step 2: All permissions for a user on a model (single query)
SELECT u.email, r.name as role, v.name as view, v.model_name, p.field_name, p.access
FROM "user" u
JOIN role_user ru ON u.id = ru.user_id
JOIN role r ON ru.role_id = r.id
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
JOIN permission p ON v.id = p.view_id
WHERE u.id = '{USER_ID}' AND v.model_name = '{MODEL_NAME}'
ORDER BY r.name, v.name, p.field_name;
```

### Roles with access to a model

```sql
SELECT DISTINCT r.name as role_name, v.name as view_name,
    string_agg(DISTINCT p.access, ', ') as access_levels
FROM role r
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
JOIN permission p ON v.id = p.view_id
WHERE v.model_name = '{MODEL_NAME}'
GROUP BY r.name, v.name ORDER BY r.name;
```

### Users with wildcard permissions

```sql
SELECT DISTINCT u.email, r.name as role, v.name as view, v.model_name, p.access
FROM "user" u
JOIN role_user ru ON u.id = ru.user_id
JOIN role r ON ru.role_id = r.id
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
JOIN permission p ON v.id = p.view_id
WHERE p.field_name = '*' ORDER BY u.email, v.model_name;
```

---

## Workflow Debugging

### Current state + available actions for a record

```sql
SELECT wi.id as instance_id, wi.model_id, wi.current_state,
    ws.name as state_name, ws.assigned_for, ws.assigned_role_id, ws.assigned_user_id,
    wa.id as action_id, wa.name as action_name,
    target_ws.name as target_state, wa.side_effects
FROM workflow_instance wi
JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
LEFT JOIN workflow_state target_ws ON wa.target_state_id = target_ws.id
WHERE wi.model_id = '{RECORD_ID}' AND wi.status = 'active';
```

### Workflow history timeline

```sql
SELECT wh.performed_at, wh.from_state, wh.to_state,
    wa.name as action, wh.performed_by_name, wh.performed_by_email, wh.comments
FROM workflow_history wh
JOIN workflow_instance wi ON wh.instance_id = wi.id
LEFT JOIN workflow_action wa ON wh.action_id = wa.id
WHERE wi.model_id = '{RECORD_ID}'
ORDER BY wh.performed_at ASC;
```

### Stuck workflows (active > N days)

```sql
SELECT wi.id, wi.model_id, wf.model_name, ws.name as state,
    u.email as assigned_to, wi.created_at,
    EXTRACT(DAY FROM NOW() - wi.modified_at) as days_stuck
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
LEFT JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN "user" u ON wi.assigned_user_id = u.id
WHERE wi.status = 'active' AND wi.modified_at < NOW() - INTERVAL '{DAYS} days'
ORDER BY wi.modified_at ASC;
```

### State distribution across a workflow

```sql
SELECT wf.name as workflow, wf.model_name, ws.name as state,
    ws.is_initial, ws.is_final, COUNT(wi.id) as active_count
FROM workflow_flow wf
JOIN workflow_state ws ON wf.id = ws.flow_id
LEFT JOIN workflow_instance wi ON ws.id = wi.current_state_id AND wi.status = 'active'
WHERE wf.is_active = true
GROUP BY wf.name, wf.model_name, ws.name, ws.is_initial, ws.is_final, ws.sequence
ORDER BY wf.name, ws.sequence;
```

### Skip chain configuration

```sql
SELECT wf.name as workflow, ws.name as state, ws.skip,
    target_ws.name as skip_to_state, r.name as assigned_role
FROM workflow_state ws
JOIN workflow_flow wf ON ws.flow_id = wf.id
LEFT JOIN workflow_state target_ws ON ws.skip_target_state_id = target_ws.id
LEFT JOIN role r ON ws.assigned_role_id = r.id
WHERE ws.skip = true ORDER BY wf.name, ws.sequence;
```

---

## Cross-Module Tracing

### PR → PO → Invoice chain

```sql
SELECT pr.pr_number, pr.status as pr_status, pr.total_price as pr_total,
    po.po_number, po.status as po_status, po.total_price as po_total,
    inv.invoice_number, inv.invoice_status, inv.invoice_total
FROM purchase_requisition pr
LEFT JOIN purchase_order po ON po.purchase_id = pr.id
LEFT JOIN invoice inv ON inv.purchase_order_id = po.id
WHERE pr.id = '{PR_ID}' OR pr.pr_number = '{PR_NUMBER}';
```

### Sales Order → Delivery → Invoice → Payment chain

```sql
SELECT so.so_number, so.status as so_status,
    dc.challan_number, dc.delivery_status,
    inv.invoice_number, inv.invoice_status, inv.invoice_total,
    pr.receipt_number, pr.amount as payment_amount, pr.payment_type
FROM sales_order so
LEFT JOIN delivery_challan dc ON dc.sales_order_id = so.id
LEFT JOIN invoice inv ON inv.sales_order_id = so.id
LEFT JOIN payment_receipt pr ON pr.invoice_id = inv.id
WHERE so.id = '{SO_ID}' OR so.so_number = '{SO_NUMBER}';
```

### Account postings for a transaction

```sql
SELECT p.posting_date, p.posting_type, p.amount, p.status,
    debit_acc.name as debit_account, credit_acc.name as credit_account, p.description
FROM posting p
LEFT JOIN account debit_acc ON p.account_id = debit_acc.id
LEFT JOIN account credit_acc ON p.credit_account_id = credit_acc.id
WHERE p.invoice_id = '{INVOICE_ID}'
ORDER BY p.posting_date;
```

---

## Data Integrity Checks

### Orphan line items

```sql
-- Invoice line items without parent invoice
SELECT ili.id, ili.item_name, ili.instance_id FROM invoice_line_item ili
LEFT JOIN invoice i ON ili.instance_id = i.id WHERE i.id IS NULL;

-- PO items without parent PO
SELECT poi.id, poi.item_name, poi.instance_id FROM purchase_order_item poi
LEFT JOIN purchase_order po ON poi.instance_id = po.id WHERE po.id IS NULL;
```

### Records without org_id (data isolation check)

```sql
SELECT 'item_master' as t, COUNT(*) FROM item_master WHERE org_id IS NULL
UNION ALL SELECT 'supplier', COUNT(*) FROM supplier WHERE org_id IS NULL
UNION ALL SELECT 'customers', COUNT(*) FROM customers WHERE org_id IS NULL
UNION ALL SELECT 'invoice', COUNT(*) FROM invoice WHERE org_id IS NULL
UNION ALL SELECT 'purchase_requisition', COUNT(*) FROM purchase_requisition WHERE org_id IS NULL
UNION ALL SELECT 'purchase_order', COUNT(*) FROM purchase_order WHERE org_id IS NULL
UNION ALL SELECT 'sales_order', COUNT(*) FROM sales_order WHERE org_id IS NULL;
```

---

## Audit Queries

### Recent workflow actions by a user

```sql
SELECT wh.performed_at, wf.model_name, wi.model_id,
    wa.name as action, wh.from_state, wh.to_state, wh.comments
FROM workflow_history wh
JOIN workflow_instance wi ON wh.instance_id = wi.id
JOIN workflow_flow wf ON wi.flow_id = wf.id
LEFT JOIN workflow_action wa ON wh.action_id = wa.id
WHERE wh.performed_by = '{USER_ID}'
ORDER BY wh.performed_at DESC LIMIT 50;
```

### Most active users (last 30 days)

```sql
SELECT u.email, u.name, COUNT(wh.id) as actions,
    COUNT(DISTINCT wi.flow_id) as workflows_touched, MAX(wh.performed_at) as last_action
FROM "user" u
JOIN workflow_history wh ON u.id = wh.performed_by
JOIN workflow_instance wi ON wh.instance_id = wi.id
WHERE wh.performed_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email, u.name
ORDER BY actions DESC LIMIT 20;
```

---

## Error Diagnosis Guide

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| "Permission denied" | User lacks role/view | Run permission chain query |
| "Workflow action not available" | Wrong state or not assigned | Check current state + assignments |
| "Record not found" | Wrong org_id or deleted | Query with explicit org_id |
| "Cannot transition" | Skip chain misconfigured | Check skip chain query |
| "Data not showing" | View data_graph missing field | Query `view.data_graph` |

Now answer the user's database question by composing and running the appropriate SELECT query.
