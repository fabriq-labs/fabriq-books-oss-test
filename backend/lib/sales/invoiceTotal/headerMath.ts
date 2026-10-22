import { Decimal } from '@prisma/client/runtime/library';
import { money, toDecimal } from './decimalUtil';

export function computeHeaderTotals(input: {
  lineTaxables: Array<string | number | Decimal>;
  lineTaxes: Array<string | number | Decimal>;
  shipping_amount?: string | number | Decimal | null;
  adjustment_amount?: string | number | Decimal | null;
}): { net_amount: Decimal; tax_amount: Decimal; total_amount: Decimal } {
  let net = new Decimal(0);
  for (const t of input.lineTaxables) {
    net = net.plus(toDecimal(t));
  }
  let tax = new Decimal(0);
  for (const t of input.lineTaxes) {
    tax = tax.plus(toDecimal(t));
  }
  const shipping = toDecimal(input.shipping_amount);
  const adjustment = toDecimal(input.adjustment_amount);
  const net_amount = money(net);
  const tax_amount = money(tax);
  const total_amount = money(net_amount.plus(tax_amount).plus(shipping).plus(adjustment));
  return { net_amount, tax_amount, total_amount };
}
