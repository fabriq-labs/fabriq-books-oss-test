/** Purchase bill classification vs PO linkage (BP-3). */

export const BILL_INVOICE_TYPE = 'PURCHASE' as const;

export type BillPoMode = 'With PO' | 'Without PO';

export const DEFAULT_BILL_PO_MODE: BillPoMode = 'Without PO';

export function isBillPoMode(value?: string | null): value is BillPoMode {
  return value === 'With PO' || value === 'Without PO';
}

export function resolvePoMode(opts?: {
  po_mode?: string | null;
  invoice_type?: string | null;
  withPO?: boolean;
}): BillPoMode {
  if (typeof opts?.withPO === 'boolean') {
    return opts.withPO ? 'With PO' : 'Without PO';
  }
  if (isBillPoMode(opts?.po_mode)) return opts.po_mode;
  if (isBillPoMode(opts?.invoice_type)) return opts.invoice_type;
  return DEFAULT_BILL_PO_MODE;
}

export function billTypeAndPoMode(poMode: BillPoMode = DEFAULT_BILL_PO_MODE): {
  invoice_type: typeof BILL_INVOICE_TYPE;
  po_mode: BillPoMode;
} {
  return {
    invoice_type: BILL_INVOICE_TYPE,
    po_mode: poMode,
  };
}
