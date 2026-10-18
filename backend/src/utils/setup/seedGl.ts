/**
 * Idempotent seed for the general ledger screens.
 * Run after setup:kernel. Views live on org_system and Super Admin can read them.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

const ORG_SYSTEM = 'org_system';
const ROLE_ID = 'role_kernel_super_admin';

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
    id: 'view_gl_account',
    name: 'account_view',
    model: 'account',
    description: 'Chart of Accounts',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      code: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Code',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '120', columnType: 'text' },
      },
      name: {
        dataType: 'string',
        permission: 'update',
        required: true,
        displayName: 'Name',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '280', columnType: 'text' },
      },
      classification: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Classification',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'text' },
      },
      account_number: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Account Number',
        isColumnShow: true,
        tableProps: { width: '160', columnType: 'text' },
      },
      balance: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Balance',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'decimal' },
      },
      is_active: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Active',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      parent_account: {
        type: 'table',
        datatype: 'table',
        displayName: 'Parent',
        isColumnShow: true,
        select: { id: 'read', name: 'read', code: 'read' },
      },
      parent_account_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Parent',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...accountSelect, instanceSourceKey: 'parent_account_id' },
        },
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
          selectProps: {
            type: 'currency',
            limit: '10',
            instanceKey: 'id',
            instanceType: 'currency',
            searchParams: 'code',
            instanceLabel: 'code',
            instanceSubLabel: 'name',
            instanceSourceKey: 'currency_id',
          },
        },
      },
      account_types: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Types',
        isColumnShow: false,
      },
      sub_type: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Sub Type',
        isColumnShow: false,
      },
      extraction_notes: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Extraction Notes',
        isColumnShow: false,
      },
      status: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Status',
        isColumnShow: false,
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
    },
  },
  {
    id: 'view_gl_posting',
    name: 'posting_view',
    model: 'posting',
    description: 'Transactions',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      value_date: {
        dataType: 'date',
        permission: 'update',
        displayName: 'Value Date',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'date' },
      },
      posting_date: {
        dataType: 'date',
        permission: 'update',
        displayName: 'Posting Date',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'date' },
      },
      description: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Description',
        isColumnShow: true,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '320', columnType: 'text' },
      },
      name: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Name',
        isColumnShow: false,
        searchProps: { isSearch: true, operation: 'contains' },
        tableProps: { width: '200', columnType: 'text' },
      },
      amount: {
        dataType: 'decimal',
        permission: 'update',
        displayName: 'Amount',
        isColumnShow: true,
        tableProps: { width: '140', columnType: 'decimal' },
      },
      debit_account: {
        type: 'table',
        datatype: 'table',
        displayName: 'Debit',
        isColumnShow: true,
        select: { id: 'read', name: 'read', code: 'read' },
      },
      debit_account_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Debit Account',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...accountSelect, instanceSourceKey: 'debit_account_id' },
        },
      },
      credit_account: {
        type: 'table',
        datatype: 'table',
        displayName: 'Credit',
        isColumnShow: true,
        select: { id: 'read', name: 'read', code: 'read' },
      },
      credit_account_id: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Credit Account',
        isColumnShow: false,
        tableProps: {
          columnType: 'select',
          selectProps: { ...accountSelect, instanceSourceKey: 'credit_account_id' },
        },
      },
      kind: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Kind',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      status: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Status',
        isColumnShow: true,
        tableProps: { width: '120', columnType: 'text' },
      },
      notes: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Notes',
        isColumnShow: false,
      },
      category_name: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Category',
        isColumnShow: false,
      },
      account_name: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Account Name',
        isColumnShow: false,
      },
      reconciliation_status: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Reconciliation',
        isColumnShow: false,
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
    },
  },
];

async function main() {
  const role = await prisma.role.findUnique({ where: { id: ROLE_ID } });
  if (!role) {
    throw new Error('Super Admin role is missing. Run npm run setup:kernel first.');
  }

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

  console.log('General ledger views ready.');
  console.log('  account_view, posting_view on org_system');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
