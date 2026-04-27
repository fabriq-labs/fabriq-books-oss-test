import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware } from '../auth/middleware';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import logger from '../utils/logger';
import { main as syncMetadataFromJson } from '../metadata/syncMetadataFromJson';

const adminRouter = Router();

/** Check if the given user id has the Super Admin role (any of their roles). */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const roleUsers = await prisma.role_user.findMany({
    where: { user_id: userId },
    include: { role: true },
  });
  return roleUsers.some((ru) => ru.role?.name?.toLowerCase().includes('super admin'));
}

interface TenantPayload {
  name: string;
  slug: string;
  settings?: string | Record<string, unknown>;
}

interface AdminUserPayload {
  email: string;
  name?: string;
  password: string;
}

interface OnboardTenantBody {
  tenant: TenantPayload;
  adminUsers: AdminUserPayload[];
}


/** Matches `setup-db.js` parseArgs() --demo-data= values (five demo profiles; no `skip`). */
const DEMO_DATA_OPTIONS = [
  'indian-demo',
  'us-ca-demo',
  'perfin-demo',
  'both',
  'nri',
] as const;

type DemoDataOption = (typeof DEMO_DATA_OPTIONS)[number];

let demoResetInProgress = false;
let devOptionsSyncInProgress = false;

function loadRuntimeModule<T = any>(modulePath: string): T {
  return module.require(modulePath) as T;
}

type SeedPaymentTermsFromCsvFn = (options?: {
  prismaClient?: typeof prisma;
  csvPath?: string;
  orgIdOverride?: string;
  legalEntityIdOverride?: string | null;
  profileLabel?: string;
}) => Promise<{ created: number; updated: number; total: number }>;

type SetupChartOfAccountsFn = (
  orgId: string,
  legalEntityId: string,
  templatePath?: string,
  currency?: string,
  prismaClient?: typeof prisma
) => Promise<{ accounts: Map<string, unknown>; created: number; existing: number }>;

/** Pipe setup-db stdout/stderr to the server process stdout (terminal / container logs). */
function pipeSetupStreamToConsole(
  stream: NodeJS.ReadableStream | null,
  label: 'stdout' | 'stderr'
): void {
  if (!stream) return;
  stream.setEncoding('utf8');
  let pending = '';
  stream.on('data', (chunk: string) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.length) {
        console.log(`[demo-database-reset/setup-db ${label}] ${line}`);
      }
    }
  });
  stream.on('end', () => {
    if (pending.length) {
      console.log(`[demo-database-reset/setup-db ${label}] ${pending}`);
    }
  });
}

/** ALLOW_DEMO_RESET_API=true forces enable; false forces disable; unset defaults to enabled only when NODE_ENV !== production */
function isDemoDatabaseResetApiEnabled(): boolean {
  const v = process.env.ALLOW_DEMO_RESET_API;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/** ALLOW_DEV_OPTIONS_API=true forces enable; false forces disable; unset defaults to enabled only when NODE_ENV !== production */
function isDevOptionsApiEnabled(): boolean {
  const v = process.env.ALLOW_DEV_OPTIONS_API;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function getBackendRootDir(): string {
  // Compiled: dist/rest/adminRouter.js -> backend root is two levels up
  return path.join(__dirname, '..', '..');
}

function modelHasField(modelName: string, fieldName: string): boolean {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  return Boolean(model?.fields.some((f) => f.name === fieldName));
}

adminRouter.post(
  '/onboard-tenant',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const context = (req as any).context?.auth;
      if (!context?.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const isSA = await isSuperAdmin(context.user.id);
      if (!isSA) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }

      const body = req.body as OnboardTenantBody;
      if (!body?.tenant?.name || !body?.tenant?.slug) {
        return res.status(400).json({
          error: 'tenant.name and tenant.slug are required',
        });
      }
      if (!Array.isArray(body.adminUsers) || body.adminUsers.length === 0) {
        return res.status(400).json({
          error: 'At least one admin user is required',
        });
      }

      for (let i = 0; i < body.adminUsers.length; i++) {
        const u = body.adminUsers[i];
        if (!u?.email || !u?.password) {
          return res.status(400).json({
            error: `adminUsers[${i}]: email and password are required`,
          });
        }
      }

      const slug = String(body.tenant.slug).trim().toLowerCase().replace(/\s+/g, '-');
      const existingOrg = await prisma.org.findUnique({ where: { slug } });
      if (existingOrg) {
        return res.status(400).json({
          error: 'A tenant with this slug already exists',
        });
      }

      // Assign "Admin" role to new tenant users via role_user (no org_id filter on role).
      const adminRole = await prisma.role.findFirst({
        where: { name: { equals: 'Admin', mode: 'insensitive' } },
      });
      if (!adminRole) {
        return res.status(500).json({
          error: 'Admin role not found. Run setup-metadata to seed roles.',
        });
      }

      const settingsStr =
        typeof body.tenant.settings === 'string'
          ? body.tenant.settings
          : JSON.stringify(body.tenant.settings || {});

      const orgId = `org_${slug.replace(/[^a-z0-9_-]/g, '_')}`;

      // Hash all passwords before the transaction (bcrypt is CPU-bound)
      const hashedPasswords = await Promise.all(
        body.adminUsers.map((u) => bcrypt.hash(u.password, 10))
      );

      const { org, userIds } = await prisma.$transaction(async (tx) => {
        const org = await tx.org.create({
          data: {
            id: orgId,
            name: body.tenant.name.trim(),
            slug,
            settings: settingsStr,
            active_subscription: true,
          },
        });

        const userIds: string[] = [];
        for (let i = 0; i < body.adminUsers.length; i++) {
          const u = body.adminUsers[i];
          const email = String(u.email).trim().toLowerCase();
          const user = await tx.user.create({
            data: {
              email,
              name: u.name?.trim() || null,
              password: hashedPasswords[i],
              external_id: email,
              auth_provider: 'local',
              org_id: org.id,
            },
          });

          await tx.role_user.create({
            data: {
              role_id: adminRole.id,
              user_id: user.id,
              org_id: org.id,
            },
          });
          userIds.push(user.id);
        }

        return { org, userIds };
      });

      logger.info('Tenant onboarded', {
        orgId: org.id,
        slug: org.slug,
        userCount: userIds.length,
      });

      return res.status(201).json({
        success: true,
        orgId: org.id,
        userIds,
      });
    } catch (err: any) {
      logger.error('Onboard tenant error', { error: err?.message, stack: err?.stack });
      if (err?.code === 'P2002') {
        const target = err?.meta?.target as string[] | undefined;
        if (target?.includes('email')) {
          return res.status(400).json({
            error: 'A user with one of these emails already exists',
          });
        }
        if (target?.includes('slug')) {
          return res.status(400).json({
            error: 'A tenant with this slug already exists',
          });
        }
      }
      return res.status(500).json({
        error: err?.message || 'Failed to onboard tenant',
      });
    }
  }
);

interface DemoDatabaseResetBody {
  demoData: string;
  /** If true, append `--demo-data-only` (skip full schema reset; only load demo data). Default false. */
  demoDataOnly?: boolean;
  /** If true, run tests (omit `--skip-tests`). Default false (append `--skip-tests`, same as UI default). */
  runTests?: boolean;
}

adminRouter.post(
  '/demo-database-reset',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!isDemoDatabaseResetApiEnabled()) {
        return res.status(403).json({
          error:
            'Demo database reset API is disabled. Set ALLOW_DEMO_RESET_API=true to enable (required in production).',
        });
      }

      const context = (req as any).context?.auth;
      if (!context?.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const isSA = await isSuperAdmin(context.user.id);
      if (!isSA) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }

      if (demoResetInProgress) {
        return res.status(409).json({
          error: 'A demo database reset is already running. Wait for it to finish.',
        });
      }

      if (devOptionsSyncInProgress) {
        return res.status(409).json({
          error: 'Developer options sync is in progress. Wait for it to finish.',
        });
      }

      const body = req.body as DemoDatabaseResetBody;
      const raw = typeof body?.demoData === 'string' ? body.demoData.trim().toLowerCase() : '';
      if (!raw || !DEMO_DATA_OPTIONS.includes(raw as DemoDataOption)) {
        return res.status(400).json({
          error: `demoData must be one of: ${DEMO_DATA_OPTIONS.join(', ')}`,
        });
      }
      const demoData = raw as DemoDataOption;

      const demoDataOnly = body?.demoDataOnly === true;
      const runTests = body?.runTests === true;

      const backendRoot = getBackendRootDir();
      const setupScript = path.join(backendRoot, 'setup-db.js');
      if (!fs.existsSync(setupScript)) {
        logger.error('setup-db.js not found', { setupScript, backendRoot });
        return res.status(500).json({ error: 'setup-db.js not found on server' });
      }

      const setupArgs = [setupScript, `--demo-data=${demoData}`];
      if (demoDataOnly) {
        setupArgs.push('--demo-data-only');
      }
      if (!runTests) {
        setupArgs.push('--skip-tests');
      }

      demoResetInProgress = true;

      const child = spawn(process.execPath, setupArgs, {
        cwd: backendRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.on('error', (err) => {
        demoResetInProgress = false;
        logger.error('demo-database-reset spawn failed', { err: err?.message, demoData, demoDataOnly, runTests });
      });

      if (!child.stdout || !child.stderr) {
        demoResetInProgress = false;
        return res.status(500).json({ error: 'Failed to spawn process (no stdio pipes)' });
      }

      pipeSetupStreamToConsole(child.stdout, 'stdout');
      pipeSetupStreamToConsole(child.stderr, 'stderr');

      child.on('close', (code, signal) => {
        demoResetInProgress = false;
        logger.info('demo-database-reset finished', { demoData, demoDataOnly, runTests, code, signal });
      });

      logger.info('demo-database-reset started', { demoData, demoDataOnly, runTests });

      return res.status(202).json({
        success: true,
        message:
          'Database reset started in the background. This may take several minutes. Watch the backend server logs for progress.',
      });
    } catch (err: any) {
      logger.error('demo-database-reset error', { error: err?.message, stack: err?.stack });
      demoResetInProgress = false;
      return res.status(500).json({
        error: err?.message || 'Failed to start demo database reset',
      });
    }
  }
);

adminRouter.post(
  '/dev-options/sync-metadata',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!isDevOptionsApiEnabled()) {
        return res.status(403).json({
          error:
            'Developer options API is disabled. Set ALLOW_DEV_OPTIONS_API=true to enable (required in production).',
        });
      }

      const context = (req as any).context?.auth;
      if (!context?.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const isSA = await isSuperAdmin(context.user.id);
      if (!isSA) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }

      if (devOptionsSyncInProgress) {
        return res.status(409).json({
          error: 'A metadata sync is already running. Wait for it to finish.',
        });
      }

      if (demoResetInProgress) {
        return res.status(409).json({
          error: 'A demo database reset is in progress. Wait for it to finish.',
        });
      }

      devOptionsSyncInProgress = true;

      try {
        const stats = await syncMetadataFromJson();
        logger.info('dev-options sync-metadata finished', { stats });
        return res.status(200).json({
          success: true,
          message:
            'Views, prompt templates, and agent templates were synced from the repo into this database.',
          stats,
          agentTemplatesSeeded: stats.agentTemplatesSeeded,
        });
      } catch (err: any) {
        logger.error('dev-options sync-metadata failed', {
          error: err?.message,
          stack: err?.stack,
        });
        return res.status(500).json({
          error: err?.message || 'Metadata sync failed',
        });
      } finally {
        devOptionsSyncInProgress = false;
      }
    } catch (err: any) {
      logger.error('dev-options sync-metadata error', { error: err?.message, stack: err?.stack });
      devOptionsSyncInProgress = false;
      return res.status(500).json({
        error: err?.message || 'Failed to run metadata sync',
      });
    }
  }
);

// ─── Chart of Accounts Setup ──────────────────────────────────────────────────

const COA_TEMPLATE_MAP: Record<string, { relativePath: string; currency: string }> = {
  'indian':     { relativePath: 'prisma/setup-IN/chart-of-accounts.json',          currency: 'INR' },
  'us-ca':      { relativePath: 'prisma/setup-US_CA/chart-of-accounts.json',       currency: 'USD' },
  'perfin':     { relativePath: 'prisma/setup-PERFIN/chart-of-accounts.json',      currency: 'USD' },
  'nri-india':  { relativePath: 'prisma/setup-NRI/chart-of-accounts-india.json',   currency: 'INR' },
  'nri-canada': { relativePath: 'prisma/setup-NRI/chart-of-accounts-canada.json',  currency: 'CAD' },
};

function getBackendRootDir(): string {
  // dist/rest/*.js or src/rest/*.ts → backend root (two levels up)
  return path.join(__dirname, '..', '..');
}

adminRouter.post(
  '/seed-model-data',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const context = (req as any).context?.auth;
      if (!context?.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const isSA = await isSuperAdmin(context.user.id);
      if (!isSA) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }

      const body = req.body as {
        entityId?: string;
        model?: string;
        profile?: string;
      };

      const entityId = typeof body.entityId === 'string' ? body.entityId.trim() : '';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      const profile = typeof body.profile === 'string' ? body.profile.trim() : '';

      if (!entityId) {
        return res.status(400).json({ error: 'entityId is required' });
      }

      // Future models: extend this allowlist and dispatch to model-specific seeder.
      if (model !== 'payment_terms') {
        return res.status(400).json({ error: 'model must be payment_terms' });
      }

      // Future profiles: expand supported values per model as more templates are extracted.
      if (profile !== 'indian-demo') {
        return res.status(400).json({ error: 'profile must be indian-demo' });
      }

      const entity = await prisma.entity.findUnique({ where: { id: entityId } });
      if (!entity) {
        return res.status(404).json({ error: `Entity not found: ${entityId}` });
      }

      const { seedPaymentTermsFromCsv } = loadRuntimeModule<{
        seedPaymentTermsFromCsv: SeedPaymentTermsFromCsvFn;
      }>('../../prisma/setup-IN/setup-indian-demo');
      const shouldApplyLegalEntity = modelHasField('payment_terms', 'legal_entity_id');
      const counts = await seedPaymentTermsFromCsv({
        prismaClient: prisma,
        orgIdOverride: entity.org_id,
        legalEntityIdOverride: shouldApplyLegalEntity ? entityId : undefined,
        profileLabel: profile,
      });

      return res.status(200).json({
        success: true,
        entityId,
        orgId: entity.org_id,
        model,
        profile,
        counts,
      });
    } catch (err: any) {
      logger.error('seed-model-data error', { error: err?.message, stack: err?.stack });
      return res.status(500).json({
        error: err?.message || 'Failed to seed model data',
      });
    }
  }
);

adminRouter.post(
  '/setup-chart-of-accounts',
  authMiddleware,
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!(await isSuperAdmin(userId))) {
      return res.status(403).json({ error: 'Super Admin role required' });
    }

    const { entityId, coaTemplate } = req.body as { entityId?: string; coaTemplate?: string };

    if (!entityId || typeof entityId !== 'string') {
      return res.status(400).json({ error: 'entityId is required' });
    }
    if (!coaTemplate || !COA_TEMPLATE_MAP[coaTemplate]) {
      return res.status(400).json({
        error: `coaTemplate must be one of: ${Object.keys(COA_TEMPLATE_MAP).join(', ')}`,
      });
    }

    const entity = await prisma.entity.findUnique({ where: { id: entityId } });
    if (!entity) {
      return res.status(404).json({ error: `Entity not found: ${entityId}` });
    }

    const orgId = entity.org_id;
    const { relativePath, currency } = COA_TEMPLATE_MAP[coaTemplate];
    const absoluteTemplatePath = path.join(getBackendRootDir(), relativePath);

    if (!fs.existsSync(absoluteTemplatePath)) {
      return res.status(500).json({
        error: `COA template file not found on server: ${relativePath}`,
      });
    }

    try {
      const { setupChartOfAccounts } = loadRuntimeModule<{
        setupChartOfAccounts: SetupChartOfAccountsFn;
      }>('../../prisma/setup-chart-of-accounts');
      const result = await setupChartOfAccounts(orgId, entityId, absoluteTemplatePath, currency, prisma);

      return res.status(200).json({
        success: true,
        entityId,
        orgId,
        template: coaTemplate,
        currency,
        counts: { created: result.created, existing: result.existing, total: result.accounts.size },
      });
    } catch (err: any) {
      logger.error('setup-chart-of-accounts error', { error: err?.message, stack: err?.stack });
      return res.status(500).json({ error: err?.message || 'Failed to setup chart of accounts' });
    }
  }
);

export default adminRouter;
