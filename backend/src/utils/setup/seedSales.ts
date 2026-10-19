/**
 * Idempotent seed for sales customers and invoices (incl. nested line items).
 * Run after setup:kernel / sales schema. Views live on org_system.
 *
 *   cd backend && npm run seed:sales
 */
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

const ORG_SYSTEM = 'org_system';
const ROLE_ID = 'role_kernel_super_admin';

const currencySelect = {
  type: 'currency',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'currency',
  searchParams: 'code',
  instanceLabel: 'code',
  instanceSubLabel: 'name',
};

const customerSelect = {
  type: 'customer',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'customer',
  searchParams: 'name',
  instanceLabel: 'name',
};

const entitySelect = {
  type: 'entity',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'entity',
  searchParams: 'name',
  instanceLabel: 'name',
};

const VIEWS: Array<{
  id: string;
  name: string;
  model: string;
  description: string;
  data_graph: Prisma.InputJsonValue;
}> = [
  {
    id: 'view_sales_customer',
    name: 'customer_view',
    model: 'customer',
    description: 'Customers',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      name: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Name',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '220', columnType: 'text' },
      },
      email: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Email',
        isColumnShow: true,
        tableProps: { width: '200', columnType: 'text' },
      },
      phone: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Phone',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'text' },
      },
      city: {
        dataType: 'string',
        permission: 'update',
        displayName: 'City',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'text' },
      },
      country: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Country',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      is_active: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Active',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      legal_name: { dataType: 'string', permission: 'update', displayName: 'Legal name', isColumnShow: false },
      address: { dataType: 'string', permission: 'update', displayName: 'Address', isColumnShow: false },
      state: { dataType: 'string', permission: 'update', displayName: 'State', isColumnShow: false },
      postal_code: { dataType: 'string', permission: 'update', displayName: 'Postal code', isColumnShow: false },
      website: { dataType: 'string', permission: 'update', displayName: 'Website', isColumnShow: false },
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
        isColumnShow: true,
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
      source_system_id: {
        dataType: 'string',
        permission: 'read',
        displayName: 'Source',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      source_record_id: { dataType: 'string', permission: 'read', displayName: 'Source id', isColumnShow: false },
    },
  },
  {
    id: 'view_sales_invoice',
    name: 'invoice_view',
    model: 'invoice',
    description: 'Invoices',
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
      invoice_date: {
        dataType: 'date',
        permission: 'update',
        displayName: 'Date',
        isColumnShow: true,
        tableProps: { width: '130', columnType: 'date' },
      },
      due_date: {
        dataType: 'date',
        permission: 'update',
        displayName: 'Due',
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
      direction: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Direction',
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
      bill_to: { dataType: 'string', permission: 'update', displayName: 'Bill to', isColumnShow: false },
      ship_to: { dataType: 'string', permission: 'update', displayName: 'Ship to', isColumnShow: false },
      notes: { dataType: 'string', permission: 'update', displayName: 'Notes', isColumnShow: false },
      reference: { dataType: 'string', permission: 'update', displayName: 'Reference', isColumnShow: false },
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
  console.log('Sales views ready.');
  console.log('  customer_view, invoice_view on org_system (invoice nests line_items)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
