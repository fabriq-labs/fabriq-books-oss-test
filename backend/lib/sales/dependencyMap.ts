import type { Prisma } from '@prisma/client';
import type { DomainActionBinding } from '../domain';
import { calculate_credit_note_total } from './creditNoteTotal/calculateCreditNoteTotal';
import { calculate_invoice_total } from './invoiceTotal/calculateInvoiceTotal';
import { calculate_payment_total } from './paymentTotal/calculatePaymentTotal';

export type DomainAction = (
  context: unknown,
  model: string,
  instanceId: string,
  changeSet: string[],
  selectSet: unknown,
  tx: Prisma.TransactionClient,
  created?: unknown
) => Promise<unknown>;

export type DependencyDecl = {
  run: DomainAction;
  parent: { model: string; fields: string[] };
  children: Array<{ relation: string; fields: string[] }>;
};

export const salesDependencies: DependencyDecl[] = [
  {
    run: calculate_invoice_total,
    parent: {
      model: 'invoice',
      fields: ['shipping_amount', 'adjustment_amount'],
    },
    children: [
      {
        relation: 'line_items',
        fields: ['quantity', 'unit_price', 'discount_rate', 'discount_amount', 'tax_group_id'],
      },
    ],
  },
  {
    run: calculate_payment_total,
    parent: {
      model: 'payment_receipt',
      fields: ['amount', 'status'],
    },
    children: [
      {
        relation: 'applications',
        fields: ['amount_applied'],
      },
    ],
  },
  {
    run: calculate_credit_note_total,
    parent: {
      model: 'credit_note',
      fields: ['status'],
    },
    children: [
      {
        relation: 'line_items',
        fields: ['quantity', 'unit_price', 'discount_rate', 'discount_amount', 'tax_group_id'],
      },
      {
        relation: 'applications',
        fields: ['amount_applied'],
      },
    ],
  },
];

export function toFunctionMap(decls: DependencyDecl[]): Record<string, DomainActionBinding> {
  const map: Record<string, DomainActionBinding> = {};
  for (const d of decls) {
    map[d.parent.model] = { fields: d.parent.fields, method: d.run };
    for (const c of d.children) {
      map[`${d.parent.model}.${c.relation}`] = { fields: c.fields, method: d.run };
    }
  }
  return map;
}
