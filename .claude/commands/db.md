# Fabriq Database Query

You are now in database debugging mode for the Fabriq Books PostgreSQL database.

## How to execute queries

1. Read `DATABASE_URL` from `backend/.env`:
   ```bash
   grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//'
   ```
2. Run queries with psql:
   ```bash
   DATABASE_URL=$(grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//') && psql "${DATABASE_URL}" -c "SELECT ..."
   ```

**READ-ONLY**: Only SELECT statements. No INSERT, UPDATE, DELETE, DDL, or transactions.

## Multi-tenancy rules

- **Business data** — ALWAYS filter by `org_id`: `item_master`, `supplier`, `customers`, `invoice`, `invoice_line_item`, `purchase_requisition`, `item`, `purchase_order`, `purchase_order_item`, `sales_order`, `sales_order_item`, `delivery_challan`, `credit_note`, `quote`, `account`, `posting`, `category`, and all other business models.
- **Metadata/system** — NO `org_id` filter: `view`, `permission`, `role`, `role_user`, `role_view`, `workflow_flow`, `workflow_state`, `workflow_action`, `org`.
- **Exception**: `workflow_instance` and `workflow_history` DO have `org_id` and should be filtered.

## Key tables

| Table | Purpose | Notes |
|-------|---------|-------|
| `item_master` | Product catalog | `org_id` required |
| `supplier` | Vendors | `org_id` required |
| `customers` | Customers | `org_id` required |
| `invoice` | Purchase/Sales invoices | `invoice_type`: PURCHASE or SALES |
| `invoice_line_item` | Invoice lines | FK: `instance_id` → `invoice.id` |
| `purchase_requisition` | PRs | `wf_instance_id` → workflow |
| `item` | PR line items | FK: `instance_id` → `purchase_requisition.id` |
| `purchase_order` | POs | FK: `purchase_id` → `purchase_requisition.id` |
| `purchase_order_item` | PO lines | FK: `instance_id` → `purchase_order.id` |
| `sales_order` | SOs | FK: `customer_id` → `customers.id` |
| `sales_order_item` | SO lines | FK: `sales_order_id` → `sales_order.id` |
| `"user"` | System users | Quoted — reserved word |
| `org` | Organizations | |
| `role` / `role_user` / `role_view` | RBAC | |
| `view` / `permission` | Field-level access | |
| `workflow_flow` / `workflow_state` / `workflow_action` | Workflow definitions | |
| `workflow_instance` | Active workflow per record | `model_id` = business record ID |
| `workflow_history` | Audit trail | |

## Common query templates

```sql
-- Count records per org
SELECT org_id, COUNT(*) FROM item_master GROUP BY org_id;

-- Pending approvals for a user
SELECT wi.model_id, wf.model_name, ws.name as state, wi.created_at
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
JOIN workflow_state ws ON wi.current_state_id = ws.id
WHERE wi.status = 'active' AND wi.assigned_user_id = '{USER_ID}';

-- User roles
SELECT r.name FROM role r
JOIN role_user ru ON r.id = ru.role_id
WHERE ru.user_id = '{USER_ID}';

-- Workflow state of a record
SELECT wi.current_state, ws.name, wa.name as available_action
FROM workflow_instance wi
JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
WHERE wi.model_id = '{RECORD_ID}' AND wi.status = 'active';

-- Invoices by status for an org
SELECT invoice_status, invoice_type, COUNT(*), SUM(invoice_total)
FROM invoice WHERE org_id = '{ORG_ID}'
GROUP BY invoice_status, invoice_type;
```

## Notes

- Table names are snake_case matching Prisma model names
- `"user"` must be quoted (reserved SQL word)
- Prisma schema split across: `backend/prisma/schema/data.prisma`, `metadata.prisma`, `sales.prisma`, `zeiv.prisma`
- For complex multi-table queries (3+ tables, permission chains, workflow debugging), use `/db-advanced`

Now answer the user's database question by composing and running the appropriate SELECT query.
