import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware } from '../auth/middleware';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import logger from '../utils/logger';
import { isSuperAdmin } from '../auth/platformAdmin';
const adminRouter = Router();

let indianDemoReconResetInProgress = false;
let nriTaxPackageResetInProgress = false;
let legalEntityDropInProgress = false;

export { isSuperAdmin } from '../auth/platformAdmin';

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


/** Prod demo names. The loader that accepted these values is not in this tree. */
const DEMO_DATA_OPTIONS = [
  'indian-demo',
  'us-ca-demo',
  'perfin-demo',
  'both',
  'nri',
] as const;

type DemoDataOption = (typeof DEMO_DATA_OPTIONS)[number];

let demoResetInProgress = false;

/** Pipe a child process stdout/stderr to the server process stdout. */
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
        logger.error('prod demo loader is not in this tree', { setupScript, backendRoot });
        return res.status(410).json({ error: 'The prod demo database loader is not in this tree.' });
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

adminRouter.post('/dev-options/sync-metadata', authMiddleware, async (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'The prod metadata JSON catalog was removed. Views are seeded in TypeScript.',
  });
});

// ─── Chart of Accounts Setup ──────────────────────────────────────────────────

const COA_TEMPLATE_MAP: Record<string, { relativePath: string; currency: string }> = {
  indian: { relativePath: 'prisma/setup-IN/chart-of-accounts.json', currency: 'INR' },
  'us-ca': { relativePath: 'prisma/setup-US_CA/chart-of-accounts.json', currency: 'USD' },
  perfin: { relativePath: 'prisma/setup-PERFIN/chart-of-accounts.json', currency: 'USD' },
  'nri-india': { relativePath: 'prisma/setup-NRI/chart-of-accounts-india.json', currency: 'INR' },
  'nri-canada': { relativePath: 'prisma/setup-NRI/chart-of-accounts-canada.json', currency: 'CAD' },
};

adminRouter.post('/seed-model-data', authMiddleware, async (_req: Request, res: Response) => {
  return res.status(501).json({ error: 'Domain seed endpoints are added by the domain, not the kernel.' });
});

adminRouter.post('/setup-chart-of-accounts', authMiddleware, async (_req: Request, res: Response) => {
  return res.status(501).json({ error: 'Domain setup endpoints are added by the domain, not the kernel.' });
});

export default adminRouter;
