import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { AuthAdapter, AuthContext, AuthProviderConfig } from '../types';
import logger from '../../utils/logger';
import { verifyToken } from '@clerk/clerk-sdk-node';

// Extend Express Request type to include auth property
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId?: string;
      };
    }
  }
}

export class ClerkAuthAdapter implements AuthAdapter {
  private config: AuthProviderConfig;

  constructor(config: AuthProviderConfig) {
    if (!config.secretKey) {
      throw new Error('Clerk secret key is required');
    }
    this.config = config;
  }

  async authenticate(req: ExpressRequest, res: ExpressResponse): Promise<AuthContext> {
    const token = this.extractToken(req);
    if (!token) {
      throw new Error('No token found');
    }

    try {
      // Verify the session token using Clerk's networkless verification
      const decoded = await verifyToken(token, {
        secretKey: this.config.secretKey!
      });

      if (!decoded || !decoded.sub) {
        throw new Error('Invalid token');
      }

      // Get the user details
      const user = await clerkClient.users.getUser(decoded.sub);
      if (!user) {
        throw new Error('User not found');
      }

      return {
        user: {
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress || '',
          name: user.fullName || '',
          imageUrl: user.imageUrl,
          role: user.publicMetadata.role as string || 'user',
          metadata: user.publicMetadata,
          org_id: user.publicMetadata.org_id as string || '',
        },
        session: {
          id: user.id,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        }
      };
    } catch (error) {
      logger.error('Token verification failed', { error });
      throw new Error('Invalid token');
    }
  }

  async getUserId(req: ExpressRequest): Promise<string | null> {
    const token = this.extractToken(req);
    if (!token) return null;

    try {
      const decoded = await verifyToken(token, {
        secretKey: this.config.secretKey!
      });
      return decoded?.sub || null;
    } catch {
      return null;
    }
  }

  async isAuthenticated(req: ExpressRequest): Promise<boolean> {
    const userId = await this.getUserId(req);
    return !!userId;
  }

  private extractToken(req: ExpressRequest): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return null;

    return token;
  }
} 