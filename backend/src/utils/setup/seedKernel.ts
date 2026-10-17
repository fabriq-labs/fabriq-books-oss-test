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
      department: {
        type: 'table',
        datatype: 'table',
        displayName: 'Department',
        isColumnShow: true,
        select: { id: 'read', name: 'read' },
      },
      department_id: {
        dataType: 'string',
        permission: 'update',
        tableProps: {
          columnType: 'select',
          defaultValue: '',
          selectProps: {
            type: 'department',
            limit: '10',
            instanceKey: 'id',
            instanceType: 'department',
            searchParams: 'name',
            instanceLabel: 'name',
            instanceSourceKey: 'department_id',
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
    id: 'view_kernel_department',
    name: 'department_view',
    model: 'department',
    description: 'Departments',
    data_graph: {
      id: { dataType: 'string', permission: 'read' },
      name: {
        displayName: 'Name',
        required: true,
        permission: 'update',
        isColumnShow: true,
        tableProps: { width: '250', columnType: 'text', defaultValue: '' },
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
  {
    id: 'view_kernel_llm_trace',
    name: 'llm_trace_view',
    model: 'llm_trace',
    description: 'LLM traces',
    data_graph: {
      id: { dataType: 'string', permission: 'read', displayName: 'Id', isColumnShow: false },
      steps: {
        type: 'table',
        dataType: 'table',
        displayName: 'Steps',
        isColumnShow: false,
        select: {
          id: 'read',
          status: 'read',
          step_number: 'read',
          duration_ms: 'read',
          tool_calls: 'read',
          tool_results: 'read',
          sql_queries: 'read',
          error_message: 'read',
          prompt_tokens: 'read',
          completion_tokens: 'read',
          response_text: 'read',
        },
      },
      status: {
        orderNo: 1,
        dataType: 'string',
        permission: 'read',
        displayName: 'Status',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'text' },
      },
      created_at: {
        orderNo: 2,
        dataType: 'datetime',
        permission: 'read',
        displayName: 'Timestamp',
        isColumnShow: true,
        tableProps: { width: '180', columnType: 'date' },
      },
      question: {
        orderNo: 3,
        dataType: 'string',
        permission: 'read',
        displayName: 'Trace / Context',
        isColumnShow: true,
        tableProps: { width: '350', columnType: 'text' },
      },
      llm_model: {
        orderNo: 5,
        dataType: 'string',
        permission: 'read',
        displayName: 'LLM Model',
        isColumnShow: true,
        tableProps: { width: '150', columnType: 'text' },
      },
      duration_ms: {
        orderNo: 6,
        dataType: 'int',
        permission: 'read',
        displayName: 'Latency',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'number' },
      },
      total_tokens: {
        orderNo: 7,
        dataType: 'int',
        permission: 'read',
        displayName: 'Tokens',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'number' },
      },
      cost_usd: {
        orderNo: 8,
        dataType: 'decimal',
        permission: 'read',
        displayName: 'Cost (USD)',
        isColumnShow: true,
        tableProps: { width: '100', columnType: 'number' },
      },
      feedback: { dataType: 'string', permission: 'update', displayName: 'Feedback', isColumnShow: false },
      query_type: { dataType: 'string', permission: 'read', displayName: 'Query Type', isColumnShow: false },
      model_name: { dataType: 'string', permission: 'read', displayName: 'Model', isColumnShow: false },
      user_id: { dataType: 'string', permission: 'read', displayName: 'User', isColumnShow: false },
      response_text: { dataType: 'string', permission: 'read', displayName: 'Response', isColumnShow: false },
      error_message: { dataType: 'string', permission: 'read', displayName: 'Error Message', isColumnShow: false },
    },
  },
  {
    id: 'view_kernel_llm_trace_step',
    name: 'llm_trace_step_view',
    model: 'llm_trace_step',
    description: 'LLM trace steps',
    data_graph: {
      id: { datatype: 'string', permission: 'read', displayName: 'Id', isColumnShow: false },
      step_number: {
        orderNo: 1,
        datatype: 'number',
        permission: 'read',
        displayName: 'Step',
        isColumnShow: true,
        tableProps: { columnType: 'number' },
      },
      prompt_tokens: {
        orderNo: 2,
        datatype: 'number',
        permission: 'read',
        displayName: 'Prompt Tokens',
        isColumnShow: true,
      },
      completion_tokens: {
        orderNo: 3,
        datatype: 'number',
        permission: 'read',
        displayName: 'Completion Tokens',
        isColumnShow: true,
      },
      duration_ms: {
        orderNo: 4,
        datatype: 'number',
        permission: 'read',
        displayName: 'Duration (ms)',
        isColumnShow: true,
      },
      status: {
        orderNo: 5,
        datatype: 'string',
        permission: 'read',
        displayName: 'Status',
        isColumnShow: true,
      },
      trace_id: { datatype: 'string', permission: 'read', displayName: 'Trace ID', isColumnShow: false },
      tool_calls: { datatype: 'json', permission: 'read', displayName: 'Tool Calls', isColumnShow: false },
      tool_results: { datatype: 'json', permission: 'read', displayName: 'Tool Results', isColumnShow: false },
      response_text: { datatype: 'string', permission: 'read', displayName: 'Response', isColumnShow: false },
      error_message: { datatype: 'string', permission: 'read', displayName: 'Error Message', isColumnShow: false },
    },
  },
  {
    id: 'view_kernel_workflow_instance',
    name: 'workflow_instance_view',
    model: 'workflow_instance',
    description: 'Workflow instances',
    data_graph: {
      id: { dataType: 'string', permission: 'read', isColumnShow: false },
      status: {
        displayName: 'Status',
        dataType: 'string',
        permission: 'read',
        isColumnShow: true,
        orderNo: 1,
      },
      current_state: {
        displayName: 'State',
        dataType: 'string',
        permission: 'read',
        isColumnShow: true,
        orderNo: 2,
      },
      model_id: {
        displayName: 'Record',
        dataType: 'string',
        permission: 'read',
        isColumnShow: true,
        orderNo: 3,
      },
      created_at: {
        displayName: 'Created',
        dataType: 'datetime',
        permission: 'read',
        isColumnShow: true,
        orderNo: 4,
        tableProps: { columnType: 'date' },
      },
      flow: {
        type: 'table',
        datatype: 'table',
        displayName: 'Flow',
        isColumnShow: false,
        select: { id: 'read', name: 'read' },
      },
      current_state_ref: {
        type: 'table',
        datatype: 'table',
        displayName: 'State detail',
        isColumnShow: false,
        select: { id: 'read', name: 'read' },
      },
      history: {
        type: 'table',
        displayName: 'History',
        isColumnShow: false,
        select: {
          id: 'read',
          from_state: 'read',
          to_state: 'read',
          performed_at: 'read',
          performed_by_name: 'read',
          action: { type: 'table', select: { id: 'read', name: 'read' } },
        },
      },
    },
  },
  {
    id: 'view_kernel_chat_thread',
    name: 'chat_thread_view',
    model: 'chat_thread',
    description: 'Chat threads',
    data_graph: {
      id: { dataType: 'string', permission: 'read', displayName: 'Thread ID', isColumnShow: false },
      title: {
        orderNo: 1,
        dataType: 'string',
        permission: 'update',
        displayName: 'Title',
        isColumnShow: true,
        tableProps: { width: '280', columnType: 'text' },
      },
      created_at: {
        orderNo: 2,
        dataType: 'datetime',
        permission: 'read',
        displayName: 'Created',
        isColumnShow: true,
        tableProps: { columnType: 'date' },
      },
      updated_at: {
        orderNo: 3,
        dataType: 'datetime',
        permission: 'read',
        displayName: 'Updated',
        isColumnShow: true,
        tableProps: { columnType: 'date' },
      },
      user_id: { dataType: 'string', permission: 'read', displayName: 'User', isColumnShow: false },
      messages: { dataType: 'json', permission: 'update', displayName: 'Messages', isColumnShow: false },
      model_used: { dataType: 'string', permission: 'update', displayName: 'Model', isColumnShow: false },
      total_tokens_used: { dataType: 'int', permission: 'read', displayName: 'Tokens', isColumnShow: false },
    },
  },
  {
    id: 'view_kernel_import_run',
    name: 'import_run_view',
    model: 'import_run',
    description: 'Import runs',
    data_graph: {
      id: { datatype: 'string', permission: 'read', displayName: 'ID', isColumnShow: false },
      target_model: { datatype: 'string', permission: 'update', displayName: 'Target Model', isColumnShow: true },
      import_channel: { datatype: 'string', permission: 'update', displayName: 'Channel', isColumnShow: true },
      source_file_name: { datatype: 'string', permission: 'update', displayName: 'Source File', isColumnShow: true },
      status: { datatype: 'string', permission: 'update', displayName: 'Status', isColumnShow: true },
      started_at: { datatype: 'date', permission: 'update', displayName: 'Started At', isColumnShow: true },
      records_total: { datatype: 'number', permission: 'update', displayName: 'Records Total', isColumnShow: true },
      records_failed: { datatype: 'number', permission: 'update', displayName: 'Records Failed', isColumnShow: true },
      error_summary: { datatype: 'string', permission: 'update', displayName: 'Error Summary', isColumnShow: false },
    },
  },
  {
    id: 'view_kernel_agent_tools',
    name: 'agent_model_tool_config_view',
    model: 'agent_model_tool_config',
    description: 'Agent model tools',
    data_graph: {
      id: { dataType: 'string', permission: 'read', displayName: 'ID', isColumnShow: false },
      model_name: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Model Name',
        isColumnShow: true,
        required: true,
      },
      display_name: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Display Name',
        isColumnShow: true,
        required: true,
      },
      model_tools: {
        dataType: 'string',
        permission: 'update',
        displayName: 'Model Tools',
        isColumnShow: true,
        listProps: { key: 'model_tools', type: 'badge', label: 'model_tools' },
      },
      include_analytics_tools: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Analytics Tools',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      is_active: {
        dataType: 'boolean',
        permission: 'update',
        displayName: 'Active',
        isColumnShow: true,
        tableProps: { columnType: 'checkbox' },
      },
      sort_order: {
        dataType: 'number',
        permission: 'update',
        displayName: 'Sort Order',
        isColumnShow: true,
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
