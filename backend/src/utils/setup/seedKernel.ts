/**
 * Idempotent seed for the kernel app.
 * Creates org_system, one tenant org, a Super Admin user, and the views the shell screens read.
 *
 * Platform rows are only the ones the engine needs. currency gets a single USD
 * row on org_system because org.basecurrency_id points at it. attachment has
 * no seed rows: those are files a tenant uploads.
 */
import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';

const ORG_SYSTEM = 'org_system';
const ORG_KERNEL = 'org_kernel';
const ROLE_ID = 'role_kernel_super_admin';
const USER_ID = 'user_kernel_admin';
const EXTERNAL_ID = 'auth_kernel_admin';
const CURRENCY_ID = 'curr_kernel_usd';

const VIEWS: Array<{ id: string; name: string; model: string; description: string }> = [
  { id: 'view_kernel_user', name: 'user_view', model: 'user', description: 'Users' },
  { id: 'view_kernel_role', name: 'role_view', model: 'role', description: 'Roles' },
  { id: 'view_kernel_view', name: 'view', model: 'view', description: 'Views' },
  { id: 'view_kernel_permission', name: 'permission_view', model: 'permission', description: 'Permissions' },
  { id: 'view_kernel_prompt', name: 'prompt_template_view', model: 'prompt_template', description: 'Prompt templates' },
  { id: 'view_kernel_currency', name: 'currency_view', model: 'currency', description: 'Currencies' },
  { id: 'view_kernel_flow', name: 'workflow_flow_view', model: 'workflow_flow', description: 'Workflows' },
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
      update: { name: view.name, model_name: view.model, org_id: ORG_SYSTEM },
      create: {
        id: view.id,
        name: view.name,
        model_name: view.model,
        description: view.description,
        org_id: ORG_SYSTEM,
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
