# Workflow Test Coverage Report

## Workflow Definitions (from Database)

### 1. Purchase Requisition Workflow
**States (9 total):**
- Draft (initial) → assigned to USER
- Manager Review → assigned via EXPRESSION (created_by.manager)
- Buyer Review → assigned to ROLE (Buyer)
- Delivery (final) → assigned to ROLE (Delivery)

**Actions (8 total):**
- Draft → Manager Review: `Submit`
- Manager Review → Buyer Review: `Approve by Manager`
- Manager Review → Draft: `Reject to Draft`, `Send Back`
- Buyer Review → Delivery: `Approve by Buyer` (triggers PO generation)
- Buyer Review → Manager Review: `Reject to Manager`, `Send Back`
- Buyer Review → Draft: `Send Back`

**Side Effects:**
- `Approve by Buyer` → `generate_po_from_pr` (creates purchase orders)

---

### 2. Purchase Order Workflow
**States (5 total):**
- Pending PO Creation (initial) → assigned to ROLE (Buyer)
- PO Pending Approval → assigned to ROLE (Buyer)
- PO Issued (final) → assigned to ROLE (Buyer)
- PO Cancelled → assigned to ROLE (Buyer)

**Actions (3 total):**
- Pending PO Creation → PO Pending Approval: `Submit`
- PO Pending Approval → PO Issued: `Approve`
- PO Pending Approval → PO Cancelled: `Reject`

**Side Effects:**
- `Submit` → `send_workflow_notification_email`

---

### 3. Invoice Workflow
**States (4 total):**
- Draft (initial) → assigned to ROLE (Buyer)
- Submitted → assigned to ROLE (Buyer)
- Approved (final) → assigned to ROLE (Buyer)

**Actions (3 total):**
- Draft → Submitted: `Submit` (triggers `calculate_invoice_total`)
- Submitted → Approved: `Approve`
- Submitted → Draft: `Reject` (triggers `handle_invoice_reject`)

**Side Effects:**
- `Submit` → `calculate_invoice_total`, `send_workflow_notification_email`
- `Reject` → `handle_invoice_reject`, `send_workflow_notification_email`

---

## Current Test Coverage

### Purchase Requisition (`purchase-requisition.test.ts`)
**Coverage: 9 tests**

✅ **Covered:**
1. Basic creation with workflow instance in Draft state
2. Creation with line items
3. Draft → Manager Review transition
4. Workflow assignment to manager
5. Manager Review → Buyer Review transition
6. Buyer Review → Delivery transition (full workflow)
7. Purchase Order generation from PR (side effect)
8. Multiple items creation
9. Location and requester details verification
10. Invoice generation from PO (custom action)

**Missing:**
- ❌ Rejection workflows (Reject to Draft, Reject to Manager)
- ❌ Send Back workflows (Send Back from Manager, Send Back from Buyer)
- ❌ Workflow history verification
- ❌ Workflow assignment verification (EXPRESSION-based for Manager Review)

---

### Purchase Order (`purchase-order-creation.test.ts`)
**Coverage: 2 tests**

✅ **Covered:**
1. Basic creation with workflow instance
2. Creation with line items

**Missing:**
- ❌ Pending PO Creation → PO Pending Approval transition (`Submit`)
- ❌ PO Pending Approval → PO Issued transition (`Approve`)
- ❌ PO Pending Approval → PO Cancelled transition (`Reject`)
- ❌ Full workflow end-to-end test
- ❌ Workflow state verification after each transition
- ❌ Workflow history verification

---

### Invoice (`purchase-invoice-workflow.test.ts`)
**Coverage: 2 tests**

✅ **Covered:**
1. Basic creation with workflow instance
2. Workflow transition (generic - tries first available action)

**Missing:**
- ❌ Draft → Submitted transition (`Submit` action)
- ❌ Submitted → Approved transition (`Approve` action)
- ❌ Submitted → Draft transition (`Reject` action)
- ❌ Side effect verification (`calculate_invoice_total` on Submit)
- ❌ Side effect verification (`handle_invoice_reject` on Reject)
- ❌ Full workflow end-to-end test
- ❌ Workflow history verification

---

## Summary

### Purchase Requisition
- **Coverage: ~70%**
- ✅ Happy path fully covered
- ❌ Rejection paths not tested
- ❌ Send Back paths not tested

### Purchase Order
- **Coverage: ~20%**
- ✅ Creation tested
- ❌ All workflow transitions missing
- ❌ Rejection path missing

### Invoice
- **Coverage: ~25%**
- ✅ Creation tested
- ❌ All workflow transitions missing
- ❌ Side effects not verified
- ❌ Rejection path missing

---

## Recommended Additional Tests

### Purchase Requisition (Priority: Medium)
1. Test rejection from Manager Review → Draft
2. Test rejection from Buyer Review → Manager Review
3. Test Send Back from Manager Review → Draft
4. Test Send Back from Buyer Review → Manager Review
5. Test Send Back from Buyer Review → Draft
6. Verify workflow history after transitions

### Purchase Order (Priority: High)
1. Test Submit transition (Pending PO Creation → PO Pending Approval)
2. Test Approve transition (PO Pending Approval → PO Issued)
3. Test Reject transition (PO Pending Approval → PO Cancelled)
4. Test full workflow end-to-end
5. Verify workflow history

### Invoice (Priority: High)
1. Test Submit transition (Draft → Submitted) with side effect verification
2. Test Approve transition (Submitted → Approved)
3. Test Reject transition (Submitted → Draft) with side effect verification
4. Test full workflow end-to-end
5. Verify invoice total calculation on Submit
6. Verify workflow history

---

## Test Files Structure

```
backend/src/__tests__/
├── purchase-requisition/
│   └── purchase-requisition.test.ts (9 tests) ✅
├── purchase-order/
│   ├── purchase-order-creation.test.ts (2 tests) ⚠️ Needs workflow tests
│   ├── purchase-order-quickbooks.test.ts (integration)
│   └── purchase-order-zoho.test.ts (integration)
└── invoice/
    └── purchase-invoice-workflow.test.ts (2 tests) ⚠️ Needs more workflow tests
```
