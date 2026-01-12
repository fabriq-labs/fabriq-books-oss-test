# Fabriq Books - Entity Relationship Reference

This document provides comprehensive model relationships, foreign keys, and join paths for the Fabriq Books application.

**Use Ctrl+F to find specific models.**

---

## Table of Contents

1. [User & Organization](#user--organization)
2. [Roles & Permissions](#roles--permissions)
3. [Workflows](#workflows)
4. [Procurement Module](#procurement-module)
5. [Sales Module](#sales-module)
6. [Accounting Module](#accounting-module)
7. [Master Data](#master-data)
8. [Cross-Module Join Paths](#cross-module-join-paths)
9. [Quick Reference: Foreign Keys](#quick-reference-foreign-keys)

---

## User & Organization

### org (organizations table)

**Purpose**: Multi-tenant organization container

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `org_` |
| `name` | String | Organization name |
| `slug` | String | Unique short identifier |
| `basecurrency_id` | String? | FK to currency_master |
| `erp_system_type` | String? | ERP type (zoho_books, xero, quickbooks) |

**Relationships**:
- → `user` (1:many) via `user.org_id`
- → `currency_master` (many:1) via `basecurrency_id`

```sql
-- Get org with users
SELECT o.*, u.email, u.name as user_name
FROM organizations o
JOIN "user" u ON u.org_id = o.id
WHERE o.id = '{ORG_ID}';
```

### user

**Purpose**: System users with authentication

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `user_` |
| `email` | String | Unique email |
| `name` | String? | Display name |
| `org_id` | String? | FK to org |
| `manager_id` | String? | FK to user (self-reference) |
| `department_id` | String? | FK to department |
| `external_id` | String | External auth system ID |

**Relationships**:
- → `org` (many:1) via `org_id`
- → `user` (many:1, self) via `manager_id` (manager)
- → `role_user` (1:many) via `role_user.user_id`
- → `department` (many:1) via `department_id`
- → `workflow_history` (1:many) via `workflow_history.performed_by`

```sql
-- Get user with roles
SELECT u.*, r.name as role_name
FROM "user" u
JOIN role_user ru ON u.id = ru.user_id
JOIN role r ON ru.role_id = r.id
WHERE u.id = '{USER_ID}';

-- Get user with manager
SELECT u.*, m.name as manager_name, m.email as manager_email
FROM "user" u
LEFT JOIN "user" m ON u.manager_id = m.id
WHERE u.id = '{USER_ID}';
```

### organization (legal entity details)

**Purpose**: Legal entity details for organizations

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `org_` |
| `organization_name` | String | Legal name |
| `legal_name` | String | Registered name |
| `org_id` | String | Parent org reference |
| `basecurrency_id` | String? | FK to currency_master |

**Relationships**:
- → `currency_master` (many:1) via `basecurrency_id`
- → `business_unit` (1:many)
- → `department` (1:many)
- → `location` (1:many)

---

## Roles & Permissions

### role

**Purpose**: User roles for RBAC

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `role_` |
| `name` | String | Unique role name |

**Relationships**:
- → `role_user` (1:many) - assigns roles to users
- → `role_view` (1:many) - assigns views to roles
- → `workflow_state` (1:many) - assigns states to roles

```sql
-- Get all roles with user counts
SELECT r.id, r.name, COUNT(ru.id) as user_count
FROM role r
LEFT JOIN role_user ru ON r.id = ru.role_id
GROUP BY r.id, r.name;
```

### role_user

**Purpose**: Many-to-many: Users to Roles

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `rous_` |
| `role_id` | String | FK to role |
| `user_id` | String | FK to user |

**Unique constraint**: `(role_id, user_id)`

### role_view

**Purpose**: Many-to-many: Roles to Views

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `rovi_` |
| `role_id` | String | FK to role |
| `view_id` | String | FK to view |

**Unique constraint**: `(role_id, view_id)`

### view

**Purpose**: Data access views with field selection

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `view_` |
| `name` | String | View name |
| `model_name` | String | Target model (e.g., 'invoice') |
| `data_graph` | Json? | Field selection graph |

**Relationships**:
- → `role_view` (1:many)
- → `permission` (1:many)

```sql
-- Get view with permissions
SELECT v.*, p.field_name, p.access
FROM view v
JOIN permission p ON v.id = p.view_id
WHERE v.model_name = '{MODEL_NAME}';
```

### permission

**Purpose**: Field-level access control

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `perm_` |
| `view_id` | String | FK to view |
| `field_name` | String | Field name or '*' for all |
| `access` | String | 'read', 'write', 'none' |

**Unique constraint**: `(view_id, field_name)`

---

## Workflows

### workflow_flow

**Purpose**: Workflow definition for a model

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `flow_` |
| `name` | String | Unique workflow name |
| `model_name` | String | Target model (e.g., 'invoice') |
| `is_active` | Boolean | Enable/disable |

**Relationships**:
- → `workflow_state` (1:many) via `workflow_state.flow_id`
- → `workflow_instance` (1:many) via `workflow_instance.flow_id`

```sql
-- Get workflow with states
SELECT wf.*, ws.name as state_name, ws.sequence, ws.is_initial, ws.is_final
FROM workflow_flow wf
JOIN workflow_state ws ON wf.id = ws.flow_id
WHERE wf.model_name = '{MODEL_NAME}'
ORDER BY ws.sequence;
```

### workflow_state

**Purpose**: States within a workflow

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `wsta_` |
| `flow_id` | String | FK to workflow_flow |
| `name` | String | State name |
| `sequence` | Int | Display order |
| `is_initial` | Boolean | Starting state |
| `is_final` | Boolean | End state |
| `assigned_for` | String | 'ROLE', 'USER', 'EXPRESSION' |
| `assigned_role_id` | String? | FK to role |
| `assigned_user_id` | String? | FK to user |
| `skip` | Boolean | Auto-skip this state |
| `skip_target_state_id` | String? | FK to workflow_state |

**Relationships**:
- → `workflow_flow` (many:1) via `flow_id`
- → `workflow_action` (1:many) as source_state
- → `workflow_action` (1:many) as target_state
- → `role` (many:1) via `assigned_role_id`
- → `user` (many:1) via `assigned_user_id`

```sql
-- Get state with outgoing actions
SELECT ws.*, wa.name as action_name, target.name as target_state
FROM workflow_state ws
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
LEFT JOIN workflow_state target ON wa.target_state_id = target.id
WHERE ws.id = '{STATE_ID}';
```

### workflow_action

**Purpose**: Transitions between states

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `wact_` |
| `name` | String | Action name (e.g., 'Approve') |
| `source_state_id` | String | FK to workflow_state |
| `target_state_id` | String | FK to workflow_state |
| `side_effects` | Json? | Automated actions |

**Relationships**:
- → `workflow_state` (many:1) via `source_state_id`
- → `workflow_state` (many:1) via `target_state_id`

### workflow_instance

**Purpose**: Active workflow for a document

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `wins_` |
| `flow_id` | String | FK to workflow_flow |
| `model_id` | String | ID of the business record |
| `current_state` | String | Current state name |
| `current_state_id` | String? | FK to workflow_state |
| `assigned_user_id` | String? | FK to user |
| `status` | String | 'active', 'completed', 'cancelled' |
| `org_id` | String? | For multi-tenancy |

**Relationships**:
- → `workflow_flow` (many:1) via `flow_id`
- → `workflow_state` (many:1) via `current_state_id`
- → `workflow_history` (1:many)
- → `purchase_requisition` (1:many)
- → `purchase_order` (1:many)
- → `invoice` (1:many)
- → `sales_order` (1:many)

```sql
-- Get instance with current state details
SELECT 
    wi.*,
    wf.name as workflow_name,
    ws.name as state_name,
    ws.assigned_for,
    u.email as assigned_to
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
LEFT JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN "user" u ON wi.assigned_user_id = u.id
WHERE wi.model_id = '{RECORD_ID}';
```

### workflow_history

**Purpose**: Audit trail for state transitions

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `whis_` |
| `instance_id` | String | FK to workflow_instance |
| `action_id` | String | FK to workflow_action |
| `from_state` | String | Previous state name |
| `to_state` | String | New state name |
| `performed_by` | String | FK to user |
| `performed_at` | DateTime | Timestamp |
| `comments` | String? | User comments |
| `skipped_states` | Json? | States that were skipped |

---

## Procurement Module

### supplier

**Purpose**: Vendor/supplier master data

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `supp_` |
| `supplier_name` | String | Company name |
| `primary_email` | String | Contact email |
| `org_id` | String | For multi-tenancy |
| `payment_term_id` | String? | FK to payment_terms |
| `shipping_method_id` | String? | FK to shipping_method |

**Relationships**:
- → `payment_terms` (many:1)
- → `shipping_method` (many:1)
- → `purchase_order` (1:many)
- → `item_master` (1:many) as preferred supplier

### purchase_requisition

**Purpose**: Internal purchase requests

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `preq_` |
| `pr_number` | String? | PR number |
| `pr_date` | DateTime? | Request date |
| `total_price` | Float? | Total amount |
| `status` | String? | Current status |
| `org_id` | String? | For multi-tenancy |
| `wf_instance_id` | String? | FK to workflow_instance |
| `created_by` | String? | FK to user |
| `department_id` | String? | FK to department |
| `location_id` | String? | FK to location |

**Relationships**:
- → `workflow_instance` (many:1) via `wf_instance_id`
- → `item` (1:many) via `item.instance_id` (line items)
- → `purchase_order` (1:many) via `purchase_order.purchase_id`
- → `user` (many:1) via `created_by`
- → `department` (many:1)
- → `location` (many:1)

```sql
-- PR with line items
SELECT pr.*, i.item_name, i.quantity, i.rate, i.item_total
FROM purchase_requisition pr
JOIN item i ON i.instance_id = pr.id
WHERE pr.id = '{PR_ID}';

-- PR with workflow
SELECT pr.*, wi.current_state, ws.name as state_name
FROM purchase_requisition pr
JOIN workflow_instance wi ON pr.wf_instance_id = wi.id
JOIN workflow_state ws ON wi.current_state_id = ws.id
WHERE pr.id = '{PR_ID}';
```

### item (PR line items)

**Purpose**: Line items for purchase requisitions

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `item_` |
| `instance_id` | String? | FK to purchase_requisition |
| `product_id` | String? | FK to item_master |
| `item_name` | String? | Item name |
| `quantity` | Float? | Quantity |
| `rate` | Float? | Unit price |
| `item_total` | Float? | Line total |
| `supplier_id` | String? | FK to supplier |

**Unique constraint**: `(instance_id, item_number)`

### purchase_order

**Purpose**: Purchase orders to suppliers

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `po_` |
| `po_number` | String? | Unique PO number |
| `purchase_id` | String? | FK to purchase_requisition |
| `supplier_id` | String? | FK to supplier |
| `total_price` | Float? | Total amount |
| `org_id` | String? | For multi-tenancy |
| `wf_instance_id` | String? | FK to workflow_instance |

**Relationships**:
- → `purchase_requisition` (many:1) via `purchase_id`
- → `supplier` (many:1) via `supplier_id`
- → `workflow_instance` (many:1) via `wf_instance_id`
- → `purchase_order_item` (1:many)
- → `invoice` (1:many) via `invoice.purchase_order_id`

```sql
-- PO with PR and supplier
SELECT po.*, pr.pr_number, s.supplier_name
FROM purchase_order po
LEFT JOIN purchase_requisition pr ON po.purchase_id = pr.id
LEFT JOIN supplier s ON po.supplier_id = s.id
WHERE po.id = '{PO_ID}';
```

### purchase_order_item

**Purpose**: Line items for purchase orders

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `po_item_` |
| `instance_id` | String | FK to purchase_order |
| `purchase_requisition_id` | String | FK to purchase_requisition |
| `product_id` | String | FK to item_master |
| `item_id` | String? | FK to item (PR line) |
| `quantity` | Float? | Quantity |
| `rate` | Float? | Unit price |

---

## Sales Module

### customers

**Purpose**: Customer master data

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `cust_` |
| `customer_name` | String | Company name |
| `primary_email` | String | Contact email |
| `org_id` | String | For multi-tenancy |
| `payment_term_id` | String? | FK to payment_terms |

**Relationships**:
- → `payment_terms` (many:1)
- → `sales_order` (1:many)
- → `invoice` (1:many) via `invoice.customer_id`
- → `delivery_challan` (1:many)
- → `payment_receipt` (1:many)
- → `location` (1:many) - delivery locations

### sales_order

**Purpose**: Customer sales orders

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `so_` |
| `so_number` | String? | Unique SO number |
| `customer_id` | String? | FK to customers |
| `location_id` | String? | FK to location (delivery) |
| `total_amount` | Float? | Total amount |
| `org_id` | String? | For multi-tenancy |
| `wf_instance_id` | String? | FK to workflow_instance |

**Relationships**:
- → `customers` (many:1) via `customer_id`
- → `location` (many:1) via `location_id`
- → `workflow_instance` (many:1) via `wf_instance_id`
- → `sales_order_item` (1:many)
- → `invoice` (1:many) via `invoice.sales_order_id`
- → `delivery_challan` (1:many)

```sql
-- SO with customer and items
SELECT so.*, c.customer_name, soi.item_name, soi.quantity, soi.line_total
FROM sales_order so
JOIN customers c ON so.customer_id = c.id
JOIN sales_order_item soi ON soi.sales_order_id = so.id
WHERE so.id = '{SO_ID}';
```

### sales_order_item

**Purpose**: Line items for sales orders

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `so_item_` |
| `sales_order_id` | String? | FK to sales_order |
| `item_master_id` | String? | FK to item_master |
| `quantity` | Float? | Quantity |
| `rate` | Float? | Unit price |
| `line_total` | Float? | Line total |

### delivery_challan

**Purpose**: Delivery documentation

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `dc_` |
| `challan_number` | String? | Unique challan number |
| `sales_order_id` | String? | FK to sales_order |
| `customer_id` | String? | FK to customers |
| `delivery_status` | Enum | SCHEDULED, IN_TRANSIT, DELIVERED, etc. |
| `org_id` | String? | For multi-tenancy |

**Relationships**:
- → `sales_order` (many:1) via `sales_order_id`
- → `customers` (many:1) via `customer_id`
- → `delivery_challan_item` (1:many)

### invoice

**Purpose**: Purchase or sales invoices

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `invoice_` |
| `invoice_number` | String? | Invoice number |
| `invoice_type` | String? | 'PURCHASE' or 'SALES' |
| `invoice_status` | String? | Status |
| `invoice_total` | Float? | Total amount |
| `purchase_order_id` | String? | FK to purchase_order |
| `sales_order_id` | String? | FK to sales_order |
| `customer_id` | String? | FK to customers |
| `org_id` | String? | For multi-tenancy |
| `wf_instance_id` | String? | FK to workflow_instance |

**Relationships**:
- → `purchase_order` (many:1) via `purchase_order_id`
- → `sales_order` (many:1) via `sales_order_id`
- → `customers` (many:1) via `customer_id`
- → `workflow_instance` (many:1) via `wf_instance_id`
- → `invoice_line_item` (1:many)
- → `payment_receipt` (1:many)
- → `posting` (1:many) via `posting.invoice_id`

```sql
-- Invoice with line items
SELECT inv.*, ili.item_name, ili.invoice_qty, ili.line_total
FROM invoice inv
JOIN invoice_line_item ili ON ili.instance_id = inv.id
WHERE inv.id = '{INVOICE_ID}';
```

### invoice_line_item

**Purpose**: Line items for invoices

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `in_item__` |
| `instance_id` | String | FK to invoice |
| `item_master_id` | String? | FK to item_master |
| `purchase_order_item_id` | String? | FK to purchase_order_item |
| `invoice_qty` | Int? | Quantity |
| `line_total` | Float? | Line total |

### payment_receipt

**Purpose**: Customer payment records

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `payr_` |
| `receipt_number` | String? | Unique receipt number |
| `customer_id` | String? | FK to customers |
| `invoice_id` | String? | FK to invoice |
| `amount` | Float? | Payment amount |
| `payment_type` | Enum | FULL, PARTIAL, ADVANCE |
| `org_id` | String? | For multi-tenancy |

---

## Accounting Module

### account

**Purpose**: Chart of accounts

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `acco_` |
| `name` | String? | Account name |
| `code` | String? | Account code |
| `classification` | Enum | Assets, Liabilities, Income, Expense, Equity |
| `parent_account_id` | String? | FK to account (self) |
| `org_id` | String? | For multi-tenancy |

**Relationships**:
- → `account` (many:1, self) via `parent_account_id`
- → `posting` (1:many) as debit_account
- → `posting` (1:many) as credit_account

### posting

**Purpose**: Journal entries (double-entry)

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `post_` |
| `account_id` | String? | FK to account (debit) |
| `credit_account_id` | String? | FK to account (credit) |
| `amount` | Decimal? | Transaction amount |
| `posting_date` | DateTime? | Transaction date |
| `invoice_id` | String? | FK to invoice |
| `status` | String? | ACTIVE, REVERSED |
| `org_id` | String? | For multi-tenancy |

```sql
-- Postings with accounts
SELECT p.*, 
    debit.name as debit_account,
    credit.name as credit_account
FROM posting p
LEFT JOIN account debit ON p.account_id = debit.id
LEFT JOIN account credit ON p.credit_account_id = credit.id
WHERE p.org_id = '{ORG_ID}'
ORDER BY p.posting_date DESC;
```

---

## Master Data

### item_master

**Purpose**: Product/service catalog

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `prod_` |
| `item_code` | String? | Unique item code |
| `item_name` | String | Item name |
| `unit_price` | Float? | Default price |
| `supplier_id` | String? | FK to supplier |
| `sales_account_id` | String? | FK to account |
| `purchase_account_id` | String? | FK to account |
| `org_id` | String? | For multi-tenancy |

**Relationships**:
- → `supplier` (many:1) via `supplier_id`
- → `account` (many:1) via `sales_account_id`
- → `account` (many:1) via `purchase_account_id`
- → `item` (1:many) - PR line items
- → `purchase_order_item` (1:many)
- → `invoice_line_item` (1:many)
- → `sales_order_item` (1:many)

### location

**Purpose**: Addresses for delivery/billing

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `loca_` |
| `location` | String | Location name |
| `address` | String | Street address |
| `city` | String | City |
| `customer_id` | String? | FK to customers |
| `legal_entity_id` | String? | FK to organization |
| `org_id` | String? | For multi-tenancy |

### department

**Purpose**: Organizational departments

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | PK, prefix `dept_` |
| `name` | String | Department name |
| `legal_entity_id` | String | FK to organization |
| `business_unit_id` | String? | FK to business_unit |
| `org_id` | String? | For multi-tenancy |

---

## Cross-Module Join Paths

### Full Procurement Chain

```sql
-- PR → PO → Invoice → Payment
SELECT 
    pr.pr_number,
    po.po_number,
    inv.invoice_number,
    pr.receipt_number as payment_receipt
FROM purchase_requisition pr
LEFT JOIN purchase_order po ON po.purchase_id = pr.id
LEFT JOIN invoice inv ON inv.purchase_order_id = po.id
LEFT JOIN payment_receipt pr ON pr.invoice_id = inv.id
WHERE pr.org_id = '{ORG_ID}';
```

### Full Sales Chain

```sql
-- SO → Delivery → Invoice → Payment
SELECT 
    so.so_number,
    dc.challan_number,
    inv.invoice_number,
    pr.receipt_number,
    pr.amount as payment_amount
FROM sales_order so
LEFT JOIN delivery_challan dc ON dc.sales_order_id = so.id
LEFT JOIN invoice inv ON inv.sales_order_id = so.id
LEFT JOIN payment_receipt pr ON pr.invoice_id = inv.id
WHERE so.org_id = '{ORG_ID}';
```

### Permission Chain

```sql
-- User → Roles → Views → Permissions
SELECT u.email, r.name as role, v.name as view, v.model_name, p.field_name, p.access
FROM "user" u
JOIN role_user ru ON u.id = ru.user_id
JOIN role r ON ru.role_id = r.id
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
JOIN permission p ON v.id = p.view_id
WHERE u.id = '{USER_ID}';
```

### Workflow Chain

```sql
-- Record → Instance → State → Actions
SELECT 
    pr.pr_number,
    wi.current_state,
    ws.name as state_name,
    ws.assigned_for,
    wa.name as available_action
FROM purchase_requisition pr
JOIN workflow_instance wi ON pr.wf_instance_id = wi.id
JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN workflow_action wa ON ws.id = wa.source_state_id
WHERE pr.id = '{PR_ID}';
```

---

## Quick Reference: Foreign Keys

| Table | Column | References |
|-------|--------|------------|
| `user` | `org_id` | `org.id` |
| `user` | `manager_id` | `user.id` |
| `role_user` | `user_id` | `user.id` |
| `role_user` | `role_id` | `role.id` |
| `role_view` | `role_id` | `role.id` |
| `role_view` | `view_id` | `view.id` |
| `permission` | `view_id` | `view.id` |
| `workflow_state` | `flow_id` | `workflow_flow.id` |
| `workflow_state` | `assigned_role_id` | `role.id` |
| `workflow_action` | `source_state_id` | `workflow_state.id` |
| `workflow_action` | `target_state_id` | `workflow_state.id` |
| `workflow_instance` | `flow_id` | `workflow_flow.id` |
| `workflow_instance` | `current_state_id` | `workflow_state.id` |
| `workflow_history` | `instance_id` | `workflow_instance.id` |
| `workflow_history` | `performed_by` | `user.id` |
| `purchase_requisition` | `wf_instance_id` | `workflow_instance.id` |
| `purchase_requisition` | `created_by` | `user.id` |
| `item` | `instance_id` | `purchase_requisition.id` |
| `item` | `product_id` | `item_master.id` |
| `purchase_order` | `purchase_id` | `purchase_requisition.id` |
| `purchase_order` | `supplier_id` | `supplier.id` |
| `purchase_order` | `wf_instance_id` | `workflow_instance.id` |
| `purchase_order_item` | `instance_id` | `purchase_order.id` |
| `sales_order` | `customer_id` | `customers.id` |
| `sales_order` | `wf_instance_id` | `workflow_instance.id` |
| `sales_order_item` | `sales_order_id` | `sales_order.id` |
| `sales_order_item` | `item_master_id` | `item_master.id` |
| `invoice` | `purchase_order_id` | `purchase_order.id` |
| `invoice` | `sales_order_id` | `sales_order.id` |
| `invoice` | `customer_id` | `customers.id` |
| `invoice` | `wf_instance_id` | `workflow_instance.id` |
| `invoice_line_item` | `instance_id` | `invoice.id` |
| `invoice_line_item` | `item_master_id` | `item_master.id` |
| `delivery_challan` | `sales_order_id` | `sales_order.id` |
| `delivery_challan` | `customer_id` | `customers.id` |
| `payment_receipt` | `customer_id` | `customers.id` |
| `payment_receipt` | `invoice_id` | `invoice.id` |
| `posting` | `account_id` | `account.id` |
| `posting` | `credit_account_id` | `account.id` |
| `posting` | `invoice_id` | `invoice.id` |
