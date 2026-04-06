import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for quote tests
export const createQuoteData = (
    customerId: string,
    locationId: string,
    salesOrderId: string | null,
    projectId: string | null,
    orgId: string,
    userId: string
) => {
    const quoteDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // 30 days from now

    return {
        quote_number: `QT-${Date.now()}`,
        quote_date: quoteDate,
        expiry_date: expiryDate,
        reference_number: `REF-${Date.now()}`,
        customer_id: customerId,
        location_id: locationId,
        sales_order_id: salesOrderId,
        project_id: projectId,
        customer_notes: 'Test customer notes',
        terms_and_conditions: 'Test terms and conditions',
        total_amount: 0, // Will be calculated by line items
        status: 'DRAFT',
        org_id: orgId,
        created_by: userId,
        modified_by: userId,
    };
};

export const createQuoteItemData = (
    quoteId: string,
    itemMasterId: string,
    orgId: string,
    userId: string
) => ({
    // Note: quote_id is not included here - Prisma handles it automatically via nested create
    item_master_id: itemMasterId,
    item_name: 'Test Item',
    item_number: 'TEST-ITEM-001',
    item_description: 'Test item description',
    item_type: 'Product',
    quantity: 2,
    rate: 500.00,
    discount_rate: 10,
    discount_amount: 0.0,
    tax_rate: 2,
    tax_amount: 0.0,
    line_total: 0.00,
    uom: 'EA',
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
export const assertQuoteCreated = async (salesOrderId: string | null, projectId: string | null, quoteId?: string) => {
    const whereClause = quoteId
        ? { id: quoteId }
        : salesOrderId
            ? { sales_order_id: salesOrderId }
            : projectId
                ? { project_id: projectId }
                : {};

    const quote = await prisma.quote.findFirst({
        where: whereClause,
        include: { quote_items: true }
    });

    expect(quote).toBeDefined();
    if (salesOrderId) {
        expect(quote?.sales_order_id).toBe(salesOrderId);
    }
    if (projectId) {
        expect(quote?.project_id).toBe(projectId);
    }

    return quote;
};

export const assertWorkflowState = async (wfInstanceId: string, expectedState: string) => {
    const instance = await prisma.workflow_instance.findUnique({
        where: { id: wfInstanceId }
    });

    expect(instance).toBeDefined();
    expect(instance?.current_state).toBe(expectedState);

    return instance;
};

export const assertQuoteItems = async (quoteId: string, expectedCount: number) => {
    const items = await prisma.quote_item.findMany({
        where: { quote_id: quoteId }
    });

    expect(items.length).toBe(expectedCount);

    return items;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
    // Note: Location is part of seed data, so don't delete it
};

