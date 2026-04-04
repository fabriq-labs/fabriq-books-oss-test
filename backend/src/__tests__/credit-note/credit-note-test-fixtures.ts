import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for credit note tests
export const createCreditNoteData = (
    customerId: string,
    locationId: string,
    invoiceId: string | null,
    salesOrderId: string | null,
    orgId: string,
    userId: string
) => ({
    credit_note_number: `CN-${Date.now()}`,
    credit_note_date: new Date(),
    credit_note_version: 1,
    credit_note_status: 'DRAFT',
    credit_note_type: 'RETURN',
    customer_id: customerId,
    location_id: locationId,
    invoice_id: invoiceId,
    sales_order_id: salesOrderId,
    credit_note_total: 0, // Will be calculated by line items
    balance_amount: 0,
    reason: 'Test credit note reason',
    notes: 'Test credit note notes',
    terms_and_conditions: 'Test terms and conditions',
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
});

export const createCreditNoteItemData = (
    creditNoteId: string,
    itemMasterId: string,
    invoiceLineItemId: string | null,
    orgId: string,
    userId: string
) => ({
    // Note: credit_note_id is not included here - Prisma handles it automatically via nested create
    invoice_line_item_id: invoiceLineItemId,
    item_master_id: itemMasterId,
    item_name: 'Test Item',
    item_number: 'TEST-ITEM-001',
    item_description: 'Test item description',
    item_type: 'Product',
    quantity: 2,
    rate: 500.00,
    line_total: 0.00,
    tax_rate: 2,
    tax_amount: 0.0,
    discount_rate: 10,
    discount_amount: 0.0,
    tax_rate_intra: 0,
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
export const assertCreditNoteCreated = async (invoiceId: string | null, salesOrderId: string | null, creditNoteId?: string) => {
    const whereClause = creditNoteId
        ? { id: creditNoteId }
        : invoiceId
            ? { invoice_id: invoiceId }
            : salesOrderId
                ? { sales_order_id: salesOrderId }
                : {};

    const creditNote = await prisma.credit_note.findFirst({
        where: whereClause,
        include: { credit_note_item: true }
    });

    expect(creditNote).toBeDefined();
    if (invoiceId) {
        expect(creditNote?.invoice_id).toBe(invoiceId);
    }
    if (salesOrderId) {
        expect(creditNote?.sales_order_id).toBe(salesOrderId);
    }

    return creditNote;
};

export const assertWorkflowState = async (wfInstanceId: string, expectedState: string) => {
    const instance = await prisma.workflow_instance.findUnique({
        where: { id: wfInstanceId }
    });

    expect(instance).toBeDefined();
    expect(instance?.current_state).toBe(expectedState);

    return instance;
};

export const assertCreditNoteItems = async (creditNoteId: string, expectedCount: number) => {
    const items = await prisma.credit_note_item.findMany({
        where: { credit_note_id: creditNoteId }
    });

    expect(items.length).toBe(expectedCount);

    return items;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
    // Note: Location is part of seed data, so don't delete it
};

