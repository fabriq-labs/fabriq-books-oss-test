import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computeHeaderTotals } from '../invoiceTotal/headerMath';
import { computeLineAmounts } from '../invoiceTotal/lineMath';
import { computeLineTax } from '../invoiceTotal/taxMath';
import { money } from '../invoiceTotal/decimalUtil';
import { recomputeInvoiceBalanceFromApplications } from '../paymentTotal/calculatePaymentTotal';

type Tx = Prisma.TransactionClient;

const creditInclude = {
  line_items: {
    orderBy: { line_number: 'asc' as const },
    include: { line_taxes: true },
  },
  applications: { select: { amount_applied: true } },
  receipt_applications: { select: { amount_applied: true } },
};

function sumApplied(apps: Array<{ amount_applied: Decimal }> | undefined): Decimal {
  if (!apps?.length) return new Decimal(0);
  return money(apps.reduce((s, a) => s.plus(a.amount_applied), new Decimal(0)));
}

export async function calculate_credit_note_total(
  _context: unknown,
  _model: string,
  instanceId: string,
  _changeSet: string[],
  selectSet: unknown,
  tx: Tx,
  _created?: unknown
) {
  const creditNote = await tx.credit_note.findUnique({
    where: { id: instanceId },
    include: creditInclude,
  });
  if (!creditNote) {
    throw new Error(`Credit note not found: ${instanceId}`);
  }

  const lineTaxables: Decimal[] = [];
  const lineTaxTotals: Decimal[] = [];

  for (const line of creditNote.line_items) {
    const { discount_amount, taxable } = computeLineAmounts({
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_rate: line.discount_rate,
    });

    let lineTaxTotal = new Decimal(0);
    let taxRateToStore: Decimal | null = line.tax_rate != null ? new Decimal(line.tax_rate) : null;

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
      taxRateToStore = money(
        components.reduce((s, c) => s.plus(c.tax_master.rate ?? 0), new Decimal(0))
      );

      await tx.credit_note_line_tax.deleteMany({
        where: { credit_note_item_id: line.id },
      });

      for (const row of taxRows) {
        await tx.credit_note_line_tax.create({
          data: {
            org_id: line.org_id,
            credit_note_item_id: line.id,
            tax_master_id: row.tax_master_id,
            tax_group_id: line.tax_group_id,
            rate: row.rate,
            amount: row.amount,
            component_type: row.component_type ?? null,
          },
        });
      }
    } else if (line.tax_rate != null && !new Decimal(line.tax_rate).isZero()) {
      const rate = new Decimal(line.tax_rate);
      const amount = money(taxable.mul(rate.div(100)));
      lineTaxTotal = amount;
      taxRateToStore = rate;

      await tx.credit_note_line_tax.deleteMany({
        where: { credit_note_item_id: line.id },
      });

      const taxMaster =
        (await tx.tax_master.findFirst({
          where: { org_id: line.org_id, is_active: true },
          orderBy: { code: 'asc' },
        })) ??
        (await tx.tax_master.findFirst({
          where: { org_id: line.org_id },
          orderBy: { code: 'asc' },
        }));

      if (taxMaster) {
        await tx.credit_note_line_tax.create({
          data: {
            org_id: line.org_id,
            credit_note_item_id: line.id,
            tax_master_id: taxMaster.id,
            tax_group_id: null,
            rate,
            amount,
            component_type: taxMaster.component_type ?? 'manual',
          },
        });
      }
    } else if (line.line_taxes.length === 1 && line.line_taxes[0].rate != null) {
      const existing = line.line_taxes[0];
      const amount = money(taxable.mul(existing.rate!.div(100)));
      lineTaxTotal = amount;
      taxRateToStore = new Decimal(existing.rate!);
      await tx.credit_note_line_tax.update({
        where: { id: existing.id },
        data: { amount },
      });
    } else {
      await tx.credit_note_line_tax.deleteMany({
        where: { credit_note_item_id: line.id },
      });
      lineTaxTotal = new Decimal(0);
      taxRateToStore = null;
    }

    await tx.credit_note_item.update({
      where: { id: line.id },
      data: {
        discount_amount,
        amount: taxable,
        tax_rate: taxRateToStore,
      },
    });

    lineTaxables.push(taxable);
    lineTaxTotals.push(lineTaxTotal);
  }

  const { net_amount, tax_amount, total_amount } = computeHeaderTotals({
    lineTaxables,
    lineTaxes: lineTaxTotals,
  });

  const appliedToInvoices = sumApplied(creditNote.applications);
  const appliedViaReceipts = sumApplied(creditNote.receipt_applications);
  const balance_amount = money(total_amount.minus(appliedToInvoices).minus(appliedViaReceipts));

  await tx.credit_note.update({
    where: { id: instanceId },
    data: {
      net_amount,
      tax_amount,
      total_amount,
      balance_amount,
    },
  });

  // Refresh invoice balances for every invoice this credit touches (posted apps settle; void/draft release).
  const appsWithInvoice = await tx.credit_note_application.findMany({
    where: { credit_note_id: instanceId },
    select: { invoice_id: true },
  });
  const invoiceIds = new Set(
    appsWithInvoice.map((app) => app.invoice_id).filter(Boolean) as string[]
  );
  for (const invoiceId of invoiceIds) {
    await recomputeInvoiceBalanceFromApplications(tx, invoiceId);
  }

  if (selectSet && typeof selectSet === 'object') {
    return tx.credit_note.findUnique({
      where: { id: instanceId },
      select: selectSet as Prisma.credit_noteSelect,
    });
  }

  return tx.credit_note.findUnique({
    where: { id: instanceId },
    include: creditInclude,
  });
}
