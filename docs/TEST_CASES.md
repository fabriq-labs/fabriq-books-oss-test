# Test Cases Documentation

**When to read**: Understanding test coverage, test functionality, running tests
**Related docs**: [BUSINESS_DOMAIN.md](./BUSINESS_DOMAIN.md), [WORKFLOWS.md](./WORKFLOWS.md), [BACKEND.md](./BACKEND.md)

**Last Updated**: 2026-01-11
**Version**: 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Test Organization](#test-organization)
3. [Master Data Tests](#master-data-tests)
4. [Procurement Module Tests](#procurement-module-tests)
5. [Sales Module Tests](#sales-module-tests)
6. [Accounting Module Tests](#accounting-module-tests)
7. [Integration Tests](#integration-tests)
8. [Agent Tests](#agent-tests)
9. [Running Tests](#running-tests)

---

## Overview

The test suite for Fabriq Books is organized by business domain modules and follows the structure defined in `BUSINESS_DOMAIN.md`. Tests are written using Jest and cover:

- **Model Creation**: Basic CRUD operations for business models
- **Workflow Transitions**: State-based approval processes
- **Business Logic**: Side effects, calculations, and validations
- **Integration**: External system integrations (Zoho Books, QuickBooks)
- **Permissions**: Role-based access control

### Test Configuration

Tests use seed data from:
- `backend/prisma/setup-IN/setup-indian-demo.ts` (Indian demo data)
- `backend/prisma/setup-US_CA/setup-us-ca-demo.ts` (US-CA demo data)

Configuration is loaded from:
- `backend/src/__tests__/test-configs/indian-demo-config.json`
- `backend/src/__tests__/test-configs/us-ca-demo-config.json`

Set `TEST_CONFIG` environment variable to select configuration:
```bash
TEST_CONFIG=indian-demo npm test
```

---

## Test Organization

```
backend/src/__tests__/
├── customers/              # Customer master data tests
├── supplier/               # Supplier master data tests
├── item-master/            # Item master data tests
├── location/               # Location master data tests
├── purchase-requisition/   # Purchase requisition workflow tests
├── purchase-order/         # Purchase order creation and workflow tests
├── invoice/                # Invoice workflow tests
├── sales-order/            # Sales order tests
├── sales-invoice/          # Sales invoice tests
├── quote/                  # Quote tests
├── delivery-challan/        # Delivery challan tests
├── credit-note/            # Credit note tests
├── payment-receipt/        # Payment receipt tests
├── integrations/           # External system integration tests
└── agent/                  # AI agent tests
```

---

## Master Data Tests

### Customers (`customers/customers.test.ts`)

**Purpose**: Test customer master data creation and validation

**Test Cases**:
1. **should create a basic customer**
   - Creates customer with required fields (customer_name, primary_email, org_id)
   - Verifies customer is created with correct org_id
   - Verifies workflow instance is NOT created (customers are not workflow-enabled)

2. **should create customer with optional fields**
   - Creates customer with additional fields (address, city, state, country, zip_code, industry, website)
   - Verifies all optional fields are saved correctly

**Fixtures**: `customers-test-fixtures.ts`
- `createCustomerData()`: Generates test customer payload
- `assertCustomerCreated()`: Verifies customer in database

---

### Supplier (`supplier/supplier.test.ts`)

**Purpose**: Test supplier master data creation

**Test Cases**:
1. **should create a basic supplier**
   - Creates supplier with required fields
   - Verifies supplier is created with correct org_id

2. **should create supplier with business classification and status**
   - Creates supplier with business_classification and status fields
   - Verifies business classification is saved correctly

**Fixtures**: `supplier-test-fixtures.ts`
- `createSupplierData()`: Generates test supplier payload
- `assertSupplierCreated()`: Verifies supplier in database

---

### Item Master (`item-master/item-master.test.ts`)

**Purpose**: Test item master data creation (products and services)

**Test Cases**:
1. **should create a product item with supplier reference**
   - Creates item_master with item_type='Product'
   - Links item to supplier via supplier_id
   - Verifies item is created with correct supplier relationship

2. **should create a service item with supplier reference**
   - Creates item_master with item_type='Service'
   - Links service to supplier
   - Verifies service item is created correctly

**Fixtures**: `item-master-test-fixtures.ts`
- `createItemMasterData()`: Generates test item payload
- `assertItemMasterCreated()`: Verifies item in database

---

### Location (`location/location.test.ts`)

**Purpose**: Test location master data creation

**Test Cases**:
1. **should create a standalone location**
   - Creates location without customer reference
   - Verifies location is created with correct org_id

2. **should create location with customer reference**
   - Creates location linked to customer via customer_id
   - Verifies customer relationship is established

**Fixtures**: `location-test-fixtures.ts`
- `createLocationData()`: Generates test location payload
- `assertLocationCreated()`: Verifies location in database

---

## Procurement Module Tests

### Purchase Requisition (`purchase-requisition/purchase-requisition.test.ts`)

**Purpose**: Test purchase requisition creation and complete workflow transitions

**Workflow States**: Draft → Manager Review → Buyer Review → Delivery

**Test Cases**:

#### Basic Creation
1. **should create a purchase requisition with workflow instance in Draft state**
   - Creates PR with required fields
   - Verifies workflow instance is created
   - Verifies initial state is 'Draft'

2. **should create purchase requisition with line items**
   - Creates PR and adds items via `addChildrenToParent`
   - Verifies items are created with correct instance_id

#### Workflow Transitions (Happy Path)
3. **should transition from Draft to Manager Review**
   - Executes 'Submit' action
   - Verifies state changes to 'Manager Review'
   - Verifies workflow assignment to manager

4. **should assign workflow to manager when transitioning to Manager Review**
   - Verifies workflow instance assigned_user_id matches manager
   - Tests EXPRESSION-based assignment (created_by.manager)

5. **should transition from Manager Review to Buyer Review**
   - Manager executes 'Approve by Manager' action
   - Verifies state changes to 'Buyer Review'

6. **should transition from Buyer Review to Delivery (final state)**
   - Buyer executes 'Approve by Buyer' action
   - Verifies state changes to 'Delivery'
   - Verifies workflow status becomes 'completed'

#### Rejection Workflows
7. **should reject from Manager Review back to Draft**
   - Manager executes 'Reject to Draft' action
   - Verifies state returns to 'Draft'

8. **should reject from Buyer Review back to Manager Review**
   - Buyer executes 'Reject to Manager' action
   - Verifies state returns to 'Manager Review'

#### Send Back Workflows
9. **should send back from Manager Review to Draft**
   - Manager executes 'Send Back' action (to Draft)
   - Verifies state returns to 'Draft'

10. **should send back from Buyer Review to Manager Review**
    - Buyer executes 'Send Back' action (to Manager Review)
    - Verifies state returns to 'Manager Review'

11. **should send back from Buyer Review to Draft**
    - Buyer executes 'Send Back' action (to Draft)
    - Verifies state returns to 'Draft'

#### Business Logic
12. **should create purchase orders when transitioning from Buyer Review to Delivery**
    - Tests side effect: `generate_po_from_pr`
    - Verifies POs are created grouped by supplier
    - Verifies PO line items match PR items

13. **should create purchase requisition with multiple line items**
    - Creates PR with 3 line items
    - Verifies all items are created correctly

14. **should verify location and requester details are set correctly**
    - Verifies location_id and requester fields
    - Verifies data integrity

15. **should create invoice from purchase order using custom action**
    - Tests `generate_invoice` custom action on PO
    - Verifies invoice is created with correct PO reference
    - Verifies invoice line items match PO items

**Fixtures**: `purchase-requisition-test-fixtures.ts`
- `createPurchaseRequisitionData()`: Generates PR payload
- `createPurchaseRequisitionItemData()`: Generates PR item payload
- `assertWorkflowState()`: Verifies workflow state
- `assertWorkflowAssignedToManager()`: Verifies manager assignment

**Note**: Side effects (email notifications, ERP sync) are disabled in tests to prevent delays.

---

### Purchase Order (`purchase-order/`)

#### Purchase Order Creation (`purchase-order-creation.test.ts`)

**Purpose**: Test standalone purchase order creation (without PR workflow)

**Test Cases**:
1. **should create a purchase order directly with workflow instance in Draft state**
   - Creates PO directly (not from PR)
   - Verifies workflow instance is created
   - Verifies initial state is 'Pending PO Creation'

2. **should create purchase order with line items**
   - Creates PO and adds purchase_order_item via `addChildrenToParent`
   - Verifies line items are created correctly

**Fixtures**: `purchase-order-test-fixtures.ts`
- `createPurchaseOrderData()`: Generates PO payload
- `assertWorkflowState()`: Verifies workflow state

---

#### Purchase Order Workflow (`purchase-order-workflow.test.ts`)

**Purpose**: Test purchase order workflow transitions

**Workflow States**: Pending PO Creation → PO Pending Approval → PO Issued / PO Cancelled

**Test Cases**:
1. **should transition from Pending PO Creation to PO Pending Approval (Submit)**
   - Executes 'Submit' action
   - Verifies state changes to 'PO Pending Approval'

2. **should transition from PO Pending Approval to PO Issued (Approve)**
   - Executes 'Approve' action
   - Verifies state changes to 'PO Issued' (final state)
   - Verifies workflow status becomes 'completed'

3. **should transition from PO Pending Approval to PO Cancelled (Reject)**
   - Executes 'Reject' action
   - Verifies state changes to 'PO Cancelled'

4. **should complete full workflow end-to-end (Submit → Approve)**
   - Tests complete workflow from creation to approval
   - Verifies all state transitions
   - Verifies PO data integrity

**Note**: Side effects (email notifications) are disabled in tests.

---

#### Purchase Order Integrations

**Files**: `purchase-order-zoho.test.ts`, `purchase-order-quickbooks.test.ts`

**Purpose**: Test ERP system integrations for purchase orders
- Zoho Books sync
- QuickBooks sync
- Data mapping and transformation

---

### Invoice (`invoice/`)

#### Purchase Invoice Workflow (`purchase-invoice-workflow.test.ts`)

**Purpose**: Basic invoice creation and workflow instance verification

**Test Cases**:
1. **should create a purchase invoice with workflow instance**
   - Creates invoice with invoice_type='PURCHASE'
   - Verifies workflow instance is created
   - Verifies initial state

2. **should transition workflow through states**
   - Generic workflow transition test
   - Handles cases where workflow may not be fully configured

---

#### Purchase Invoice Workflow Transitions (`purchase-invoice-workflow-transitions.test.ts`)

**Purpose**: Test complete invoice workflow transitions

**Workflow States**: Draft → Submitted → Approved

**Test Cases**:
1. **should transition from Draft to Submitted (Submit)**
   - Executes 'Submit' action
   - Verifies state changes to 'Submitted'
   - Note: Side effect `calculate_invoice_total` is disabled in tests

2. **should transition from Submitted to Approved (Approve)**
   - Executes 'Approve' action
   - Verifies state changes to 'Approved' (final state)
   - Verifies workflow status becomes 'completed'

3. **should transition from Submitted to Draft (Reject)**
   - Executes 'Reject' action
   - Verifies state returns to 'Draft'
   - Note: Side effect `handle_invoice_reject` is disabled in tests

4. **should complete full workflow end-to-end (Submit → Approve)**
   - Tests complete workflow from creation to approval
   - Verifies all state transitions
   - Verifies invoice data integrity

**Fixtures**: `purchase-invoice-test-fixtures.ts`
- `createPurchaseInvoiceData()`: Generates invoice payload
- `createPurchaseInvoiceLineItemData()`: Generates invoice line item payload
- `assertPurchaseInvoiceCreated()`: Verifies invoice in database
- `assertWorkflowState()`: Verifies workflow state

**Note**: Line items are optional for workflow tests. Side effects are disabled.

---

## Sales Module Tests

### Sales Order (`sales-order/sales-order.test.ts`)

**Purpose**: Test sales order creation and workflow

**Test Cases**:
- Sales order creation
- Sales order workflow transitions
- Sales order to invoice generation
- Integration with customer and item master

---

### Sales Invoice (`sales-invoice/direct-invoice.test.ts`)

**Purpose**: Test direct sales invoice creation (without sales order)

**Test Cases**:
- Direct invoice creation
- Invoice line items
- Invoice total calculation
- Customer relationship

---

### Quote (`quote/quote.test.ts`)

**Purpose**: Test quote creation and management

**Test Cases**:
- Quote creation
- Quote line items
- Quote to sales order conversion

---

### Delivery Challan (`delivery-challan/delivery-challan.test.ts`)

**Purpose**: Test delivery challan creation and management

**Test Cases**:
- Delivery challan creation
- Partial delivery scenarios
- Delivery challan to invoice conversion

---

### Credit Note (`credit-note/credit-note.test.ts`)

**Purpose**: Test credit note creation and processing

**Test Cases**:
- Credit note creation
- Credit note line items
- Credit note application to invoices

---

## Accounting Module Tests

### Payment Receipt (`payment-receipt/payment-receipt.test.ts`)

**Purpose**: Test payment receipt creation and invoice balance updates

**Test Cases**:
- Payment receipt creation
- Payment receipt linked to invoice
- Automatic invoice balance_amount update via `calculate_payment_total`
- Multiple payment receipts for same invoice

**Side Effects**: `calculate_payment_total` updates invoice balance

---

## Integration Tests

### Zoho Books (`integrations/zoho_books/zoho_books.test.ts`)

**Purpose**: Test Zoho Books ERP integration

**Test Cases**:
- Connection setup
- Data synchronization
- API authentication
- Error handling

---

### Email (`email/sendEmail.test.ts`)

**Purpose**: Test email notification system

**Test Cases**:
- Workflow notification emails
- Email template rendering
- Email delivery verification

---

## Agent Tests

### Agent Service (`agent/agent-service.test.ts`)

**Purpose**: Test AI agent service functionality

**Test Cases**:
- Agent context building
- Model registry queries
- Permission checks

---

### Agent Routes (`agent/agent-routes.test.ts`)

**Purpose**: Test AI agent API endpoints

**Test Cases**:
- Route handlers
- Request/response validation
- Error handling

---

### Agent Analytics (`agent/agent-analytics.test.ts`)

**Purpose**: Test agent analytics and reporting

**Test Cases**:
- Analytics data collection
- Report generation
- Performance metrics

---

### Agent Generate Text (`agent/agent-generate-text.test.ts`)

**Purpose**: Test AI text generation capabilities

**Test Cases**:
- Text generation from context
- Template processing
- Response formatting

---

## Running Tests

### Run All Tests
```bash
cd backend
npm test
```

### Run Specific Test Suite
```bash
npm test -- purchase-requisition.test.ts
npm test -- purchase-order-workflow.test.ts
npm test -- purchase-invoice-workflow-transitions.test.ts
```

### Run Tests with Specific Configuration
```bash
TEST_CONFIG=indian-demo npm test
TEST_CONFIG=us-ca-demo npm test
```

### Run Tests with Increased Timeout
```bash
npm test -- --testTimeout=30000
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

---

## Test Coverage Summary

### Master Data Models
- ✅ Customers: 2 tests (basic creation, optional fields)
- ✅ Supplier: 2 tests (basic creation, business classification)
- ✅ Item Master: 2 tests (product, service)
- ✅ Location: 2 tests (standalone, with customer)

### Procurement Module
- ✅ Purchase Requisition: 15 tests (creation, workflow transitions, rejections, send backs, side effects)
- ✅ Purchase Order: 6 tests (creation, workflow transitions)
- ✅ Invoice (Purchase): 6 tests (creation, workflow transitions)

### Sales Module
- ✅ Sales Order: Multiple tests
- ✅ Sales Invoice: Multiple tests
- ✅ Quote: Multiple tests
- ✅ Delivery Challan: Multiple tests
- ✅ Credit Note: Multiple tests

### Accounting Module
- ✅ Payment Receipt: Multiple tests

### Workflow Coverage
- ✅ Purchase Requisition: 100% workflow path coverage (happy path, rejections, send backs)
- ✅ Purchase Order: 100% workflow path coverage
- ✅ Invoice: 100% workflow path coverage

### Side Effects Testing
- ⚠️ Side effects (email, ERP sync) are **disabled** in workflow tests to prevent delays
- Side effect functionality is tested separately in integration tests

---

## Test Data Requirements

### Seed Data
Tests require seed data to be loaded:
```bash
# Indian demo data
npx ts-node prisma/setup-IN/setup-indian-demo.ts

# US-CA demo data
npx ts-node prisma/setup-US_CA/setup-us-ca-demo.ts
```

### Required Seed Data
- Organizations
- Users (with roles: Buyer, Manager, Finance Team, etc.)
- Customers
- Suppliers
- Items (with supplier assignments)
- Locations
- Workflows (run `npx ts-node prisma/setup-workflows.ts`)

---

## Test Fixtures Pattern

All test files follow a consistent pattern:

1. **Test Fixtures File** (`*-test-fixtures.ts`):
   - `create*Data()`: Generate test payloads
   - `assert*Created()`: Verify database state
   - `assertWorkflowState()`: Verify workflow state

2. **Test File** (`*.test.ts`):
   - `beforeAll()`: Load configuration and validate seed data
   - `describe()`: Group related tests
   - `it()`: Individual test cases
   - `afterAll()`: Cleanup (optional)

3. **Test Context**:
   - Uses `loadTestConfig()` and `createTestContext()`
   - Provides authenticated user context
   - Includes org_id for multi-tenant isolation

---

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Tests should clean up created data (or use unique identifiers)
3. **Seed Data**: Use existing seed data rather than creating new test data
4. **Side Effects**: Disable side effects in workflow tests to prevent delays
5. **Assertions**: Verify both API response and database state
6. **Error Handling**: Test both success and failure scenarios
7. **Workflow Context**: Use appropriate user contexts (buyer, manager) for workflow tests

---

## Future Test Additions

### Planned Coverage
- [ ] Account master tests (hierarchical accounts)
- [ ] Posting/journal entry tests (double-entry verification)
- [ ] Category tests (with category_group)
- [ ] Sales invoice workflow tests
- [ ] Delivery challan workflow tests
- [ ] Side effect verification tests (when enabled)

---

**End of Document** - Last updated: 2026-01-11
