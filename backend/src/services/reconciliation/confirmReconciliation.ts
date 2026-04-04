/**
 * Confirm reconciliation: create payment receipt (when match is invoice) or link posting to existing receipt.
 * Sets posting.payment_receipt_id, optionally payment_receipt.posting_id, and posting.reconciliation_status = MATCHED.
 */

import prisma from '../../lib/prisma';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
export interface ConfirmReconciliationResult {
  posting: {
    id: string;
    reconciliation_status: string | null;
    matched_reference: string | null;
    payment_receipt_id: string | null;
    payment_receipt?: {
      id: string;
      receipt_number: string | null;
      amount: number | null;
      receipt_date: Date | null;
      invoice_id: string | null;
      invoice?: {
        id: string;
        invoice_number: string | null;
        invoice_total: number | null;
        invoice_date: Date | null;
        customers?: { id: string; customer_name: string } | null;
      } | null;
    } | null;
  };
}

/**
 * Parse matched_reference string. Format: "type:id:reference" e.g. "payment_receipt:payr_xxx:REC-001"
 */
function parseMatchedReference(ref: string | null): { type: 'invoice' | 'payment_receipt'; id: string } | null {
  if (!ref || typeof ref !== 'string') return null;
  const parts = ref.split(':');
  if (parts.length < 2) return null;
  const type = parts[0] as 'invoice' | 'payment_receipt';
  if (type !== 'invoice' && type !== 'payment_receipt') return null;
  return { type, id: parts[1] };
}

/**
 * Generate a unique receipt_number for the org (simple timestamp-based for uniqueness).
 */
function generateReceiptNumber(): string {
  return `REC-${Date.now()}`;
}

/**
 * Confirm reconciliation for a single posting: create receipt (if match is invoice) or link to existing receipt.
 */
export async function confirmReconciliation(
  postingId: string,
  auth: AuthContext
): Promise<ConfirmReconciliationResult> {
  const orgId = auth.user?.org_id;
  if (!orgId) {
    throw new Error('Unauthorized: missing org_id');
  }

  const posting = await prisma.posting.findFirst({
    where: { id: postingId, org_id: orgId },
    include: {
      account: { select: { id: true, name: true } },
      credit_account: { select: { id: true, name: true } },
    },
  });

  if (!posting) {
    throw new Error(`Posting ${postingId} not found`);
  }

  const parsed = parseMatchedReference(posting.matched_reference);
  if (!parsed) {
    throw new Error('Posting has no valid matched_reference to confirm');
  }

  // Idempotent: if already linked and MATCHED, return current state
  if (posting.reconciliation_status === 'MATCHED' && posting.payment_receipt_id) {
    const existing = await prisma.posting.findUnique({
      where: { id: postingId },
      select: {
        id: true,
        reconciliation_status: true,
        matched_reference: true,
        payment_receipt_id: true,
        payment_receipt: {
          select: {
            id: true,
            receipt_number: true,
            amount: true,
            receipt_date: true,
            invoice_id: true,
            invoice: {
              select: {
                id: true,
                invoice_number: true,
                invoice_total: true,
                invoice_date: true,
                customers: { select: { id: true, customer_name: true } },
              },
            },
          },
        },
      },
    });
    return { posting: existing as ConfirmReconciliationResult['posting'] };
  }

  const amount = posting.amount != null ? Number(posting.amount) : 0;
  const valueDate = posting.value_date ?? new Date();
  const bankAccountId = posting.credit_account_id || posting.account_id; // Incoming: credit to bank

  if (parsed.type === 'invoice') {
    const invoice = await prisma.invoice.findFirst({
      where: { id: parsed.id, org_id: orgId },
      include: { customers: { select: { id: true, customer_name: true } } },
    });
    if (!invoice) {
      throw new Error(`Invoice ${parsed.id} not found`);
    }

    const receiptNumber = generateReceiptNumber();
    const newReceipt = await prisma.payment_receipt.create({
      data: {
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        amount,
        receipt_date: valueDate,
        account_id: bankAccountId,
        org_id: orgId,
        receipt_number: receiptNumber,
        payment_type: 'FULL',
        status: 'COMPLETED',
      },
    });

    await prisma.posting.update({
      where: { id: postingId },
      data: {
        payment_receipt_id: newReceipt.id,
        reconciliation_status: 'MATCHED',
      },
    });

    logger.info('[confirmReconciliation] Created payment receipt and linked posting', {
      postingId,
      receiptId: newReceipt.id,
      invoiceId: invoice.id,
    });

    const updated = await prisma.posting.findUnique({
      where: { id: postingId },
      select: {
        id: true,
        reconciliation_status: true,
        matched_reference: true,
        payment_receipt_id: true,
        payment_receipt: {
          select: {
            id: true,
            receipt_number: true,
            amount: true,
            receipt_date: true,
            invoice_id: true,
            invoice: {
              select: {
                id: true,
                invoice_number: true,
                invoice_total: true,
                invoice_date: true,
                customers: { select: { id: true, customer_name: true } },
              },
            },
          },
        },
      },
    });
    return { posting: updated as ConfirmReconciliationResult['posting'] };
  }

  // type === 'payment_receipt'
  const receipt = await prisma.payment_receipt.findFirst({
    where: { id: parsed.id, org_id: orgId },
  });
  if (!receipt) {
    throw new Error(`Payment receipt ${parsed.id} not found`);
  }

  await prisma.posting.update({
    where: { id: postingId },
    data: { payment_receipt_id: receipt.id, reconciliation_status: 'MATCHED' },
  });

  logger.info('[confirmReconciliation] Linked posting to existing receipt', {
    postingId,
    receiptId: receipt.id,
  });

  const updated = await prisma.posting.findUnique({
    where: { id: postingId },
    select: {
      id: true,
      reconciliation_status: true,
      matched_reference: true,
      payment_receipt_id: true,
      payment_receipt: {
        select: {
          id: true,
          receipt_number: true,
          amount: true,
          receipt_date: true,
          invoice_id: true,
          invoice: {
            select: {
              id: true,
              invoice_number: true,
              invoice_total: true,
              invoice_date: true,
              customers: { select: { id: true, customer_name: true } },
            },
          },
        },
      },
    },
  });
  return { posting: updated as ConfirmReconciliationResult['posting'] };
}
