import { Decimal } from '@prisma/client/runtime/library';
import { money, toDecimal } from './decimalUtil';

export type LineAmountInputs = {
  quantity: string | number | Decimal | null | undefined;
  unit_price: string | number | Decimal | null | undefined;
  discount_rate: string | number | Decimal | null | undefined;
};

export type LineAmounts = {
  base: Decimal;
  discount_amount: Decimal;
  taxable: Decimal;
};

/**
 * Per-line amounts before tax.
 * discount_rate is stored as percent 0–100; discount_amount = base × (rate / 100).
 * Line `amount` persisted elsewhere equals taxable (ex-tax).
 */
export function computeLineAmounts(input: LineAmountInputs): LineAmounts {
  const quantity = toDecimal(input.quantity);
  const unit_price = toDecimal(input.unit_price);
  const base = money(quantity.mul(unit_price));

  let discount_amount = new Decimal(0);
  const rate = input.discount_rate;
  if (rate !== null && rate !== undefined && rate !== '') {
    discount_amount = money(base.mul(toDecimal(rate).div(100)));
  }

  const taxableRaw = base.minus(discount_amount);
  const taxable = money(Decimal.max(0, taxableRaw));

  return { base, discount_amount, taxable };
}
