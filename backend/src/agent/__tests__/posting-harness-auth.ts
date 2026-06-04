/**
 * Resolve test user/org for posting prompt harnesses.
 * Defaults: user_sanjay_gupta / org_indian_demo (indian demo data, same as v2 e2e tests).
 */

import prisma from '../../lib/prisma';
import { PermissionService } from '../../services/permissions/PermissionService';
import { AuthContext } from '../../auth/types';

export const DEFAULT_TEST_USER_ID = 'user_sanjay_gupta';
export const DEFAULT_TEST_ORG_ID = 'org_indian_demo';

export async function resolveTestUser() {
    const userId = process.env.TEST_USER_ID || DEFAULT_TEST_USER_ID;
    const byId = await prisma.user.findUnique({ where: { id: userId } });
    if (byId) return byId;

    if (process.env.TEST_USER_ID) {
        console.warn(`TEST_USER_ID not found (${process.env.TEST_USER_ID}), trying email fallback`);
    }

    if (process.env.TEST_USER_EMAIL) {
        const byEmail = await prisma.user.findUnique({ where: { email: process.env.TEST_USER_EMAIL } });
        if (byEmail) return byEmail;
    }

    const any = await prisma.user.findFirst({ orderBy: { created_at: 'asc' } });
    if (any) {
        console.warn(`Using first user in DB: ${any.email} (${any.id})`);
        return any;
    }

    throw new Error(
        `No user in database (tried id=${userId}). Load indian demo data or set TEST_USER_ID / TEST_USER_EMAIL in backend/.env`
    );
}

export async function resolveTestOrgId(userId: string, userOrgId: string | null | undefined): Promise<string> {
    const preferredOrgId = process.env.TEST_ORG_ID || DEFAULT_TEST_ORG_ID;
    const preferredOrg = await prisma.org.findUnique({ where: { id: preferredOrgId }, select: { id: true } });
    if (preferredOrg) return preferredOrgId;

    if (userOrgId) return userOrgId;

    const roleUser = await prisma.role_user.findFirst({
        where: { user_id: userId },
        select: { org_id: true },
    });
    if (roleUser?.org_id) return roleUser.org_id;

    const org = await prisma.org.findFirst({ select: { id: true }, orderBy: { created_at: 'asc' } });
    if (org?.id) return org.id;

    throw new Error(
        `No org found (tried ${preferredOrgId}). Set TEST_ORG_ID in backend/.env or load indian demo data.`
    );
}

export async function buildTestAuthContext(): Promise<AuthContext> {
    const user = await resolveTestUser();
    const orgId = await resolveTestOrgId(user.id, user.org_id);
    const permissions = await PermissionService.getUserPermissions(user.id);

    console.log(`Test user: ${user.email} (${user.id}), org: ${orgId}`);

    return {
        user: {
            id: user.id,
            email: user.email || '',
            name: user.name,
            org_id: orgId,
        },
        permissions,
    };
}
