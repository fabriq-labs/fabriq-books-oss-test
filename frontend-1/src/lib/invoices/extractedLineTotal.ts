/** Helpers for bill/invoice PDF extract preview and create payloads. */

export type ExtractedLineLike = {
  rate?: number | null;
  amount?: number | null;
  quantity?: number | null;
  invoice_qty?: number | null;
  ordered_quantity?: number | null;
  discount_rate?: number | null;
  discount_amount?: number | null;
  tax_rate?: number | null;
  line_tax_amount?: number | null;
  line_total?: number | null;
  invoiced_amount?: number | null;
};

export type ResolvedLineLike = {
  tax_rate?: number | null;
  line_tax_amount?: number | null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function getExtractedLineQuantity(
  item: ExtractedLineLike,
  isCharge = false,
): number {
  if (isCharge) return 1;
  const qty =
    item.invoice_qty ?? item.quantity ?? item.ordered_quantity ?? 0;
  return Number(qty) || 0;
}

export function getExtractedLineGross(
  item: ExtractedLineLike,
  isCharge = false,
): number {
  const qty = getExtractedLineQuantity(item, isCharge);
  const unit = isCharge
    ? Number(item.amount) || 0
    : Number(item.rate) || 0;
  return round2(qty * unit);
}

export function getExtractedLineDiscountAmount(item: ExtractedLineLike): number {
  const gross = getExtractedLineGross(item, false);
  const explicit = item.discount_amount;
  if (
    explicit != null &&
    Number.isFinite(Number(explicit)) &&
    Number(explicit) > 0
  ) {
    return round2(Number(explicit));
  }
  const rate = Number(item.discount_rate) || 0;
  if (rate > 0 && gross > 0) {
    return round2(gross * (rate / 100));
  }
  return 0;
}

export function getExtractedLineTaxAmount(
  item: ExtractedLineLike,
  resolved?: ResolvedLineLike | null,
  isCharge = false,
): number {
  const fromResolved = resolved?.line_tax_amount;
  if (fromResolved != null && Number.isFinite(Number(fromResolved))) {
    return round2(Number(fromResolved));
  }
  const fromItem = item.line_tax_amount;
  if (fromItem != null && Number.isFinite(Number(fromItem))) {
    return round2(Number(fromItem));
  }
  const gross = getExtractedLineGross(item, isCharge);
  const discount = isCharge ? 0 : getExtractedLineDiscountAmount(item);
  const taxable = round2(gross - discount);
  const taxRate = resolved?.tax_rate ?? item.tax_rate;
  if (taxRate != null && Number.isFinite(Number(taxRate)) && taxable > 0) {
    return round2(taxable * (Number(taxRate) / 100));
  }
  return 0;
}

/** Line total = (qty × rate − discount) + tax — matches calculate_invoice_total. */
export function getExtractedLineTotal(
  item: ExtractedLineLike,
  resolved?: ResolvedLineLike | null,
  isCharge = false,
): number {
  const gross = getExtractedLineGross(item, isCharge);
  const discount = isCharge ? 0 : getExtractedLineDiscountAmount(item);
  const taxable = round2(gross - discount);
  const tax = getExtractedLineTaxAmount(item, resolved, isCharge);
  return round2(taxable + tax);
}
