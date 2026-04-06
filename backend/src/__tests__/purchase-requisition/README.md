# Purchase Requisition Workflow Tests

This folder contains integration tests for the Purchase Requisition workflow, part of the procurement module.

## Overview

The purchase requisition workflow allows creating purchase requests that transition through states: **Draft → Manager Review → Buyer Review → Delivery**. This is a typical procurement approval workflow.

The tests also verify invoice generation from purchase orders via custom actions, simulating the frontend workflow for creating supplier invoices.

## Test Structure

- **`purchase-requisition.test.ts`**: Main test file with 10 test cases
- **`purchase-requisition-test-fixtures.ts`**: Test data fixtures and helper functions

## Setup Instructions

### 1. Prerequisites

- Node.js and npm installed
- PostgreSQL database (locally or via Railway/other cloud provider)
- All Prisma schema compiled (`npx prisma generate`)

### 2. Database Setup Commands

Run these commands in order to set up the database:

```bash
# 1. Reset and push database schema
npx prisma db push --force-reset --accept-data-loss --skip-generate

# 2. Set up metadata (roles, views, permissions)
npx ts-node prisma/setup-metadata.ts

# 3. Set up workflows (flows, states, actions)
npx ts-node prisma/setup-workflows.ts

# 4. Set up test data (org, items, users)
npx ts-node prisma/setup-test-data.ts
```

**Or run them all at once:**

```bash
npx prisma db push --force-reset --accept-data-loss --skip-generate && \
npx ts-node prisma/setup-metadata.ts && \
npx ts-node prisma/setup-workflows.ts && \
npx ts-node prisma/setup-test-data.ts
```

### 3. Environment Configuration

Ensure your `.env.test` file is configured with your test database URL:

```bash
DATABASE_URL="postgresql://user:password@host:port/database"
PRISMA_SHOW_QUERY=false
```

## Running the Tests

### Run All Tests

```bash
npm test -- src/__tests__/purchase-requisition/purchase-requisition.test.ts
```

### Run a Specific Test by Name

```bash
npm test -- src/__tests__/purchase-requisition/purchase-requisition.test.ts -t "Basic Purchase Requisition Creation"
```

### Run Only One Test (Using .only)

Edit `purchase-requisition.test.ts` and add `.only()` to the test:

```typescript
it.only('should create a purchase requisition with workflow instance in Draft state', async () => {
```

Then run:

```bash
npm test -- src/__tests__/purchase-requisition/purchase-requisition.test.ts
```

### Run Tests with Verbose Output

```bash
npm test -- src/__tests__/purchase-requisition/purchase-requisition.test.ts --verbose
```

## Test Cases

1. **Basic Purchase Requisition Creation** - Creates a purchase requisition and verifies workflow instance is in Draft state
2. **Purchase Requisition with Items** - Creates a purchase requisition with line items using the 'items' relationship
3. **Workflow Transition to Manager Review** - Tests transition from Draft to Manager Review state
4. **Workflow Assignment to Manager** - Verifies that the workflow is assigned to the manager of the user who submitted the PR
5. **Workflow Transition to Buyer Review** - Tests transition from Manager Review to Buyer Review state
6. **Workflow Transition to Delivery** - Tests transition to final state (Delivery)
7. **Purchase Order Generation** - Verifies that POs are automatically created when transitioning to Delivery, with separate POs for items from different suppliers
8. **Multiple Items Purchase Requisition** - Creates purchase requisition with multiple line items
9. **Location and Requester Details** - Verifies location and requester details are correctly set
10. **Invoice Generation from Purchase Order** - Tests invoice creation from purchase order using custom action (generate_invoice). This simulates the frontend workflow where a PO is selected and an invoice is generated via `runCustomAction`. Verifies:
   - Invoice is created with proper supplier details
   - Invoice line items are created from PO items
   - Invoice references the correct PO
   - Line items contain proper product and pricing information

## Test Data

The tests use seed data created by `prisma/setup-test-data.ts`:

- **Organization**: `org_test_company` (Test Company Inc)
- **Suppliers**: 
  - `supp_test_vendor` (Test Vendor Inc) - linked to Product A
  - `supp_test_vendor_2` (Second Vendor Inc) - linked to Service B and Product C
- **Items**: 
  - `item_test_product_a` (Product A) - from Test Vendor Inc
  - `item_test_service_b` (Service B) - from Second Vendor Inc
  - `item_test_product_c` (Product C) - from Second Vendor Inc
- **Location**: `loc_test_warehouse` (Test Warehouse)
- **Users**:
  - **Manager**: `user_manager_123` (manager@testcompany.com) - Test Manager
  - **Employee**: `user_test_123` (test@testcompany.com) - Test User (reports to Manager)
  - **Sales Rep**: `user_test_2` (sales@testcompany.com) - John Sales

**Important**: The `user_test_123` user has its `manager_id` field set to `user_manager_123` in the seed data, enabling manager assignment testing during workflow transitions.

**Note**: Suppliers are linked to items to enable PO generation. Items are distributed across two suppliers to test multi-supplier PO creation.

## Procurement Workflow Overview

### Purchase Requisition → Purchase Order → Invoice

1. **Purchase Requisition (PR)**: Employee creates a purchase request
2. **Workflow Approval**: PR goes through approval stages (Manager → Buyer)
3. **Purchase Order (PO)**: When PR reaches Delivery, POs are auto-generated (one per supplier)
4. **Invoice**: From PO, invoices can be manually created via custom action `generate_invoice`

## Workflow States

The purchase requisition workflow has the following states:

1. **Draft** (Initial) - Created by user
2. **Manager Review** - Assigned to manager for approval
3. **Buyer Review** - Assigned to buyer role for approval
4. **Delivery** (Final) - Assigned to delivery role, indicates completion

## Workflow Actions

- **Submit** - Draft → Manager Review
- **Approve by Manager** - Manager Review → Buyer Review
- **Approve by Buyer** - Buyer Review → Delivery
- **Reject to Draft** - Manager Review → Draft (rejection)
- **Reject to Manager** - Buyer Review → Manager Review (rejection)

## Troubleshooting

### Tests Timing Out

If tests timeout (default 30 seconds), you can increase the timeout in the test file:

```typescript
jest.setTimeout(60000); // 60 seconds
```

### Database Connection Issues

Make sure `.env.test` has the correct database URL and the database is accessible.

### Workflow Actions Not Found

Ensure workflows are properly set up by running:
```bash
npx ts-node prisma/setup-workflows.ts
```

This creates the necessary roles (Buyer, Delivery) and workflow states/actions.

### User Missing Employee Role

Ensure test data is set up:
```bash
npx ts-node prisma/setup-test-data.ts
```

This creates the `user_test_123` user with Employee role.

### Buyer/Delivery Roles Not Found

The setup-workflows.ts script creates the Buyer and Delivery roles. Make sure it has been run:
```bash
npx ts-node prisma/setup-workflows.ts
```

## Debugging

The tests include extensive console logging. To see the output:

```bash
npm test -- src/__tests__/purchase-requisition/purchase-requisition.test.ts 2>&1 | cat
```

## Cleanup

By default, tests do NOT clean up data to allow inspection. To clean up after tests:

1. Uncomment the cleanup line in `purchase-requisition.test.ts`:
```typescript
// await cleanupTestData(ORG_ID);
```
to:
```typescript
await cleanupTestData(ORG_ID);
```

2. Or manually delete test data from the database

## Notes

- Tests use a 30-second timeout by default
- All console logs are preserved for debugging
- Test data persists after tests complete
- The test user `user_test_123` must have the Employee role
- The workflow requires Buyer and Delivery roles to be created by setup-workflows.ts
- Purchase requisition uses the 'items' relationship for line items (links to the `item` junction model)

