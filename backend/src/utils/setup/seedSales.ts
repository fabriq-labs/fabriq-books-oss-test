/**
 * Idempotent seed for sales + catalog masters (customers, invoices, items,
 * suppliers, tax rates / groups / regions). Views live on org_system.
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

const accountSelect = {
  type: 'account',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'account',
  searchParams: 'name',
  instanceLabel: 'name',
  instanceSubLabel: 'code',
};

const taxGroupSelect = {
  type: 'tax_group',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'tax_group',
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
      payment_receipt_applications: {
        type: 'table',
        datatype: 'table',
        displayName: 'Applied receipts',
        isColumnShow: false,
        select: {
          id: 'read',
          amount_applied: 'read',
          applied_date: 'read',
          payment_receipt: {
            type: 'table',
            select: { id: 'read', number: 'read', receipt_date: 'read' },
          },
        },
      },
    },
  },
  {
    id: 'view_sales_item_master',
    name: 'item_master_view',
    model: 'item_master',
    description: 'Items',
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
      code: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Code',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      item_type: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Type',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      unit_price: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Unit price',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'decimal' },
      },
      is_active: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Active',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      description: { dataType: 'string', permission: 'update', displayName: 'Description', isColumnShow: false },
      is_stockable: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Stockable',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      sales_account: {
        type: 'table',
        datatype: 'table',
        displayName: 'Sales account',
        isColumnShow: true,
        select: { id: 'read', name: 'read', code: 'read' },
      },
      sales_account_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Sales account',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...accountSelect, instanceSourceKey: 'sales_account_id' },
        },
      },
      purchase_account: {
        type: 'table',
        datatype: 'table',
        displayName: 'Purchase account',
        isColumnShow: false,
        select: { id: 'read', name: 'read', code: 'read' },
      },
      purchase_account_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Purchase account',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...accountSelect, instanceSourceKey: 'purchase_account_id' },
        },
      },
      tax_group: {
        type: 'table',
        datatype: 'table',
        displayName: 'Tax group',
        isColumnShow: true,
        select: { id: 'read', name: 'read', code: 'read' },
      },
      tax_group_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Tax group',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...taxGroupSelect, instanceSourceKey: 'tax_group_id' },
        },
      },
      source_system_id: {
        dataType: 'string',
        permission: 'read',
        displayName: 'Source',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      source_record_id: { dataType: 'string', permission: 'read', displayName: 'Source id', isColumnShow: false },
    },
  },
  {
    id: 'view_sales_supplier',
    name: 'supplier_view',
    model: 'supplier',
    description: 'Suppliers',
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
      country: { dataType: 'string', permission: 'update', displayName: 'Country', isColumnShow: false },
      postal_code: { dataType: 'string', permission: 'update', displayName: 'Postal code', isColumnShow: false },
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
      source_system_id: {
        dataType: 'string',
        permission: 'read',
        displayName: 'Source',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      source_record_id: { dataType: 'string', permission: 'read', displayName: 'Source id', isColumnShow: false },
    },
  },
  {
    id: 'view_sales_tax_master',
    name: 'tax_master_view',
    model: 'tax_master',
    description: 'Tax rates',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      name: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Name',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '200', columnType: 'text' },
      },
      code: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Code',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      rate: {
        dataType: 'decimal',
        permission: 'update',
        required: true,
        displayName: 'Rate',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'decimal' },
      },
      component_type: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Component',
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
      is_recoverable: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Recoverable',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      effective_from: {
        dataType: 'date',
        permission: 'update',
        displayName: 'From',
        isColumnShow: false,
        tableProps: { columnType: 'date' },
      },
      effective_to: {
        dataType: 'date',
        permission: 'update',
        displayName: 'To',
        isColumnShow: false,
        tableProps: { columnType: 'date' },
      },
      source_system_id: {
        dataType: 'string',
        permission: 'read',
        displayName: 'Source',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      source_record_id: { dataType: 'string', permission: 'read', displayName: 'Source id', isColumnShow: false },
    },
  },
  {
    id: 'view_sales_tax_group',
    name: 'tax_group_view',
    model: 'tax_group',
    description: 'Tax groups',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      name: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Name',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '200', columnType: 'text' },
      },
      code: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Code',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      country_code: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Country',
        isColumnShow: true,
        tableProps: { width: '80', columnType: 'text' },
      },
      is_active: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Active',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      source_system_id: {
        dataType: 'string',
        permission: 'read',
        displayName: 'Source',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      source_record_id: { dataType: 'string', permission: 'read', displayName: 'Source id', isColumnShow: false },
      components: {
        type: 'table',
        datatype: 'table',
        displayName: 'Components',
        isColumnShow: false,
        select: {
          id: 'read',
          sequence: 'read',
          tax_master: {
            type: 'table',
            select: { id: 'read', name: 'read', code: 'read', rate: 'read' },
          },
        },
      },
    },
  },
  {
    id: 'view_sales_tax_region',
    name: 'tax_region_view',
    model: 'tax_region',
    description: 'Tax regions',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      country_code: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Country',
        isColumnShow: true,
        tableProps: { width: '80', columnType: 'text' },
      },
      code: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Code',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '100', columnType: 'text' },
      },
      name: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Name',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '200', columnType: 'text' },
      },
      region_type: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Type',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
    },
  },
];

const DEFAULT_TAX_REGIONS: Array<{
  id: string;
  country_code: string;
  code: string;
  name: string;
  region_type: string;
}> = [
  { id: 'txreg_us_ca', country_code: 'US', code: 'CA', name: 'California', region_type: 'state' },
  { id: 'txreg_us_ny', country_code: 'US', code: 'NY', name: 'New York', region_type: 'state' },
  { id: 'txreg_us_tx', country_code: 'US', code: 'TX', name: 'Texas', region_type: 'state' },
  { id: 'txreg_us_wa', country_code: 'US', code: 'WA', name: 'Washington', region_type: 'state' },
  { id: 'txreg_us_fl', country_code: 'US', code: 'FL', name: 'Florida', region_type: 'state' },
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

async function seedDefaultTaxRegions() {
  for (const region of DEFAULT_TAX_REGIONS) {
    const existing = await prisma.tax_region.findFirst({
      where: {
        org_id: ORG_SYSTEM,
        country_code: region.country_code,
        code: region.code,
      },
    });
    if (existing) {
      await prisma.tax_region.update({
        where: { id: existing.id },
        data: {
          name: region.name,
          region_type: region.region_type,
        },
      });
      continue;
    }
    await prisma.tax_region.create({
      data: {
        id: region.id,
        org_id: ORG_SYSTEM,
        country_code: region.country_code,
        code: region.code,
        name: region.name,
        region_type: region.region_type,
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
  await seedDefaultTaxRegions();
  console.log('Sales + catalog views ready.');
  console.log(
    '  customer_view, invoice_view, item_master_view, supplier_view, tax_master_view, tax_group_view, tax_region_view'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
