import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { money } from '../invoiceTotal/decimalUtil';

type Tx = Prisma.TransactionClient;

function sumApplications(apps: Array<{ amount_applied: Decimal }>): Decimal {
  return money(apps.reduce((s, a) => s.plus(a.amount_applied), new Decimal(0)));
}

/**
 * Recompute invoice balance_amount from total minus posted payment and credit-note applications.
 * Draft/void parents do not settle the invoice.
 */
export async function recomputeInvoiceBalanceFromApplications(
  tx: Tx,
  invoiceId: string
): Promise<Decimal> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      total_amount: true,
      payment_receipt_applications: {
        select: {
          amount_applied: true,
          payment_receipt: { select: { status: true } },
        },
      },
      credit_note_applications: {
        select: {
          amount_applied: true,
          credit_note: { select: { status: true } },
        },
      },
    },
  });
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  const total = invoice.total_amount ?? new Decimal(0);
  const paymentApplied = sumApplications(
    invoice.payment_receipt_applications.filter((a) => a.payment_receipt?.status === 'posted')
  );
  const creditApplied = sumApplications(
    invoice.credit_note_applications.filter((a) => a.credit_note?.status === 'posted')
  );
  const balance_amount = money(total.minus(paymentApplied).minus(creditApplied));

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { balance_amount },
  });

  return balance_amount;
}

export async function calculate_payment_total(
  _context: unknown,
  _model: string,
  instanceId: string,
  _changeSet: string[],
  selectSet: unknown,
  tx: Tx,
  _created?: unknown
) {
  const receipt = await tx.payment_receipt.findUnique({
    where: { id: instanceId },
    include: { applications: true },
  });
  if (!receipt) {
    throw new Error(`Payment receipt not found: ${instanceId}`);
  }

  const applied = sumApplications(receipt.applications);
  const unapplied_amount = money(receipt.amount.minus(applied));
  if (unapplied_amount.lessThan(0)) {
    throw new Error('Applications exceed receipt amount');
  }

  await tx.payment_receipt.update({
    where: { id: instanceId },
    data: { unapplied_amount },
  });

  // Refresh invoice balances for every invoice this receipt touches (posted apps settle; void/draft release).
  const invoiceIds = new Set<string>();
  for (const app of receipt.applications) {
    if (app.invoice_id) {
      invoiceIds.add(app.invoice_id);
    }
  }
  for (const invoiceId of invoiceIds) {
    await recomputeInvoiceBalanceFromApplications(tx, invoiceId);
  }

  if (selectSet && typeof selectSet === 'object') {
    return tx.payment_receipt.findUnique({
      where: { id: instanceId },
      select: selectSet as Prisma.payment_receiptSelect,
    });
  }

  return tx.payment_receipt.findUnique({
    where: { id: instanceId },
    include: { applications: true },
  });
}
