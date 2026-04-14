import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for payment receipt tests
export const getInvoiceSelectSet = () => ({
    id: true,
    coa: true,
    name: true,
    status: true,
    bill_to: true,
    location: {
        select: {
            id: true,
            city: true,
            state: true,
            address: true,
            country: true,
            website: true,
            location: true,
            zip_code: true
        }
    },
    remit_to: true,
    customers: {
        select: {
            id: true,
            city: true,
            state: true,
            country: true,
            zip_code: true,
            customer_name: true,
            primary_email: true,
            primary_phone: true,
            payment_term_id: true,
            customer_address: true,
            preferred_currency_id: true
        }
    },
    misc_cost: true,
    po_number: true,
    tax_total: true,
    ap_comment: true,
    deliver_to: true,
    customer_id: true,
    location_id: true,
    invoice_date: true,
    invoice_type: true,
    invoice_total: true,
    payment_terms: true,
    shipping_cost: true,
    supplier_name: true,
    additional_tax: true,
    balance_amount: true,
    invoice_number: true,
    invoice_status: true,
    purchase_order: {
        select: {
            id: true,
            status: true,
            comment: true,
            pr_date: true,
            pr_total: true,
            po_number: true,
            pr_number: true,
            requester: true,
            deliver_to: true,
            location_id: true,
            purchase_id: true,
            supplier_id: true,
            total_price: true,
            need_by_date: true,
            delivery_address: true,
            chart_of_accounts: true,
            requester_department: true
        }
    },
    requester_name: true,
    shipping_terms: true,
    wf_instance_id: true,
    invoice_version: true,
    payment_receipt: {
        select: {
            id: true,
            notes: true,
            amount: true,
            status: true,
            account_id: true,
            invoice_id: true,
            base_amount: true,
            currency_id: true,
            payment_type: true,
            receipt_date: true,
            exchange_rate: true,
            payment_method: true,
            receipt_number: true,
            payment_reference: true
        }
    },
    requester_email: true,
    shipping_method: true,
    tax_on_handling: true,
    tax_on_shipping: true,
    supplier_remarks: true,
    invoice_line_item: {
        select: {
            id: true,
            rate: true,
            tax_rate: true,
            tax_type: true,
            created_at: true,
            line_total: true,
            instance_id: true,
            invoice_qty: true,
            item_number: true,
            item_master_id: true,
            ordered_amount: true,
            invoiced_amount: true,
            line_tax_amount: true,
            ordered_quantity: true,
            purchase_order_item_id: true,
            purchase_requisition_id: true
        }
    },
    invoice_net_total: true,
    purchase_order_id: true,
    purchase_order_item: {
        select: {
            id: true,
            rate: true,
            quantity: true,
            item_type: true,
            created_at: true,
            instance_id: true,
            invoice_qty: true,
            supplier_id: true,
            ordered_amount: true,
            ordered_quantity: true,
            purchase_requisition_id: true
        }
    },
    terms_and_conditions: true,
    purchase_order_item_id: true,
    shipping_handling_misc_total: true
});

export const createInvoiceData = (customerId: string, locationId: string, orgId: string, userId: string) => ({
    invoice_number: `INV-TEST-${Date.now()}`,
    invoice_date: new Date(),
    invoice_version: 1,
    invoice_status: 'Draft',
    invoice_type: 'SALES',
    customer_id: customerId,
    location_id: locationId,
    invoice_net_total: 1000.00, // Hardcoded test data
    invoice_total: 1000.00, // Hardcoded test data
    balance_amount: 1000.00, // Initial balance equals total
    payment_terms: 'Net 30',
    shipping_method: 'Standard',
    shipping_terms: 'FOB',
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
    status: '9', // Draft status
});

export const createPaymentReceiptData = (
    invoiceId: string,
    customerId: string,
    orgId: string,
    userId: string,
    amount: number = 500.00,
    paymentType: 'FULL' | 'PARTIAL' | 'ADVANCE' = 'PARTIAL'
) => ({
    receipt_number: `RECEIPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    receipt_date: new Date(),
    invoice_id: invoiceId, // Direct reference to invoice
    customer_id: customerId,
    amount: amount,
    payment_method: 'Bank Transfer',
    payment_type: paymentType,
    payment_reference: `REF-${Date.now()}`,
    notes: `Test payment receipt for invoice ${invoiceId}`,
    exchange_rate: 1.00,
    base_amount: amount, // Same as amount when exchange_rate is 1.00
    status: 'Completed',
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
});


export const createTestContext = (userId: string = 'user_kavya_nair', orgId: string = 'org_indian_demo'): AuthContext => ({
    user: {
        id: userId,
        org_id: orgId,
        email: 'kavya.nair@demo-india.com',
        name: 'Kavya Nair'
    },
    permissions: {
        payment_receipt: {
            '*': 'write' as const  // Give full write access to payment_receipt
        },
        invoice: {
            '*': 'write' as const  // Give full write access to invoice
        }
    },
});

// Helper functions
export const assertPaymentReceiptCreated = async (paymentReceiptId: string) => {
    const paymentReceipt = await prisma.payment_receipt.findUnique({
        where: { id: paymentReceiptId },
        include: {
            invoice: true,
            customers: true,
            currency: true,
        }
    });

    expect(paymentReceipt).toBeDefined();
    expect(paymentReceipt?.id).toBe(paymentReceiptId);

    return paymentReceipt;
};

export const assertInvoiceBalanceUpdated = async (invoiceId: string, expectedBalance: number) => {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
            payment_receipt: true,
        }
    });

    expect(invoice).toBeDefined();
    expect(Number(invoice?.balance_amount)).toBeCloseTo(expectedBalance, 2);

    return invoice;
};

export const calculateTotalPayments = (paymentReceipts: any[]): number => {
    return paymentReceipts.reduce((sum, receipt) => {
        return sum + (Number(receipt.amount) || 0);
    }, 0);
};

export const calculateRemainingBalance = (invoiceTotal: number, totalPayments: number): number => {
    return parseFloat((invoiceTotal - totalPayments).toFixed(2));
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
    console.log('\n🧹 Cleaning up test data...');

    try {
        // Delete payment receipts first (foreign key constraint)
        await prisma.payment_receipt.deleteMany({
            where: { org_id: orgId }
        });

        // Delete test invoices (only those created by tests)
        await prisma.invoice.deleteMany({
            where: {
                org_id: orgId,
                invoice_number: { startsWith: 'INV-TEST-' }
            }
        });

        console.log('✓ Test data cleaned up');
    } catch (error) {
        console.error('Error cleaning up test data:', error);
    }
};

