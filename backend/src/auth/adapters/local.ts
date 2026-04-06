import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AuthAdapter, AuthContext, AuthProviderConfig } from '../types';
import jwt from 'jsonwebtoken';
import logger from '../../utils/logger';

export class LocalAuthAdapter implements AuthAdapter {
  private config: AuthProviderConfig;
  private readonly JWT_SECRET: string;

  constructor(config: AuthProviderConfig) {
    this.config = config;
    this.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
  }

  async authenticate(req: ExpressRequest, res: ExpressResponse): Promise<AuthContext> {
    const token = this.extractToken(req);
    if (!token) {
      throw new Error('No token found');
    }

    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as {
        sub: string;
        email: string;
        name?: string;
        iat: number;
        exp: number;
      };

      return {
        user: {
          id: decoded.sub,  // Use sub field as external ID
          email: decoded.email,
          name: decoded.name || decoded.email,
          org_id: 'dummy-org-id' // TODO: Remove this once we fix the type error
        }
      };
    } catch (error) {
      logger.error('Token verification failed', { error });
      throw new Error('Invalid token');
    }
  }

  async getUserId(req: ExpressRequest): Promise<string | null> {
    try {
      const token = this.extractToken(req);
      if (!token) return null;

      const decoded = jwt.verify(token, this.JWT_SECRET) as { sub: string };
      return decoded.sub;
    } catch {
      return null;
    }
  }

  async isAuthenticated(req: ExpressRequest): Promise<boolean> {
    return !!this.getUserId(req);
  }

  private extractToken(req: ExpressRequest): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return null;

    return token;
  }

  // Helper method to generate a token for testing
  generateToken(userId: string, email: string): string {
    return jwt.sign(
      { id: userId, email },
      this.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }
} 