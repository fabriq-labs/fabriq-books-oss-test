/**
 * Deterministic vendor-bill discount handling for PDF extract blobs.
 *
 * LLM transcribes printed line/header discounts; this module normalizes line
 * discount_* and allocates header discounts onto product lines only.
 * No Prisma header discount column — combined line discounts feed calculate_invoice_total.
 */

const RATE_EPS = 0.01;

export type DiscountLineItem = {
  rate?: number | null;
  invoice_qty?: number | null;
  quantity?: number | null;
  ordered_quantity?: number | null;
  discount_rate?: number | null;
  discount_amount?: number | null;
  item_type?: string | null;
  [key: string]: unknown;
};

export type DiscountInvoice = {
  discount_rate?: number | null;
  discount_amount?: number | null;
  /** Extract-blob flag only — not a Prisma field. */
  discount_allocated?: boolean | null;
  [key: string]: unknown;
};

export type DiscountExtractBlob = {
  invoice?: DiscountInvoice | null;
  line_items?: DiscountLineItem[] | null;
  charges?: unknown;
  context?: unknown;
  [key: string]: unknown;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function asFiniteNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ratesEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < RATE_EPS;
}

function lineQty(line: DiscountLineItem): number {
  const q = asFiniteNumber(line.invoice_qty) ?? asFiniteNumber(line.quantity) ?? asFiniteNumber(line.ordered_quantity);
  return q != null && q > 0 ? q : 0;
}

function lineRate(line: DiscountLineItem): number {
  const r = asFiniteNumber(line.rate);
  return r != null && r > 0 ? r : 0;
}

/** Gross list base: qty × rate (before any discount). */
export function lineGrossBase(line: DiscountLineItem): number {
  return round2(lineQty(line) * lineRate(line));
}

function isProductLine(line: DiscountLineItem): boolean {
  const t = String(line.item_type || '')
    .trim()
    .toLowerCase();
  return t !== 'charge';
}

/**
 * Fill missing discount_rate ↔ discount_amount from the other when gross > 0.
 * Returns the resolved dollar discount (0 if none).
 */
export function normalizeLineDiscount(line: DiscountLineItem): {
  discount_rate: number;
  discount_amount: number;
} {
  const gross = lineGrossBase(line);
  let rate = asFiniteNumber(line.discount_rate);
  let amount = asFiniteNumber(line.discount_amount);
  if (gross <= 0) {
    return {
      discount_rate: rate != null && rate > 0 ? rate : 0,
      discount_amount: amount != null && amount > 0 ? amount : 0,
    };
  }

  if ((rate == null || rate <= 0) && amount != null && amount > 0) {
    rate = (amount / gross) * 100;
    amount = round2(amount);
  } else if (rate != null && rate > 0) {
    amount = round2(gross * (rate / 100));
  } else {
    rate = 0;
    amount = 0;
  }

  return {
    discount_rate: rate ?? 0,
    discount_amount: amount ?? 0,
  };
}

function headerDiscountDollars(
  invoice: DiscountInvoice,
  remainingBases: number[],
): number {
  const amount = asFiniteNumber(invoice.discount_amount);
  if (amount != null && amount > 0) {
    return round2(amount);
  }
  const rate = asFiniteNumber(invoice.discount_rate);
  if (rate != null && rate > 0) {
    const sumRemaining = remainingBases.reduce((s, b) => s + b, 0);
    if (sumRemaining <= 0) return 0;
    return round2(sumRemaining * (rate / 100));
  }
  return 0;
}

function headerRateForLeakage(
  invoice: DiscountInvoice,
  productLines: DiscountLineItem[],
): number | null {
  const rate = asFiniteNumber(invoice.discount_rate);
  if (rate != null && rate > 0) return rate;

  const amount = asFiniteNumber(invoice.discount_amount);
  if (amount == null || amount <= 0) return null;

  const sumGross = productLines.reduce((s, line) => s + lineGrossBase(line), 0);
  if (sumGross <= 0) return null;
  return (amount / sumGross) * 100;
}

/**
 * If every product line carries the same % as the footer header discount,
 * treat line rates as LLM leakage of the footer and clear them before allocate.
 */
function clearLeakedLineDiscounts(
  invoice: DiscountInvoice,
  productLines: DiscountLineItem[],
): void {
  const hasHeader =
    (asFiniteNumber(invoice.discount_rate) ?? 0) > 0 ||
    (asFiniteNumber(invoice.discount_amount) ?? 0) > 0;
  if (!hasHeader) return;

  const headerRate = headerRateForLeakage(invoice, productLines);
  if (headerRate == null || headerRate <= 0) return;

  const withGross = productLines.filter((l) => lineGrossBase(l) > 0);
  if (withGross.length === 0) return;

  const allMatch = withGross.every((line) => {
    const { discount_rate } = normalizeLineDiscount(line);
    return discount_rate > 0 && ratesEqual(discount_rate, headerRate);
  });

  if (!allMatch) return;

  for (const line of withGross) {
    line.discount_rate = 0;
    line.discount_amount = 0;
  }
}

/**
 * Normalize line discounts and allocate header discount onto product lines.
 * Mutates a shallow clone of invoice + line_items; returns the same blob shape.
 * Idempotent when `invoice.discount_allocated === true`.
 */
export function applyHeaderDiscountToLines<T extends DiscountExtractBlob>(params: T): T {
  if (!params || typeof params !== 'object') return params;

  const invSrc = params.invoice && typeof params.invoice === 'object' ? params.invoice : {};
  if (invSrc.discount_allocated === true) {
    return params;
  }

  const rawLines = Array.isArray(params.line_items) ? params.line_items : [];
  const line_items = rawLines.map((l) => (l && typeof l === 'object' ? { ...l } : l));
  const invoice: DiscountInvoice = { ...invSrc };
  const productIndices: number[] = [];
  for (let i = 0; i < line_items.length; i++) {
    const line = line_items[i];
    if (line && typeof line === 'object' && isProductLine(line as DiscountLineItem)) {
      productIndices.push(i);
    }
  }
  const productLines = productIndices.map((i) => line_items[i] as DiscountLineItem);
  const hasAnyLineDiscount = productLines.some((line) => {
    const r = asFiniteNumber(line.discount_rate);
    const a = asFiniteNumber(line.discount_amount);
    return (r != null && r > 0) || (a != null && a > 0);
  });
  const hasHeaderDiscount =
    (asFiniteNumber(invoice.discount_rate) ?? 0) > 0 ||
    (asFiniteNumber(invoice.discount_amount) ?? 0) > 0;
  if (!hasAnyLineDiscount && !hasHeaderDiscount) {
    return params;
  }

  clearLeakedLineDiscounts(invoice, productLines);

  // Normalize line-only pairs first (after leakage clear).
  const remainingBases: number[] = [];
  for (const line of productLines) {
    const { discount_rate, discount_amount } = normalizeLineDiscount(line);
    line.discount_rate = discount_rate;
    line.discount_amount = discount_amount;
    const gross = lineGrossBase(line);
    remainingBases.push(round2(Math.max(0, gross - discount_amount)));
  }
 
  const headerDollars = headerDiscountDollars(invoice, remainingBases);
  const totalRemaining = remainingBases.reduce((s, b) => s + b, 0);
 
  if (headerDollars > 0 && totalRemaining > 0 && productLines.length > 0) {
    let allocated = 0;
    const lastIdx = productLines.length - 1;

    for (let i = 0; i < productLines.length; i++) {
      const line = productLines[i];
      const gross = lineGrossBase(line);
      const lineDisc = asFiniteNumber(line.discount_amount) ?? 0;
      const base = remainingBases[i];

      let share = 0;
      if (i < lastIdx) {
        share = base > 0 ? round2(headerDollars * (base / totalRemaining)) : 0;
        allocated = round2(allocated + share);
      } else {
        share = round2(headerDollars - allocated);
        if (share < 0) share = 0;
      }

      const combinedAmount = round2(lineDisc + share);
     
      const combinedRate = gross > 0 ? (combinedAmount / gross) * 100 : 0;
      
      line.discount_amount = combinedAmount;
      line.discount_rate = combinedRate;
    }
  }

  invoice.discount_allocated = true;

  return {
    ...params,
    invoice,
    line_items,
  };
}
