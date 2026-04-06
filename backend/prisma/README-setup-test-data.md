# Test Data Setup Documentation

## Overview

The `setup-test-data.ts` script creates a comprehensive test environment for the Fabriq Base financial suite, specifically designed to test both sales and procurement workflows. This setup provides realistic business entities and user roles to enable end-to-end testing of the system's workflow capabilities.

## Purpose

This test data setup serves multiple purposes:

1. **Workflow Testing**: Test purchase requisition and sales order approval workflows
2. **Integration Testing**: Validate cross-module interactions (procurement ↔ accounting ↔ sales)
3. **User Role Testing**: Verify role-based access control and permissions
4. **Multi-tenancy Testing**: Ensure proper data isolation between organizations
5. **Business Process Validation**: Test complete business cycles from order to payment

## Prerequisites

Before running this setup, ensure the following are already configured:

1. **Metadata Setup**: Run `setup-metadata.ts` first (creates roles, views, permissions)
2. **Workflow Setup**: Run `setup-workflows.ts` (creates workflow definitions)
3. **Database Connection**: Valid `DATABASE_URL` environment variable

## Execution

```bash
# From the monorepo `backend/prisma` directory
npx ts-node setup-test-data.ts
```

## Data Architecture

### Multi-Tenancy Structure

The setup creates a hierarchical organization structure:

```
org (Multi-tenancy)
└── organization (Business entity)
    ├── customers
    ├── suppliers
    ├── item_master
    ├── location
    └── users (with roles)
```

### Organization Details

- **Multi-tenancy Org ID**: `org_test_company`
- **Business Name**: Test Company Inc
- **Location**: San Francisco, CA
- **Industry**: Technology/Manufacturing

## Test Data Entities

### 1. Customer (Sales Side)

| Field | Value |
|-------|-------|
| ID | `cust_acme_corp` |
| Name | ACME Corporation |
| Industry | Manufacturing |
| Location | Los Angeles, CA |
| Email | orders@acmecorp.com |
| Phone | +1-555-0100 |

### 2. Suppliers (Procurement Side)

#### Supplier 1: Test Vendor Inc
| Field | Value |
|-------|-------|
| ID | `supp_test_vendor` |
| Name | Test Vendor Inc |
| Location | San Jose, CA |
| Email | orders@testvendor.com |
| Status | Active |

#### Supplier 2: Second Vendor Inc
| Field | Value |
|-------|-------|
| ID | `supp_test_vendor_2` |
| Name | Second Vendor Inc |
| Location | Oakland, CA |
| Email | orders@secondvendor.com |
| Status | Active |

### 3. Items (Product Catalog)

The setup creates 3 items across 2 suppliers:

#### Item 1: Product A (Physical Product)
- **ID**: `item_test_product_a`
- **Code**: `PROD-A`
- **Type**: Product (Stockable)
- **Price**: $1,000.00
- **Supplier**: Test Vendor Inc

#### Item 2: Service B (Service)
- **ID**: `item_test_service_b`
- **Code**: `SERV-B`
- **Type**: Service (Non-stockable)
- **Price**: $500.00
- **Supplier**: Second Vendor Inc

#### Item 3: Product C (Physical Product)
- **ID**: `item_test_product_c`
- **Code**: `PROD-C`
- **Type**: Product (Stockable)
- **Price**: $750.00
- **Supplier**: Second Vendor Inc

### 4. Location (Delivery/Warehouse)

| Field | Value |
|-------|-------|
| ID | `loc_test_warehouse` |
| Name | Test Warehouse |
| Address | 123 Warehouse St, San Francisco, CA |
| Customer | ACME Corporation |
| Legal Entity | Test Company Inc |

## User Roles and Permissions

### Required Roles

The setup expects these roles to exist (created by `setup-metadata.ts`):
- **Employee**: Basic user role for sales and procurement operations
- **Buyer**: Procurement role for purchase requisition approvals

### Test Users

#### User 1: Manager (Workflow Approver)
- **ID**: `user_manager_123`
- **Email**: `manager@testcompany.com`
- **Password**: `Metalimits@123`
- **Roles**: Employee, Buyer
- **Purpose**: Approves purchase requisitions and manages team

#### User 2: Test Employee (Reports to Manager)
- **ID**: `user_test_123`
- **Email**: `test@testcompany.com`
- **Password**: `Metalimits@123`
- **Manager**: Test Manager
- **Roles**: Employee, Buyer
- **Purpose**: Creates purchase requisitions and sales orders

#### User 3: Sales Representative
- **ID**: Auto-generated
- **Email**: `sales@testcompany.com`
- **Password**: `Metalimits@123`
- **Roles**: Employee
- **Purpose**: Sales operations and customer management

## Workflow Testing Scenarios

### Sales Order Workflow
```
Draft → Submitted → Invoiced
```
- **Purpose**: Test order-to-invoice generation
- **Roles Involved**: Employee
- **Business Process**: Sales order creation → Invoice auto-generation

### Purchase Requisition Workflow
```
Draft → Manager Review → Buyer Review → Delivery
```
- **Purpose**: Test multi-level approval process
- **Roles Involved**: Employee, Buyer
- **Business Process**: PR creation → Manager approval → Buyer approval → Delivery

## API Testing Examples

### Authentication
```bash
# Login as test user
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@testcompany.com", "password": "Metalimits@123"}'
```

### Create Sales Order
```bash
# POST /api/sales_order/view/sales_order_view
{
  "title": "Test Sales Order",
  "customer_id": "cust_acme_corp",
  "location_id": "loc_test_warehouse",
  "sales_order_items": [
    {
      "item_id": "item_test_product_a",
      "quantity": 2,
      "unit_price": 1000.00
    }
  ]
}
```

### Create Purchase Requisition
```bash
# POST /api/purchase_requisition/view/purchase_requisition_view
{
  "title": "Test Purchase Requisition",
  "supplier_id": "supp_test_vendor",
  "description": "Test PR for workflow",
  "purchase_requisition_items": [
    {
      "item_id": "item_test_product_a",
      "quantity": 5,
      "estimated_cost": 5000.00
    }
  ]
}
```

## Database Queries for Verification

### Check Active Workflows
```sql
-- View active workflow instances
SELECT
    wi.id as instance_id,
    wi.model_id,
    wf.name as workflow_name,
    ws.name as current_state,
    u.name as assigned_user
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
LEFT JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN user u ON wi.assigned_user_id = u.id
WHERE wi.status = 'active' AND wf.model_name IN ('sales_order', 'purchase_requisition');
```

### Verify Test Data
```sql
-- Count test entities
SELECT 'customers' as entity, COUNT(*) as count FROM customers WHERE org_id = 'org_test_company'
UNION ALL
SELECT 'suppliers', COUNT(*) FROM supplier WHERE org_id = 'org_test_company'
UNION ALL
SELECT 'items', COUNT(*) FROM item_master WHERE org_id = 'org_test_company'
UNION ALL
SELECT 'users', COUNT(*) FROM user WHERE org_id = 'org_test_company';
```

## Business Process Testing

### End-to-End Sales Flow
1. **Create Sales Order** → Draft state
2. **Submit for Processing** → Submitted state
3. **Auto-generate Invoice** → Invoiced state (with workflow transition)
4. **Record Payment** → Payment receipt against invoice

### End-to-End Procurement Flow
1. **Create Purchase Requisition** → Draft state
2. **Submit for Approval** → Manager Review state
3. **Manager Approves** → Buyer Review state
4. **Buyer Approves** → Delivery state
5. **Create Purchase Order** → From approved PR
6. **Receive Invoice** → From supplier
7. **Process Payment** → To supplier

## Troubleshooting

### Common Issues

1. **Role Not Found Error**
   - **Cause**: `setup-metadata.ts` not run
   - **Solution**: Run `npx ts-node setup-metadata.ts` first

2. **Workflow Not Found Error**
   - **Cause**: `setup-workflows.ts` not run
   - **Solution**: Run `npx ts-node setup-workflows.ts` first

3. **Views Not Found Warning**
   - **Cause**: Sales order views not yet created
   - **Solution**: Expected - views will be created during sales module development

4. **Authentication Errors**
   - **Cause**: Users not created or password incorrect
   - **Solution**: Check user creation logs and verify password `Metalimits@123`

### Data Cleanup

To reset test data:
```sql
-- Delete test organization data (CAUTION: Use carefully)
DELETE FROM user WHERE org_id = 'org_test_company';
DELETE FROM customers WHERE org_id = 'org_test_company';
DELETE FROM supplier WHERE org_id = 'org_test_company';
DELETE FROM item_master WHERE org_id = 'org_test_company';
DELETE FROM location WHERE org_id = 'org_test_company';
DELETE FROM organization WHERE id = 'org_test_company';
DELETE FROM org WHERE id = 'org_test_company';
```

## Integration with Testing Framework

This test data is designed to work with the existing test suite:

```typescript
// Example test using the test data
describe('Sales Order Workflow', () => {
  test('should create sales order and transition through workflow', async () => {
    // Login as test user
    const token = await login('test@testcompany.com', 'Metalimits@123');

    // Create sales order
    const response = await request(app)
      .post('/api/sales_order/view/sales_order_view')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Test Order',
        customer_id: 'cust_acme_corp',
        location_id: 'loc_test_warehouse'
      });

    expect(response.status).toBe(201);
    // ... additional workflow tests
  });
});
```

## Future Enhancements

### Planned Additions
1. **Invoice Views**: Create dedicated invoice views for sales vs purchase
2. **Payment Receipts**: Add payment receipt test data
3. **Delivery Challans**: Add delivery management test data
4. **Budget Data**: Add budget and cost center test data
5. **Multi-Currency**: Add currency master and exchange rate data

### Extended User Roles
1. **Finance Users**: For invoice and payment processing
2. **Warehouse Users**: For delivery and inventory management
3. **Executive Users**: For reporting and oversight

## Summary

The `setup-test-data.ts` script provides a solid foundation for testing the Fabriq Base system's core workflows and business processes. It creates a realistic business environment with proper multi-tenancy, user roles, and interconnected business entities that enable comprehensive integration testing of the procurement and sales modules.
