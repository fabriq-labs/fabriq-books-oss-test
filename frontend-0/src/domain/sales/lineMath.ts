/** Client-side preview mirroring backend/lib/sales invoice line math (percent discount). */

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function computeLinePreview(line: {
  quantity?: string | number | null;
  unit_price?: string | number | null;
  discount_rate?: string | number | null;
  tax_rate?: string | number | null;
}): { taxable: number; discount_amount: number; tax_amount: number; line_total: number } {
  const qty = toNumber(line.quantity);
  const price = toNumber(line.unit_price);
  const rate = line.discount_rate == null || line.discount_rate === '' ? 0 : toNumber(line.discount_rate);
  const base = qty * price;
  const discount_amount = base * (rate / 100);
  const taxable = Math.max(0, base - discount_amount);
  const tax_rate = line.tax_rate == null || line.tax_rate === '' ? 0 : toNumber(line.tax_rate);
  const tax_amount = taxable * (tax_rate / 100);
  return {
    taxable,
    discount_amount,
    tax_amount,
    line_total: taxable + tax_amount,
  };
}

export function moneyLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
