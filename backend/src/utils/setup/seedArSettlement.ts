/**
 * Idempotent seed for AR settlement Master views (receipts + credit notes).
 *
 *   cd backend && npm run seed:ar-settlement
 */
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

const ORG_SYSTEM = 'org_system';
const ROLE_ID = 'role_kernel_super_admin';

const customerSelect = {
  type: 'customer',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'customer',
  searchParams: 'name',
  instanceLabel: 'name',
};

const currencySelect = {
  type: 'currency',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'currency',
  searchParams: 'code',
  instanceLabel: 'code',
  instanceSubLabel: 'name',
};

const entitySelect = {
  type: 'entity',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'entity',
  searchParams: 'name',
  instanceLabel: 'name',
};

const accountSelect = {
  type: 'account',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'account',
  searchParams: 'name',
  instanceLabel: 'name',
  instanceSubLabel: 'code',
};

const VIEWS: Array<{
  id: string;
  name: string;
  model: string;
  description: string;
  data_graph: Prisma.InputJsonValue;
}> = [
  {
    id: 'view_sales_payment_receipt',
    name: 'payment_receipt_view',
    model: 'payment_receipt',
    description: 'Payments received',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      number: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Number',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '140', columnType: 'text' },
      },
      receipt_date: {
        dataType: 'date',
        permission: 'update',
        displayName: 'Date',
        isColumnShow: true,
        tableProps: { width: '130', columnType: 'date' },
      },
      status: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Status',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      customer: {
        type: 'table',
        datatype: 'table',
        displayName: 'Customer',
        isColumnShow: true,
        select: { id: 'read', name: 'read', email: 'read' },
      },
      customer_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Customer',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...customerSelect, instanceSourceKey: 'customer_id' },
        },
      },
      amount: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Amount',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'decimal' },
      },
      unapplied_amount: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Unapplied',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'decimal' },
      },
      payment_method: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Method',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      payment_reference: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Reference',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'text' },
      },
      currency: {
        type: 'table',
        datatype: 'table',
        displayName: 'Currency',
        isColumnShow: true,
        select: { id: 'read', code: 'read', name: 'read' },
      },
      currency_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Currency',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...currencySelect, instanceSourceKey: 'currency_id' },
        },
      },
      account: {
        type: 'table',
        datatype: 'table',
        displayName: 'Deposit to',
        isColumnShow: true,
        select: { id: 'read', name: 'read', code: 'read' },
      },
      account_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Deposit to',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...accountSelect, instanceSourceKey: 'account_id' },
        },
      },
      entity: {
        type: 'table',
        datatype: 'table',
        displayName: 'Entity',
        isColumnShow: false,
        select: { id: 'read', name: 'read' },
      },
      entity_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Entity',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...entitySelect, instanceSourceKey: 'entity_id' },
        },
      },
      notes: { dataType: 'string', permission: 'update', displayName: 'Notes', isColumnShow: false },
      source_system_id: {
        dataType: 'string',
        permission: 'read',
        displayName: 'Source',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      source_record_id: { dataType: 'string', permission: 'read', displayName: 'Source id', isColumnShow: false },
      applications: {
        type: 'table',
        datatype: 'table',
        displayName: 'Applied to',
        isColumnShow: false,
        select: {
          id: 'read',
          target_type: 'read',
          amount_applied: 'read',
          applied_date: 'read',
          invoice: {
            type: 'table',
            select: { id: 'read', number: 'read' },
          },
          credit_note: {
            type: 'table',
            select: { id: 'read', number: 'read' },
          },
        },
      },
    },
  },
  {
    id: 'view_sales_credit_note',
    name: 'credit_note_view',
    model: 'credit_note',
    description: 'Credit notes',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      number: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Number',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '140', columnType: 'text' },
      },
      credit_note_date: {
        dataType: 'date',
        permission: 'update',
        displayName: 'Date',
        isColumnShow: true,
        tableProps: { width: '130', columnType: 'date' },
      },
      status: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Status',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      customer: {
        type: 'table',
        datatype: 'table',
        displayName: 'Customer',
        isColumnShow: true,
        select: { id: 'read', name: 'read', email: 'read' },
      },
      customer_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Customer',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...customerSelect, instanceSourceKey: 'customer_id' },
        },
      },
      net_amount: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Net',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'decimal' },
      },
      tax_amount: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Tax',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'decimal' },
      },
      total_amount: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Total',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'decimal' },
      },
      balance_amount: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Balance',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'decimal' },
      },
      currency: {
        type: 'table',
        datatype: 'table',
        displayName: 'Currency',
        isColumnShow: true,
        select: { id: 'read', code: 'read', name: 'read' },
      },
      currency_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Currency',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...currencySelect, instanceSourceKey: 'currency_id' },
        },
      },
      entity: {
        type: 'table',
        datatype: 'table',
        displayName: 'Entity',
        isColumnShow: false,
        select: { id: 'read', name: 'read' },
      },
      entity_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Entity',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...entitySelect, instanceSourceKey: 'entity_id' },
        },
      },
      notes: { dataType: 'string', permission: 'update', displayName: 'Notes', isColumnShow: false },
      reason: { dataType: 'string', permission: 'update', displayName: 'Reason', isColumnShow: false },
      source_system_id: {
        dataType: 'string',
        permission: 'read',
        displayName: 'Source',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      source_record_id: { dataType: 'string', permission: 'read', displayName: 'Source id', isColumnShow: false },
      line_items: {
        type: 'table',
        datatype: 'table',
        displayName: 'Line items',
        isColumnShow: false,
        select: {
          id: 'read',
          line_number: 'read',
          description: 'read',
          quantity: 'read',
          unit_price: 'read',
          amount: 'read',
          item_master: {
            type: 'table',
            select: { id: 'read', name: 'read', code: 'read' },
          },
        },
      },
      receipt_applications: {
        type: 'table',
        datatype: 'table',
        displayName: 'Applied via payments',
        isColumnShow: false,
        select: {
          id: 'read',
          amount_applied: 'read',
          applied_date: 'read',
          payment_receipt: {
            type: 'table',
            select: { id: 'read', number: 'read' },
          },
        },
      },
    },
  },
];

async function upsertView(view: (typeof VIEWS)[number]) {
  const existing = await prisma.view.findFirst({
    where: { name: view.name, model_name: view.model, org_id: ORG_SYSTEM },
  });
  const id = existing?.id ?? view.id;
  await prisma.view.upsert({
    where: { id },
    update: {
      name: view.name,
      model_name: view.model,
      description: view.description,
      org_id: ORG_SYSTEM,
      data_graph: view.data_graph,
    },
    create: {
      id,
      name: view.name,
      model_name: view.model,
      description: view.description,
      org_id: ORG_SYSTEM,
      data_graph: view.data_graph,
    },
  });

  const permission = await prisma.permission.findFirst({
    where: { view_id: id, field_name: '*' },
  });
  if (permission) {
    await prisma.permission.update({
      where: { id: permission.id },
      data: { access: 'write', org_id: ORG_SYSTEM },
    });
  } else {
    await prisma.permission.create({
      data: {
        id: `perm_${view.id}`,
        view_id: id,
        field_name: '*',
        access: 'write',
        org_id: ORG_SYSTEM,
      },
    });
  }

  const link = await prisma.role_view.findFirst({
    where: { role_id: ROLE_ID, view_id: id },
  });
  if (!link) {
    await prisma.role_view.create({
      data: {
        id: `rovi_${view.id}`,
        role_id: ROLE_ID,
        view_id: id,
        org_id: ORG_SYSTEM,
      },
    });
  }
}

async function main() {
  const role = await prisma.role.findUnique({ where: { id: ROLE_ID } });
  if (!role) {
    throw new Error('Super Admin role is missing. Run npm run setup:kernel first.');
  }
  for (const view of VIEWS) {
    await upsertView(view);
  }
  console.log('AR settlement views ready.');
  console.log('  payment_receipt_view, credit_note_view');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
