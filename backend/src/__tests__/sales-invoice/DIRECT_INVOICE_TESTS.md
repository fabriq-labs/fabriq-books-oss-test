# Direct Sales Invoice Creation Tests

## Summary

This test suite validates creating sales invoices directly (without going through a sales order workflow).

## Files Created

1. **`direct-invoice.test.ts`** - Main test file with 8 test cases
2. **`direct-invoice-fixtures.ts`** - Test data fixtures and helper functions
3. **`README.md`** - Updated with direct invoice testing information

## Test Cases

1. **Basic Direct Invoice Creation**
   - Creates a sales invoice without a sales order
   - Verifies invoice_type is 'SALES'
   - Verifies sales_order_id is null

2. **Direct Invoice with Line Items**
   - Creates invoice with line items using `addChildrenToParent`
   - Verifies line items are properly linked

3. **Direct Invoice with Multiple Line Items**
   - Creates invoice with 3 line items
   - Verifies all items are linked correctly

4. **Customer and Location Details Mapping**
   - Verifies customer_id and location_id are set correctly
   - Verifies customer and location details are accessible

5. **Invoice Totals Calculation**
   - Tests calculation of invoice totals from line items
   - Verifies totals match expected amounts (e.g., 4250.00)

6. **Invoice Status and Metadata**
   - Verifies correct invoice_status is set
   - Verifies org_id, created_by, modified_by are set correctly
   - Confirms sales_order_id is null for direct invoices

7. **Mixed Product and Service Items**
   - Creates invoice with both product and service items
   - Verifies item types are handled correctly

8. **Line Item Details**
   - Tests storing detailed information for each line item
   - Verifies quantities, rates, and calculations

## Test Data

Uses seed data from `prisma/setup-test-data.ts`:
- Organization: `org_test_company`
- Customer: `cust_acme_corp`
- Items: `item_test_product_a`, `item_test_service_b`, `item_test_product_c`
- Location: `loc_test_warehouse`
- User: `user_test_123`

## Running the Tests

```bash
# Run direct invoice tests
npm test -- src/__tests__/sales-invoice/direct-invoice.test.ts

# Run all sales invoice tests
npm test -- src/__tests__/sales-invoice/
```

## Key Differences from Sales Order Workflow

1. **No Workflow Instance**: Direct invoices don't go through workflow states
2. **No Sales Order**: `sales_order_id` is null
3. **Direct Creation**: Invoice is created directly via ModelService
4. **Manual Line Items**: Line items are added using `addChildrenToParent` method

## Expected Test Coverage

- Invoice creation without workflow
- Line item addition and linking
- Customer and location mapping
- Total calculations
- Multiple line items handling
- Product vs Service item types
- Invoice status and metadata

