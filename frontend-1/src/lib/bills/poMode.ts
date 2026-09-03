/** Purchase bill classification vs PO linkage (BP-3). */

export const BILL_INVOICE_TYPE = 'PURCHASE' as const;
export const SALES_INVOICE_TYPE = 'SALES' as const;

export type BillPoMode = 'With PO' | 'Without PO';

export const DEFAULT_BILL_PO_MODE: BillPoMode = 'Without PO';

export function isBillPoMode(value?: string | null): value is BillPoMode {
  return value === 'With PO' || value === 'Without PO';
}

/**
 * Resolve PO mode from a bill row.
 * Prefers `po_mode`; falls back to legacy invoice_type With/Without PO.
 */
export function resolvePoModeFromInvoice(inv?: {
  po_mode?: string | null;
  invoice_type?: string | null;
} | null): BillPoMode {
  if (isBillPoMode(inv?.po_mode)) return inv.po_mode;
  if (isBillPoMode(inv?.invoice_type)) return inv.invoice_type;
  return DEFAULT_BILL_PO_MODE;
}

/** Payload fields for create/update of purchase bills. */
export function billTypeAndPoMode(poMode: BillPoMode = DEFAULT_BILL_PO_MODE): {
  invoice_type: typeof BILL_INVOICE_TYPE;
  po_mode: BillPoMode;
} {
  return {
    invoice_type: BILL_INVOICE_TYPE,
    po_mode: poMode,
  };
}

/** Invoice type from a workflow list row (`invoices[0].invoice_type`). */
export function workflowItemInvoiceType(item: {
  invoices?: Array<{ invoice_type?: string | null }>;
} | null | undefined): string | null {
  return item?.invoices?.[0]?.invoice_type ?? null;
}

/** Purchase bills list — includes PURCHASE, legacy PO modes, and unset type. */
export function isPurchaseBillWorkflowItem(item: {
  invoices?: Array<{ invoice_type?: string | null }>;
}): boolean {
  return workflowItemInvoiceType(item) !== SALES_INVOICE_TYPE;
}
