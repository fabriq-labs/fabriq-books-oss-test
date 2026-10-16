import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

/** Platform admin is the Super Admin role. The name match is the existing admin check. */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const roleUsers = await prisma.role_user.findMany({
    where: { user_id: userId },
    include: { role: true },
  });
  return roleUsers.some((ru) => ru.role?.name?.toLowerCase().includes('super admin'));
}

export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.context?.auth?.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const allowed = req.context?.auth?.isPlatformAdmin ?? await isSuperAdmin(user.id);
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}
