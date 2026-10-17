/**
 * Idempotent seed for the kernel app.
 * Creates org_system, one tenant org, a Super Admin user, and the views the shell screens read.
 *
 * Platform rows are only the ones the engine needs. currency gets a single USD
 * row on org_system because org.basecurrency_id points at it. attachment has
 * no seed rows: those are files a tenant uploads.
 */
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

const ORG_SYSTEM = 'org_system';
const ORG_KERNEL = 'org_kernel';
const ROLE_ID = 'role_kernel_super_admin';
const USER_ID = 'user_kernel_admin';
const EXTERNAL_ID = 'auth_kernel_admin';
const CURRENCY_ID = 'curr_kernel_usd';

/**
 * Column graphs taken from backend/prisma/metadata/views on prod
 * (the files setup-db.js loads through prisma/setup-metadata.ts).
 * Fields that are not on the kernel models are left out. Relation keys
 * use type "table" so LegacyDataGraphParser builds a nested select.
 */
const VIEWS: Array<{
  id: string;
  name: string;
  model: string;
  description: string;
  data_graph: Prisma.InputJsonValue;
}> = [
  {
    id: 'view_kernel_user',
    name: 'user_view',
    model: 'user',
    description: 'Users',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      name: {
        displayName: 'Name',
        required: false,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '250', columnType: 'text', defaultValue: '' },
      },
      email: {
        displayName: 'Email',
        required: true,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '300', columnType: 'text', defaultValue: '' },
      },
      manager: {
        type: 'table',
        datatype: 'table',
        displayName: 'Manager',
        isColumnShow: true,
        select: { id: 'read', name: 'read', email: 'read' },
      },
      manager_id: {
        dataType: 'string',
        permission: 'update',
        tableProps: {
          columnType: 'select',
          defaultValue: '',
          selectProps: {
            type: 'user',
            limit: '10',
            instanceKey: 'id',
            instanceType: 'user',
            searchParams: 'manager_id',
            instanceLabel: 'name',
            instanceSubLabel: 'email',
            instanceSourceKey: 'id',
          },
        },
      },
      role_users: {
        type: 'table',
        displayName: 'Roles',
        isColumnShow: true,
        select: {
          id: 'read',
          role: { type: 'table', select: { id: 'read', name: 'read' } },
        },
        listProps: { key: 'id', type: 'badge', label: 'role.name' },
      },
    },
  },
  {
    id: 'view_kernel_role',
    name: 'role_view',
    model: 'role',
    description: 'Roles',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      name: {
        displayName: 'Name',
        required: false,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '250', columnType: 'text', defaultValue: '' },
      },
      role_views: {
        type: 'table',
        displayName: 'Views',
        isColumnShow: true,
        select: {
          id: 'read',
          view: { type: 'table', select: { id: 'read', name: 'read' } },
        },
        listProps: { key: 'id', type: 'badge', label: 'view.name' },
      },
    },
  },
  {
    id: 'view_kernel_view',
    name: 'view',
    model: 'view',
    description: 'Views',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      name: {
        displayName: 'Name',
        required: false,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '150', columnType: 'text', defaultValue: '' },
      },
      model_name: {
        displayName: 'Model Name',
        required: false,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '150', columnType: 'text', defaultValue: '' },
      },
      description: {
        displayName: 'Description',
        required: true,
        permission: 'update',
        isColumnShow: false,
        tableProps: { width: '300', columnType: 'text', defaultValue: '' },
      },
      data_graph: { dataType: 'json', permission: 'update' },
      prompt_template: {
        type: 'table',
        displayName: 'Prompt Template',
        isColumnShow: false,
        select: { id: 'read', prompt_type: 'read' },
        listProps: {
          key: 'id',
          type: 'badge',
          label: 'prompt_type',
          isEdit: true,
          editPath: '/prompt-templates',
        },
      },
    },
  },
  {
    id: 'view_kernel_permission',
    name: 'permission_view',
    model: 'permission',
    description: 'Permissions',
    data_graph: {
      id: { datatype: 'string', permission: 'read', displayName: 'ID' },
      view: {
        type: 'table',
        dataType: 'table',
        displayName: 'View',
        required: false,
        isColumnShow: false,
        select: { id: 'read', name: 'read' },
      },
      access: {
        datatype: 'string',
        required: true,
        permission: 'update',
        displayName: 'Access',
        isColumnShow: true,
      },
      view_id: {
        datatype: 'string',
        required: false,
        permission: 'update',
        displayName: 'View',
        isColumnShow: true,
        tableProps: {
          width: '250',
          columnType: 'select',
          defaultValue: '',
          selectProps: {
            type: 'permission',
            limit: '10',
            instanceKey: 'id',
            instanceType: 'view',
            searchParams: 'name',
            instanceLabel: 'name',
            instanceSourceKey: 'view_id',
          },
        },
      },
      field_name: {
        datatype: 'string',
        required: true,
        permission: 'update',
        displayName: 'Name',
        isColumnShow: true,
      },
    },
  },
  {
    id: 'view_kernel_prompt',
    name: 'prompt_template_view',
    model: 'prompt_template',
    description: 'Prompt templates',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      view: {
        type: 'table',
        dataType: 'table',
        displayName: 'Model Name',
        select: { id: 'read', model_name: 'read' },
        tableProps: { width: '150', columnKey: 'model_name', columnType: 'text', defaultValue: '' },
      },
      context: {
        displayName: 'Context',
        required: false,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '300', columnType: 'text', defaultValue: '' },
      },
      version: {
        displayName: 'Version',
        required: false,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'number', defaultValue: 1 },
      },
      priority: {
        displayName: 'Priority',
        required: false,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'number', defaultValue: 0 },
      },
      is_default: {
        displayName: 'Is Default',
        required: false,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'checkbox', defaultValue: false },
      },
      prompt_text: {
        displayName: 'Prompt Text',
        required: true,
        permission: 'update',
        isColumnShow: false,
        tableProps: { width: '500', columnType: 'textarea', defaultValue: '' },
      },
      prompt_type: {
        displayName: 'Prompt Type',
        required: true,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '150', columnType: 'text', defaultValue: '' },
      },
    },
  },
  {
    id: 'view_kernel_currency',
    name: 'currency_view',
    model: 'currency',
    description: 'Currencies',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      code: {
        dataType: 'string',
        required: true,
        permission: 'update',
        displayName: 'Code',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'startswith' },
        tableProps: { width: '120', columnType: 'text' },
      },
      name: {
        dataType: 'string',
        required: true,
        permission: 'update',
        displayName: 'Name',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '300', columnType: 'text' },
      },
      symbol: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Symbol',
        isColumnShow: true,
        tableProps: { width: '80', columnType: 'text' },
      },
      decimal_places: {
        dataType: 'int',
        permission: 'update',
        displayName: 'Decimal Places',
        isColumnShow: false,
        tableProps: { width: '120', columnType: 'int' },
      },
      is_active: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Active',
        isColumnShow: false,
      },
    },
  },
  {
    id: 'view_kernel_flow',
    name: 'workflow_flow_view',
    model: 'workflow_flow',
    description: 'Workflows',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      name: {
        displayName: 'Name',
        dataType: 'string',
        required: true,
        permission: 'update',
        isColumnShow: true,
        tableProps: { columnType: 'text' },
      },
      model_name: {
        displayName: 'Model',
        dataType: 'string',
        required: true,
        permission: 'update',
        isColumnShow: true,
        tableProps: { columnType: 'text' },
      },
      description: {
        displayName: 'Description',
        dataType: 'string',
        permission: 'update',
        isColumnShow: true,
        tableProps: { columnType: 'text' },
      },
      is_active: {
        displayName: 'Active',
        dataType: 'boolean',
        permission: 'update',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
    },
  },
];

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  await prisma.org.upsert({
    where: { id: ORG_SYSTEM },
    update: { name: 'System', slug: 'system' },
    create: {
      id: ORG_SYSTEM,
      name: 'System',
      slug: 'system',
      settings: '{}',
      base_currency: 'USD',
    },
  });

  await prisma.currency.upsert({
    where: { id: CURRENCY_ID },
    update: { org_id: ORG_SYSTEM, code: 'USD', name: 'US Dollar', symbol: '$' },
    create: {
      id: CURRENCY_ID,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      decimal_places: 2,
      is_active: true,
      org_id: ORG_SYSTEM,
    },
  });

  await prisma.org.update({
    where: { id: ORG_SYSTEM },
    data: { base_currency: 'USD', basecurrency_id: CURRENCY_ID },
  });

  await prisma.org.upsert({
    where: { id: ORG_KERNEL },
    update: { name: 'Kernel', slug: 'kernel', basecurrency_id: CURRENCY_ID },
    create: {
      id: ORG_KERNEL,
      name: 'Kernel',
      slug: 'kernel',
      settings: '{}',
      base_currency: 'USD',
      basecurrency_id: CURRENCY_ID,
    },
  });

  await prisma.role.upsert({
    where: { id: ROLE_ID },
    update: { name: 'Super Admin', org_id: ORG_SYSTEM },
    create: {
      id: ROLE_ID,
      name: 'Super Admin',
      org_id: ORG_SYSTEM,
    },
  });

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {
      email: 'admin@example.com',
      password: passwordHash,
      org_id: ORG_KERNEL,
      external_id: EXTERNAL_ID,
    },
    create: {
      id: USER_ID,
      email: 'admin@example.com',
      name: 'Kernel Admin',
      password: passwordHash,
      external_id: EXTERNAL_ID,
      auth_provider: 'local',
      org_id: ORG_KERNEL,
    },
  });

  await prisma.role_user.upsert({
    where: { id: 'rous_kernel_admin' },
    update: { role_id: ROLE_ID, user_id: USER_ID, org_id: ORG_KERNEL },
    create: {
      id: 'rous_kernel_admin',
      role_id: ROLE_ID,
      user_id: USER_ID,
      org_id: ORG_KERNEL,
    },
  });

  for (const view of VIEWS) {
    await prisma.view.upsert({
      where: { id: view.id },
      update: {
        name: view.name,
        model_name: view.model,
        description: view.description,
        org_id: ORG_SYSTEM,
        data_graph: view.data_graph,
      },
      create: {
        id: view.id,
        name: view.name,
        model_name: view.model,
        description: view.description,
        org_id: ORG_SYSTEM,
        data_graph: view.data_graph,
      },
    });
    const permId = `perm_${view.id}`;
    await prisma.permission.upsert({
      where: { id: permId },
      update: { access: 'write', org_id: ORG_SYSTEM },
      create: {
        id: permId,
        view_id: view.id,
        field_name: '*',
        access: 'write',
        org_id: ORG_SYSTEM,
      },
    });
    const linkId = `rovi_${view.id}`;
    await prisma.role_view.upsert({
      where: { id: linkId },
      update: { role_id: ROLE_ID, view_id: view.id, org_id: ORG_SYSTEM },
      create: {
        id: linkId,
        role_id: ROLE_ID,
        view_id: view.id,
        org_id: ORG_SYSTEM,
      },
    });
  }

  console.log('Kernel seed ready.');
  console.log('  system org: org_system');
  console.log('  tenant org: org_kernel');
  console.log('  login: admin@example.com / admin123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
