import prisma from '../../lib/prisma';
import { PermissionService } from '../../services/permissions/PermissionService';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';

/**
 * Get user by Slack user ID from external_config
 * Follows the same pattern as auth middleware
 */
export async function getUserBySlackId(slackUserId: string): Promise<AuthContext | null> {
    try {
        // Query user where external_config->'slack'->>'userID' matches
        // Note: Using "userID" (camelCase) as per your data structure
        const user = await prisma.$queryRaw<Array<{
            id: string;
            email: string;
            org_id: string | null;
            name: string | null;
        }>>`
      SELECT id, email, org_id, name
      FROM "user"
      WHERE (external_config->'slack'->>'userID')::text = ${slackUserId}
      LIMIT 1
    `;

        if (!user || user.length === 0) {
            logger.warn('User not found for Slack ID', { slackUserId });
            return null;
        }

        const dbUser = user[0];

        if (!dbUser.org_id) {
            logger.warn('User found but has no org_id', { userId: dbUser.id, slackUserId });
            return null;
        }

        // Get permissions using PermissionService (same as auth middleware)
        const permissions = await PermissionService.getUserPermissions(dbUser.id);
        logger.debug('Permissions fetched for Slack user', {
            userId: dbUser.id,
            slackUserId,
            models: Object.keys(permissions)
        });

        // Create AuthContext (same structure as auth middleware)
        const authContext: AuthContext = {
            user: {
                id: dbUser.id,
                email: dbUser.email,
                org_id: dbUser.org_id,
                name: dbUser.name
            },
            permissions
        };

        return authContext;
    } catch (error) {
        logger.error('Error getting user by Slack ID', { error, slackUserId });
        return null;
    }
}

