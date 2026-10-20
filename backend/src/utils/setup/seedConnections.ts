/**
 * Idempotent seed for ERP source_system list/detail via metadata view.
 * Omits connection_config / extraction_config from data_graph (secrets).
 *
 *   cd backend && npm run seed:connections
 */
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

const ORG_SYSTEM = 'org_system';
const ROLE_ID = 'role_kernel_super_admin';

const entitySelect = {
  type: 'entity',
  limit: '10',
  instanceKey: 'id',
  instanceType: 'entity',
  searchParams: 'name',
  instanceLabel: 'name',
};

const VIEW = {
  id: 'view_source_system',
  name: 'source_system_view',
  model: 'source_system',
  description: 'ERP connections',
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
    system_type: {
      dataType: 'string',
      permission: 'update',
      required: true,
      displayName: 'System',
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
    default_purchase_account_name: {
      dataType: 'string',
      permission: 'update',
      displayName: 'Purchase account',
      isColumnShow: true,
      tableProps: { width: '180', columnType: 'text' },
    },
    default_purchase_account_id: {
      dataType: 'string',
      permission: 'update',
      displayName: 'Purchase account id',
      isColumnShow: false,
    },
    last_sync_at: {
      dataType: 'date',
      permission: 'read',
      displayName: 'Last sync',
      isColumnShow: true,
      tableProps: { width: '160', columnType: 'date' },
    },
    last_sync_status: {
      dataType: 'json',
      permission: 'read',
      displayName: 'Sync status',
      isColumnShow: false,
    },
    created_at: {
      dataType: 'date',
      permission: 'read',
      displayName: 'Created',
      isColumnShow: true,
      tableProps: { width: '140', columnType: 'date' },
    },
    modified_at: {
      dataType: 'date',
      permission: 'read',
      displayName: 'Modified',
      isColumnShow: true,
      tableProps: { width: '140', columnType: 'date' },
    },
    region: { dataType: 'string', permission: 'update', displayName: 'Region', isColumnShow: false },
    connector_version: {
      dataType: 'string',
      permission: 'update',
      displayName: 'Connector',
      isColumnShow: false,
    },
  } as Prisma.InputJsonValue,
};

async function upsertView() {
  const existing = await prisma.view.findFirst({
    where: { name: VIEW.name, model_name: VIEW.model, org_id: ORG_SYSTEM },
  });
  const id = existing?.id ?? VIEW.id;
  await prisma.view.upsert({
    where: { id },
    update: {
      name: VIEW.name,
      model_name: VIEW.model,
      description: VIEW.description,
      org_id: ORG_SYSTEM,
      data_graph: VIEW.data_graph,
    },
    create: {
      id,
      name: VIEW.name,
      model_name: VIEW.model,
      description: VIEW.description,
      org_id: ORG_SYSTEM,
      data_graph: VIEW.data_graph,
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
        id: `perm_${VIEW.id}`,
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
        id: `rovi_${VIEW.id}`,
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
  await upsertView();
  console.log('Connections view ready: source_system_view (secrets omitted from data_graph)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
