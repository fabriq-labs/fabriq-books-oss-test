import { Decimal } from '@prisma/client/runtime/library';
import { money, toDecimal } from './decimalUtil';

export type TaxComponentInput = {
  tax_master_id: string;
  rate: string | number | Decimal;
  component_type?: string | null;
};

export type TaxRow = {
  tax_master_id: string;
  rate: Decimal;
  amount: Decimal;
  component_type?: string | null;
};

export type LineTaxResult = {
  taxRows: TaxRow[];
  taxTotal: Decimal;
};

/**
 * tax_master.rate and line tax rates are stored as **percent** (e.g. 18 = 18%).
 * Component tax amount = taxable × (rate / 100).
 */
export function computeLineTax(input: {
  taxable: string | number | Decimal;
  components: TaxComponentInput[];
}): LineTaxResult {
  const taxable = toDecimal(input.taxable);
  const taxRows: TaxRow[] = [];
  let taxTotal = new Decimal(0);

  for (const component of input.components) {
    const rate = toDecimal(component.rate);
    const amount = money(taxable.mul(rate.div(100)));
    taxRows.push({
      tax_master_id: component.tax_master_id,
      rate,
      amount,
      component_type: component.component_type ?? undefined,
    });
    taxTotal = taxTotal.plus(amount);
  }

  return { taxRows, taxTotal: money(taxTotal) };
}

/** Single ad-hoc percent row (no tax_master); for in-memory totals only. */
export function computeManualTax(input: {
  taxable: string | number | Decimal;
  ratePercent: string | number | Decimal;
}): { tax_master_id: null; rate: Decimal; amount: Decimal; taxTotal: Decimal } {
  const taxable = toDecimal(input.taxable);
  const rate = toDecimal(input.ratePercent);
  const amount = money(taxable.mul(rate.div(100)));
  return {
    tax_master_id: null,
    rate,
    amount,
    taxTotal: amount,
  };
}
