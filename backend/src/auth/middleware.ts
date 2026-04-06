import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { AuthContext } from './types';
import { AuthAdapterFactory } from './adapters/factory';
import logger from '../utils/logger';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import { PermissionService } from '../services/permissions/PermissionService';

// Get the auth provider from environment
const authProvider = (process.env.AUTH_PROVIDER || 'local') as 'clerk' | 'auth0' | 'cognito' | 'local';

// Initialize the auth adapter through the factory
const authAdapter = AuthAdapterFactory.getInstance().getAdapter({
  provider: authProvider,
  secretKey: process.env.AUTH_SECRET_KEY,
  publicKey: process.env.AUTH_PUBLIC_KEY,
  issuer: process.env.AUTH_ISSUER
});

// Extend Express Request type to include auth context
declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export const authMiddleware = async (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => {
  try {
    // Check if this is an introspection query or HTML page to load the GraphQL Playground
    const isIntrospectionQuery = req.body?.operationName === 'IntrospectionQuery' ||
      (req.query.operationName === 'IntrospectionQuery' && req.method === 'GET');

    if (isIntrospectionQuery) {
      (req as any).context = { auth: null };
      return next();
    }

    // Log request details
    // logger.debug('New request received', {
    //   method: req.method,
    //   path: req.path,
    //   body: req.body,
    //   query: req.query
    // });

    // Check for API key authentication first
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      try {
        // Find all users with a non-null api_key
        const usersWithApiKey = await prisma.user.findMany({
          where: { api_key: { not: null } },
          select: { id: true, email: true, org_id: true, name: true, api_key: true }
        });

        let matchedUser = null;
        for (const u of usersWithApiKey) {
          if (u.api_key && await bcrypt.compare(apiKey, u.api_key)) {
            matchedUser = u;
            break;
          }
        }

        if (!matchedUser || !matchedUser.org_id) {
          return res.status(401).json({ error: 'Invalid API key' });
        }

        const permissions = await PermissionService.getUserPermissions(matchedUser.id);
        const context: AuthContext = {
          user: {
            id: matchedUser.id,
            email: matchedUser.email,
            org_id: matchedUser.org_id,
            name: matchedUser.name
          },
          permissions
        };

        (req as any).context = { auth: context };
        return next();
      } catch (error) {
        logger.error('API key authentication failed', {
          error: error instanceof Error ? error.message : error
        });
        return res.status(401).json({ error: 'API key authentication failed' });
      }
    }

    try {
      // First try to authenticate - this will verify the token
      const authContext = await authAdapter.authenticate(req, res);

      // Get the user from our database
      const user = await prisma.user.findUnique({
        where: { external_id: authContext.user?.id },
        select: {
          id: true,
          email: true,
          org_id: true,
          name: true,
        }
      });

      if (!user || !user.org_id) {
        logger.warn('User not found (or with no org) in database', { userId: authContext.user?.id });
        return res.status(401).json({ error: 'User not found (or with no org) in database' });
      }

      // Get permissions using PermissionService
      const permissions = await PermissionService.getUserPermissions(user.id);
      // logger.debug('Permissions fetched', {
      //   userId: user.id,
      //   models: Object.keys(permissions)
      // });

      // Create final context with user and permissions
      const context: AuthContext = {
        user: {
          id: user.id,
          email: user.email,
          org_id: user.org_id,
          name: user.name
        },
        permissions
      };

      // logger.debug('Context created for user', {
      //   userId: context.user.id,
      //   orgId: context.user.org_id,
      //   name: context.user.name
      // });

      // Attach context to request
      (req as any).context = { auth: context };
    } catch (error) {
      logger.error('Authentication failed', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        errorType: typeof error,
        errorString: String(error)
      });
      // Continue without authentication
    }
    next();
  } catch (error) {
    logger.error('Auth middleware error:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error,
      errorString: String(error)
    });
    next();
  }
};

export const requireAuth = async (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => {
  const isAuth = await authAdapter.isAuthenticated(req);
  if (!isAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}; 