import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computeHeaderTotals } from './headerMath';
import { computeLineAmounts } from './lineMath';
import { computeLineTax } from './taxMath';
import { money } from './decimalUtil';

type Tx = Prisma.TransactionClient;

const invoiceInclude = {
  line_items: {
    orderBy: { line_number: 'asc' as const },
    include: { line_taxes: true },
  },
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
};

function sumApplied(
  apps: Array<{ amount_applied: Decimal }> | undefined
): Decimal {
  if (!apps?.length) return new Decimal(0);
  return money(apps.reduce((s, a) => s.plus(a.amount_applied), new Decimal(0)));
}

export async function calculate_invoice_total(
  _context: unknown,
  _model: string,
  instanceId: string,
  _changeSet: string[],
  selectSet: unknown,
  tx: Tx,
  _created?: unknown
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: instanceId },
    include: invoiceInclude,
  });
  if (!invoice) {
    throw new Error(`Invoice not found: ${instanceId}`);
  }

  const lineTaxables: Decimal[] = [];
  const lineTaxTotals: Decimal[] = [];

  for (const line of invoice.line_items) {
    const { discount_amount, taxable } = computeLineAmounts({
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_rate: line.discount_rate,
    });

    let lineTaxTotal = new Decimal(0);

    if (line.tax_group_id) {
      const components = await tx.tax_group_component.findMany({
        where: { tax_group_id: line.tax_group_id },
        orderBy: { sequence: 'asc' },
        include: { tax_master: true },
      });

      const { taxRows, taxTotal } = computeLineTax({
        taxable,
        components: components.map((c) => ({
          tax_master_id: c.tax_master_id,
          rate: c.tax_master.rate,
          component_type: c.tax_master.component_type,
        })),
      });
      lineTaxTotal = taxTotal;

      await tx.invoice_line_tax.deleteMany({
        where: { invoice_line_item_id: line.id },
      });

      for (const row of taxRows) {
        await tx.invoice_line_tax.create({
          data: {
            org_id: line.org_id,
            invoice_line_item_id: line.id,
            tax_master_id: row.tax_master_id,
            tax_group_id: line.tax_group_id,
            rate: row.rate,
            amount: row.amount,
            component_type: row.component_type ?? null,
          },
        });
      }
    } else if (line.line_taxes.length === 1 && line.line_taxes[0].rate != null) {
      const existing = line.line_taxes[0];
      const amount = money(taxable.mul(existing.rate!.div(100)));
      lineTaxTotal = amount;
      await tx.invoice_line_tax.update({
        where: { id: existing.id },
        data: { amount },
      });
    } else {
      await tx.invoice_line_tax.deleteMany({
        where: { invoice_line_item_id: line.id },
      });
      lineTaxTotal = new Decimal(0);
    }

    await tx.invoice_line_item.update({
      where: { id: line.id },
      data: {
        discount_amount,
        amount: taxable,
      },
    });

    lineTaxables.push(taxable);
    lineTaxTotals.push(lineTaxTotal);
  }

  const { net_amount, tax_amount, total_amount } = computeHeaderTotals({
    lineTaxables,
    lineTaxes: lineTaxTotals,
    shipping_amount: invoice.shipping_amount,
    adjustment_amount: invoice.adjustment_amount,
  });

  const appliedPayments = sumApplied(invoice.payment_receipt_applications);
  const appliedCredits = sumApplied(invoice.credit_note_applications);
  const balance_amount = money(total_amount.minus(appliedPayments).minus(appliedCredits));

  await tx.invoice.update({
    where: { id: instanceId },
    data: {
      net_amount,
      tax_amount,
      total_amount,
      balance_amount,
    },
  });

  if (selectSet && typeof selectSet === 'object') {
    return tx.invoice.findUnique({
      where: { id: instanceId },
      select: selectSet as Prisma.invoiceSelect,
    });
  }

  return tx.invoice.findUnique({
    where: { id: instanceId },
    include: invoiceInclude,
  });
}
