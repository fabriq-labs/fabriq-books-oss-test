# Sales Order Workflow Tests

This folder contains integration tests for the Sales Order workflow, including automatic invoice generation.

## Overview

The sales order workflow allows creating sales orders that transition through states: **Draft → Submitted → Invoiced**. When transitioning to "Invoiced", an invoice is automatically created.

## Test Structure

- **`sales-order.test.ts`**: Main test file with 6 test cases
- **`sales-test-fixtures.ts`**: Test data fixtures and helper functions

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

# 4. Set up test data (org, customers, items, users)
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
npm test -- src/__tests__/sales-order/sales-order.test.ts
```

### Run a Specific Test by Name

```bash
npm test -- src/__tests__/sales-order/sales-order.test.ts -t "Basic Sales Order Creation"
```

### Run Only One Test (Using .only)

Edit `sales-order.test.ts` and add `.only()` to the test:

```typescript
it.only('should create a sales order with workflow instance in Draft state', async () => {
```

Then run:

```bash
npm test -- src/__tests__/sales-order/sales-order.test.ts
```

### Run Tests with Verbose Output

```bash
npm test -- src/__tests__/sales-order/sales-order.test.ts --verbose
```

## Test Cases

1. **Basic Sales Order Creation** - Creates a sales order and verifies workflow instance is in Draft state
2. **Sales Order with Items** - Creates a sales order with line items
3. **Workflow Transition to Invoiced** - Tests automatic invoice generation when transitioning to Invoiced state
4. **Invoice Link Verification** - Verifies invoice is linked back to sales order
5. **Multiple Items Invoice Generation** - Creates invoice with multiple line items
6. **Customer and Payment Terms Mapping** - Verifies customer and location details are copied to invoice

## Test Data

The tests use seed data created by `prisma/setup-test-data.ts`:

- **Organization**: `org_test_company` (Test Company Inc)
- **Customer**: `cust_acme_corp` (ACME Corporation)
- **Items**: `item_test_product_a` and `item_test_service_b`
- **Location**: `loc_test_warehouse` (Test Warehouse)
- **User**: `user_test_123` with Employee role

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

### User Missing Employee Role

Ensure test data is set up:
```bash
npx ts-node prisma/setup-test-data.ts
```

This creates the `user_test_123` user with Employee role.

## Debugging

The tests include extensive console logging. To see the output:

```bash
npm test -- src/__tests__/sales-order/sales-order.test.ts 2>&1 | cat
```

## Cleanup

By default, tests do NOT clean up data to allow inspection. To clean up after tests:

1. Uncomment the cleanup line in `sales-order.test.ts`:
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

