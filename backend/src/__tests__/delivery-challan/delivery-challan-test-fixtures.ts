import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for delivery challan tests
export const createDeliveryChallanData = (
    customerId: string,
    locationId: string,
    salesOrderId: string | null,
    orgId: string,
    userId: string
) => ({
    challan_number: `DC-${Date.now()}`,
    challan_date: new Date(),
    challan_type: 'DELIVERY' as const,
    sales_order_id: salesOrderId,
    customer_id: customerId,
    location_id: locationId,
    delivery_status: 'SCHEDULED' as const,
    delivery_date: new Date(),
    driver_name: 'Test Driver',
    vehicle_number: 'TEST-VH-123',
    reference_number: `REF-${Date.now()}`,
    delivery_notes: 'Test delivery notes',
    notes: 'Test delivery challan notes',
    total_amount: 0, // Will be calculated by line items
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
});

export const createDeliveryChallanItemData = (
    deliveryChallanId: string,
    itemMasterId: string,
    salesOrderItemId: string | null,
    orgId: string,
    userId: string
) => ({
    // Note: delivery_challan_id is not included here - Prisma handles it automatically via nested create
    sales_order_item_id: salesOrderItemId,
    item_master_id: itemMasterId,
    item_code: 'TEST-ITEM-001',
    item_name: 'Test Item',
    item_description: 'Test item description',
    item_type: 'Product',
    quantity_ordered: 2,
    quantity_delivered: 2,
    quantity_pending: 0,
    uom: 'EA',
    rate: 500.00,
    tax_rate: 2,
    tax_amount: 0.0,
    discount_rate: 10,
    discount_amount: 0.0,
    line_total: 0.00,
    delivery_status: 'FULLY_DELIVERED' as const,
    backorder_quantity: 0,
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
});

export const createTestContext = (userId: string = 'user_test_123', orgId: string = 'org_test_123'): AuthContext => ({
    user: {
        id: userId,
        org_id: orgId,
        email: 'test@example.com',
        name: 'Test User'
    },
    permissions: {},
});

// Helper functions
export const assertDeliveryChallanCreated = async (salesOrderId: string | null, deliveryChallanId?: string) => {
    const whereClause = deliveryChallanId
        ? { id: deliveryChallanId }
        : salesOrderId
            ? { sales_order_id: salesOrderId }
            : {};

    const deliveryChallan = await prisma.delivery_challan.findFirst({
        where: whereClause,
        include: { delivery_challan_items: true }
    });

    expect(deliveryChallan).toBeDefined();
    if (salesOrderId) {
        expect(deliveryChallan?.sales_order_id).toBe(salesOrderId);
    }

    return deliveryChallan;
};

export const assertWorkflowState = async (wfInstanceId: string, expectedState: string) => {
    const instance = await prisma.workflow_instance.findUnique({
        where: { id: wfInstanceId }
    });

    expect(instance).toBeDefined();
    expect(instance?.current_state).toBe(expectedState);

    return instance;
};

export const assertDeliveryChallanItems = async (deliveryChallanId: string, expectedCount: number) => {
    const items = await prisma.delivery_challan_item.findMany({
        where: { delivery_challan_id: deliveryChallanId }
    });

    expect(items.length).toBe(expectedCount);

    return items;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
    // Note: Location is part of seed data, so don't delete it
};

