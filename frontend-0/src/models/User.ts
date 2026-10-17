import { RoleUser } from '@/utils/roleUtils';

export interface User {
  role_users: RoleUser[];
  id: string;
  email: string;
  name?: string | null;
  external_id: string; // For external auth systems
  auth_provider?: string | null; // e.g., 'clerk', 'supertokens', 'internal'
  created_at: string;
  modified_at: string;
  created_by?: string | null; // Reference to user.id
  modified_by?: string | null; // Reference to user.id
  org_id?: string | null;
  manager_id?: string | null; // Reference to manager's user id
  department_id?: string | null;

  // Optional related data (for when fetching with joins)
  org?: {
    id: string;
    name: string;
    logo?: string | null;
    customer_timezone?: string | null;
    basecurrency_id?: string | null;
    currency_master?: {
      id: string;
      name: string | null;
      base_currency: string;
      from_currency: string;
      effective_from: string;
      currency_value: number;
      status: string;
    } | null;
  } | null;

  manager?: {
    id: string;
    name?: string | null;
    email: string;
  } | null;

  reports?: User[];

  department?: {
    id: string;
    name: string;
  } | null;
}

export type UserFormData = Omit<User, 'id' | 'created_at' | 'modified_at' | 'org' | 'manager' | 'reports' | 'department'>;

// Legacy fields for backward compatibility (deprecated)
export interface LegacyUser {
  id: string;
  username: string;
  email: string;
  password?: string;
  dept_id?: string | null;
  status: 'Active' | 'Inactive';
  created_at?: string;
  updated_at?: string;
}

export type LegacyUserFormData = Omit<LegacyUser, 'id' | 'created_at' | 'updated_at'>;
