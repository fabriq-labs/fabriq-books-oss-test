# Sales Order Workflow - Test Database Setup Guide

## Overview
This guide explains how to set up and run the sales order workflow tests with a test database.

## Database Configuration

### Test Database URL
The test suite uses a separate test database defined in `.env.test` file. Based on your existing setup:

**Current Configuration:**
```
DATABASE_URL="postgresql://user:password@localhost:5432/kernel_app"
```

### Important: Setting Up Test Database URL

**Test database URL is specified in `.env.test` file:**

1. **Create or edit `.env.test` file** in the root directory:
   ```bash
   # Edit .env.test
   DATABASE_URL="postgresql://user:password@localhost:5432/kernel_app"
   ```

2. **For Prisma commands that need to use test database**, temporarily switch:
   ```bash
   # Use test database for migration/push
   DATABASE_URL="$(cat .env.test | grep DATABASE_URL | cut -d'=' -f2)" npx prisma db push
   
   # OR simply edit .env temporarily, then restore
   ```

**Recommended Approach**: Use the same database for tests as your development database

## Test Setup Files

### 1. Environment Setup
**File**: `src/__tests__/env-setup.ts`
- Loads `.env.test` for test environment
- Runs before all tests

### 2. Test Setup
**File**: `src/__tests__/setup.ts`
- Creates Prisma client with test DATABASE_URL
- Sets up seed data before all tests
- Cleans up after all tests

### 3. Test Configuration
**File**: `jest.config.js`
- Uses `setupFilesAfterEnv` to run `src/__tests__/setup.ts`
- Runs `src/__tests__/env-setup.ts` as setup file

## Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Generate Prisma client with new schema
npx prisma generate

# Push schema to test database (use railway test db if using separate db)
npx prisma db push
```

### Run All Tests
```bash
npm test
```

### Run Sales Order Tests Only
```bash
npm test -- sales-order.test.ts
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Specific Test
```bash
npm test -- -t "should create a sales order with workflow instance in Draft state"
```

## Test Database Migration

### Step 1: Run Prisma Migration

**Important**: By default, `npx prisma` uses the DATABASE_URL from `.env`. To use the test database URL:

**Option A**: Copy `.env.test` temporarily:
```bash
# Backup current .env
cp .env .env.backup

# Copy test config to .env
cp .env.test .env

# Push schema
npx prisma db push

# Restore original .env
mv .env.backup .env
```

**Option B**: Run with explicit DATABASE_URL (simpler):
```bash
# Set DATABASE_URL from .env.test for the command
source .env.test && npx prisma db push
```

**Option C**: Use the same database (recommended):
- Just use your current `.env` DATABASE_URL
- Run: `npx prisma db push`

### Step 2: Run Workflow Seed
```bash
# Seed sales order workflow (creates workflow flow, states, actions)
npx ts-node prisma/sales-workflow-seed.ts
```

### Step 3: Run Tests
```bash
npm test -- sales-order.test.ts
```

## What Gets Created in Test Database

### Before Test Run
The `beforeAll` hook in `src/__tests__/setup.ts` creates:
- Test Organization (`org_test_seed`)
- Test Currency (`cur_test_seed`)  
- Test Customer (`cust_test_seed`)
- Test Account (`acc_test_seed`)

### During Test Run
Each test creates:
- Sales Orders (with `so_` prefix)
- Sales Order Items (with `so_item_` prefix)
- Invoices (with `invoice_` prefix)
- Invoice Line Items (with `in_item__` prefix)
- Workflow Instances (with `wins_` prefix)
- Workflow History (with `whis_` prefix)

### After Test Run
The `afterAll` hook cleans up:
- Payment Receipts
- Invoices  
- Customers
- Accounts
- Currencies
- Organizations

## Database Schema

Your test database needs these new models:
1. `sales_order` (id: so_*)
2. `sales_order_item` (id: so_item_*)

These are defined in `prisma/schema/sales.prisma`.

The invoice model was updated with `sales_order_id` field to link invoices back to sales orders.

## Troubleshooting

### Issue: "DATABASE_URL not set"
**Solution**: Check that `.env.test` exists in the root directory and contains:
```
DATABASE_URL="your_database_url_here"
```

### Issue: "Workflow flow for model sales_order not found"
**Solution**: Run the workflow seed script:
```bash
npx ts-node prisma/sales-workflow-seed.ts
```

### Issue: "Error creating sales order"
**Solution**: Ensure the schema is pushed to the test database:
```bash
npx prisma db push
```

### Issue: "Foreign key constraint violation"
**Solution**: Tests use isolated seed data. Ensure test setup runs successfully:
```bash
npm test -- --setupFilesAfterEnv=src/__tests__/setup.ts
```

## Test Coverage

The sales order tests verify:
1. ✅ Sales order creation with automatic workflow instance
2. ✅ Sales order with line items  
3. ✅ Workflow transitions (Draft → Submitted → Invoiced)
4. ✅ Automatic invoice generation
5. ✅ Invoice linking to sales order
6. ✅ Multiple line items transferred to invoice
7. ✅ Customer and payment terms mapping

## Next Steps

1. **Ensure `.env.test` has your test database URL**
2. **Run migrations**: `npx prisma db push`
3. **Run workflow seed**: `npx ts-node prisma/sales-workflow-seed.ts`
4. **Run tests**: `npm test -- sales-order.test.ts`

## Files Created/Modified

### New Files
- `prisma/schema/sales.prisma` - Sales models
- `src/lib/actions/sales.ts` - Sales actions
- `prisma/sales-workflow-seed.ts` - Workflow setup
- `src/lib/actions/__tests__/sales-order.test.ts` - Tests
- `src/lib/actions/__tests__/sales-test-fixtures.ts` - Test fixtures

### Modified Files
- Invoice lines live on `prisma/schema/domain.prisma` in this branch. The old `zeiv.prisma` split is not here.
- `prisma/schema/metadata.prisma` - Added sales_orders to workflow_instance
- `prisma/schema/schema.prisma` - Imported sales.prisma
- `src/lib/actions.ts` - Registered sales workflow
- `src/workflow-engine/types/workflow.types.ts` - Added sales_order to is_workflow_model

All files have no linting errors and are ready for testing!

