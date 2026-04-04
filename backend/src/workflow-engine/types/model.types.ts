import { Prisma } from '@prisma/client';

// Base interface for all models with common fields
export interface BaseModel {
  id: string;
  created_by?: string | null;
  modified_by?: string | null;
  created_at: Date;
  modified_at: Date;
  org_id?: string | null;
  assigned_to?: string | null;
}

// Extended Prisma types with common fields
// Note: GetPayload types require Prisma client to be regenerated
// Using any for now - regenerate Prisma client to fix
export type AccountModel = any & BaseModel;
export type CategoryModel = any & BaseModel;
export type CategoryGroupModel = any & BaseModel;
export type PostingModel = any & BaseModel;
export type InstrumentModel = any & BaseModel;
export type TradeModel = any & BaseModel;

// Type for any model that extends BaseModel
export type AnyModel = BaseModel & {
  [key: string]: any;
};

// Type for any model instance
export type ModelInstance = BaseModel & {
  [key: string]: any;
};

// Type guards for checking model types
export function isAccountModel(model: AnyModel): model is AccountModel {
  return 'sub_type' in model && 'name' in model;
}

export function isCategoryModel(model: AnyModel): model is CategoryModel {
  return 'name' in model && 'color' in model;
}

export function isPostingModel(model: AnyModel): model is PostingModel {
  return 'account_id' in model && 'amount' in model;
}

// User related types
export type UserInclude = {
  manager?: boolean;
  reports?: boolean;
  role_users?: boolean;
};

export type UserSelect = {
  id?: boolean;
  email?: boolean;
  name?: boolean;
  external_id?: boolean;
  auth_provider?: boolean;
  created_at?: boolean;
  modified_at?: boolean;
  manager_id?: boolean;
};

// Note: GetPayload types require Prisma client to be regenerated
// Using any for now - regenerate Prisma client to fix
export type UserModel = any & BaseModel;

export type UserWithManager = {
  id: string;
  email: string;
  name: string | null;
  manager_id: string | null;
} & BaseModel;

// Context types
export interface ModelContext {
  modelType: string;
  modelId: string;
  orgId: string;
}

// Utility type for model creation
export type CreateModel<T extends BaseModel> = Omit<T, 'id' | 'created_at' | 'modified_at'>;

// Utility type for model updates
export type UpdateModel<T extends BaseModel> = Partial<Omit<T, 'id' | 'created_at' | 'modified_at'>>; 