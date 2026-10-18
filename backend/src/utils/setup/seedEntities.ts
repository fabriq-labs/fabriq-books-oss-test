/**
 * Idempotent seed for legal entities and exchange rates.
 * Run after setup:kernel. Views live on org_system and Super Admin can read them.
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

const VIEWS: Array<{
  id: string;
  name: string;
  model: string;
  description: string;
  data_graph: Prisma.InputJsonValue;
}> = [
  {
    id: 'view_gl_entity',
    name: 'entity_view',
    model: 'entity',
    description: 'Legal entities',
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
      legal_name: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Legal name',
        isColumnShow: true,
        tableProps: { width: '240', columnType: 'text' },
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
        tableProps: { width: '140', columnType: 'text' },
      },
      is_headquarters: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Headquarters',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      address: { dataType: 'string', permission: 'update', displayName: 'Address', isColumnShow: false },
      state: { dataType: 'string', permission: 'update', displayName: 'State', isColumnShow: false },
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
    },
  },
  {
    id: 'view_gl_exchange_rate',
    name: 'exchange_rate_view',
    model: 'exchange_rate',
    description: 'Exchange rates',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      effective_date: {
        dataType: 'date',
        permission: 'update',
        required: true,
        displayName: 'Effective date',
        isColumnShow: true,
        tableProps: { width: '150', columnType: 'date' },
      },
      rate_type: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Type',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      rate: {
        dataType: 'decimal',
        permission: 'update',
        required: true,
        displayName: 'Rate',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'decimal' },
      },
      from_currency: {
        type: 'table',
        datatype: 'table',
        displayName: 'From',
        isColumnShow: true,
        select: { id: 'read', code: 'read', name: 'read' },
      },
      from_currency_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'From',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...currencySelect, instanceSourceKey: 'from_currency_id' },
        },
      },
      to_currency: {
        type: 'table',
        datatype: 'table',
        displayName: 'To',
        isColumnShow: true,
        select: { id: 'read', code: 'read', name: 'read' },
      },
      to_currency_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'To',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...currencySelect, instanceSourceKey: 'to_currency_id' },
        },
      },
    },
  },
];

const entitySelectPatch: Prisma.InputJsonValue = {
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
      selectProps: {
        type: 'entity',
        limit: '10',
        instanceKey: 'id',
        instanceType: 'entity',
        searchParams: 'name',
        instanceLabel: 'name',
        instanceSourceKey: 'entity_id',
      },
    },
  },
};

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

async function mergeAccountPostingGraphs() {
  const patch = entitySelectPatch as Record<string, Prisma.InputJsonValue>;
  for (const name of ['account_view', 'posting_view']) {
    const view = await prisma.view.findFirst({
      where: { name, org_id: ORG_SYSTEM },
    });
    if (!view) continue;
    const graph = (view.data_graph ?? {}) as Record<string, Prisma.InputJsonValue>;
    await prisma.view.update({
      where: { id: view.id },
      data: { data_graph: { ...graph, ...patch } },
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
  await mergeAccountPostingGraphs();
  console.log('Entity and exchange rate views ready.');
  console.log('  entity_view, exchange_rate_view on org_system');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
