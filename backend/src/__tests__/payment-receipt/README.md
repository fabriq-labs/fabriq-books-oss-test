# Payment Receipt Tests

This folder contains integration tests for the Payment Receipt functionality, including balance calculation using `calculate_payment_total`.

## Overview

The payment receipt workflow allows creating payment receipts linked to invoices that automatically update the invoice's `balance_amount` through the `calculate_payment_total` function. Payment receipts are created using `modelService.addChildrenToParent`, and the `calculate_payment_total` function is called with the payment_receipt id in `change_set` and the invoice data graph structure in `select_set`.

## Test Structure

- **`payment-receipt.test.ts`**: Main test file with 5 test cases
- **`payment-receipt-fixtures.ts`**: Test data fixtures and helper functions (including `getInvoiceSelectSet()` for invoice data graph structure)

## Test Cases

### Core Payment Receipt Tests

1. **Payment Receipt with calculate_payment_total**: 
   - Verifies balance calculation is called correctly after creating a payment receipt
   - Invoice total: 2000.00, Payment amount: 750.00
   - Expected balance after payment: 1250.00
   - Uses `calculate_payment_total` automatically via `addChildrenToParent`
   - Validates that `paymentResult.data?.balance_amount` is correctly updated

2. **Multiple Payment Receipts**: 
   - Tests handling multiple payments for the same invoice
   - Invoice total: 3000.00
   - First payment: 500.00 → Expected balance: 2500.00
   - Second payment: 1000.00 → Expected balance: 1500.00
   - Verifies balance is updated correctly after each payment

### createPaymentReceipt Function Tests - Using calculate_payment_total

These tests demonstrate the proper usage of `calculate_payment_total` with payment_receipt ids and invoice data graph:

3. **✅ Positive Test Case (Valid Payment Receipt)**: 
   - Invoice total: 1000.00, Payment amount: 800.00
   - Expected balance after payment: 200.00
   - Creates payment receipt using `addChildrenToParent`
   - `calculate_payment_total` is called automatically and updates invoice balance
   - Verifies successful payment receipt creation and balance update

4. **❌ Negative Test Case (Amount Exceeds Invoice Total)**: 
   - Invoice total: 1000.00, Payment amount: 1200.00
   - Validates that payment exceeding invoice total throws an error
   - Expected error: `"Failed to calculate payment total: Total payments (1200) are greater than invoice total (1000). Cannot update balance amount."`
   - Ensures `createResult.success` is `false` and no payment receipt is created
   - Verifies transaction rollback occurs when validation fails

5. **🔄 Multiple Payment Receipts for a Single Invoice**: 
   - Invoice total: 1000.00
   - First receipt: 400.00 ✅ → Expected balance: 600.00
   - Second receipt: 500.00 ✅ → Expected balance: 100.00
   - Third receipt: 200.00 ❌ (should throw error — total would exceed 1000.00)
   - Tests validation logic that prevents total payments from exceeding invoice total
   - Verifies that transaction rollback occurs when validation fails on the third payment

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
npm test -- src/__tests__/payment-receipt/payment-receipt.test.ts
```

### Run a Specific Test by Name

```bash
npm test -- src/__tests__/payment-receipt/payment-receipt.test.ts -t "should update invoice balance when payment receipt is created"
```

### Run Only One Test (Using .only)

Edit `payment-receipt.test.ts` and add `.only()` to the test:

```typescript
it.only('should create a payment receipt linked to an invoice', async () => {
  // ...
});
```

## Test Data

The tests use hardcoded data:
- Invoice totals: 1000.00, 2000.00, 3000.00
- Payment amounts: 400.00, 500.00, 750.00, 800.00, 1000.00, 1200.00, 200.00
- Payment types: PARTIAL
- Expected balance amounts after payments:
  - 2000.00 invoice - 750.00 payment = 1250.00 balance
  - 3000.00 invoice - 500.00 payment = 2500.00 balance → - 1000.00 payment = 1500.00 balance
  - 1000.00 invoice - 800.00 payment = 200.00 balance
  - 1000.00 invoice - 400.00 payment = 600.00 balance → - 500.00 payment = 100.00 balance

## Key Features Tested

1. **Payment Receipt Creation**: Creating payment receipts using `modelService.addChildrenToParent` with invoice_id
2. **Balance Calculation**: Automatic balance updates via `calculate_payment_total`
   - Uses payment_receipt id in `change_set` parameter
   - Uses invoice data graph structure in `select_set` parameter (via `getInvoiceSelectSet()`)
3. **Multiple Payments**: Handling multiple payments for a single invoice
4. **Validation**: Preventing payments exceeding invoice total
   - Validates before creating payment receipts
   - Validates during `calculate_payment_total` execution
   - Transaction rollback when validation fails

## Important Implementation Details

### How `calculate_payment_total` is Called

In the tests, `calculate_payment_total` is automatically called by `addChildrenToParent` via the `execute_Action` mechanism. The function receives:

1. **`change_set`**: Array containing the payment_receipt id(s) that triggered the calculation (automatically extracted from newly created payment receipts)
   ```typescript
   [paymentReceiptId] // Single payment receipt id
   ```

2. **`select_set`**: Invoice data graph structure (automatically generated from the view/select configuration)
   ```typescript
   // Automatically provided by addChildrenToParent based on view configuration
   ```

3. **Transaction**: Called within the transaction managed by `addChildrenToParent`
   ```typescript
   // All handled automatically by addChildrenToParent
   const paymentResult = await modelService.addChildrenToParent(
       'invoice',
       invoiceId,
       'payment_receipt',
       context,
       [paymentDataWithoutInvoiceId],
       {}
   );
   // calculate_payment_total is called internally and updates the invoice balance
   ```

### Payment Receipt Creation Flow

1. Create payment receipt using `modelService.addChildrenToParent`
2. `calculate_payment_total` is automatically called during `addChildrenToParent` execution
3. The result contains the updated invoice with balance_amount recalculated
4. Access created payment receipt IDs from the result:
   ```typescript
   const paymentResult = await modelService.addChildrenToParent(
       'invoice',
       invoiceId,
       'payment_receipt',
       context,
       [paymentDataWithoutInvoiceId],
       {}
   );
   
   // The result.data contains the invoice with payment_receipt relation populated
   const paymentReceipts = paymentResult.data?.payment_receipt || [];
   const paymentReceiptId = paymentReceipts.find((pr: any) => pr.amount === 500.00)?.id;
   ```
5. Verify balance is updated correctly by checking `paymentResult.data?.balance_amount`

## Notes

- Tests create invoices and payment receipts with hardcoded data
- The `calculate_payment_total` function is automatically called by `addChildrenToParent` via `execute_Action`
- The function receives payment_receipt id(s) in `change_set` and invoice data graph in `select_set` automatically
- `addChildrenToParent` returns the updated invoice object with:
  - `paymentResult.data.balance_amount`: Updated balance after payment
  - `paymentResult.data.payment_receipt`: Array of all payment receipts (including newly created ones)
  - You can extract payment receipt IDs from `paymentResult.data.payment_receipt` array
- The `getInvoiceSelectSet()` helper function in fixtures provides the complete invoice data graph structure required by `calculate_payment_total` (used internally)
- All test data is preserved by default (cleanup is disabled in `afterAll`)
- Validation errors from `calculate_payment_total` will cause transaction rollback, preventing invalid payment receipts from being saved
- When validation fails, `addChildrenToParent` returns `{ success: false, error: "Failed to calculate payment total: ..." }`

