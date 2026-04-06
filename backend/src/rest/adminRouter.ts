import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import logger from '../utils/logger';

const adminRouter = Router();

/** Check if the given user id has the Super Admin role. */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const roleUser = await prisma.role_user.findFirst({
    where: { user_id: userId },
    include: { role: true },
  });
  return roleUser?.role?.name?.toLowerCase().includes('super admin') ?? false;
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

export default adminRouter;
