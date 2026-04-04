import { PrismaClient } from '@prisma/client';
import { AuthContext } from '../auth/types';

export type ModelName = string;

export interface QueryOptions {
  where?: any;
  orderBy?: any;
  skip?: number;
  take?: number;
  include?: any;
  select?: any;
}

export type PermissionOperation = 'read' | 'write';

export interface PermissionResult {
  allowed: boolean;
  filteredFields?: string[];
  error?: string;
}

export interface PermissionContext {
  user?: {
    id: string;
    email: string;
  };
  permissions?: {
    [model: string]: {
      [field: string]: 'read' | 'write' | 'none';
    };
  };
}

export interface DataAccessOptions {
  context: PermissionContext;
  operation: PermissionOperation;
  model: ModelName;
  query?: QueryOptions;
  data?: any;
}

export interface DataAccessResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metaData?: any;
  message?: string;
  workflow_context?: any;
  total?: number;
  page?: number;
  pageSize?: number;
} 