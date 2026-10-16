import { Request as ExpressRequest, Response as ExpressResponse } from 'express';

export interface User {
  id: string;
  email: string;  
  name: string | null;
  imageUrl?: string;
  role?: string;
  metadata?: Record<string, any>;
  org_id: string;
}

export interface Role {
  id: string;
  name: string;
  views: View[];
}

export interface View {
  id: string;
  name: string;
  model: string;
  fields: FieldPermission[];
}

export interface FieldPermission {
  id: string;
  fieldName: string;
  access: 'read' | 'write' | 'none';
}

export interface Permissions {
  [model: string]: {
    [field: string]: 'read' | 'write' | 'none';
  };
}

export interface AuthContext {
  user: User;
  /** True when the user has the Super Admin role. */
  isPlatformAdmin?: boolean;
  permissions?: Permissions;
  model?: string;
  view?: string;
  instance_id?: string;
  session?: {
    id: string;
    iat: number;
    exp: number;
  };
}

export interface JwtPayload {
  id: string;
  email: string;
  iat: number;
  exp: number;
}

export type AuthProvider = 'clerk' | 'auth0' | 'cognito' | 'local';

export interface AuthAdapter {
  authenticate(req: ExpressRequest, res: ExpressResponse): Promise<AuthContext>;
  getUserId(req: ExpressRequest): Promise<string | null>;
  isAuthenticated(req: ExpressRequest): Promise<boolean>;
}

export interface AuthProviderConfig {
  provider: AuthProvider;
  secretKey?: string;
  publicKey?: string;
  issuer?: string;
  // Add more common config options as needed
} 