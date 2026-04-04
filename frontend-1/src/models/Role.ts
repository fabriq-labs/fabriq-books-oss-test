
export interface Role {
  id: string;
  user_id: string;
  email: string;
  role_name: string;
  created_at: string;
  updated_at: string;
}

export type RoleFormData = Omit<Role, 'id' | 'created_at' | 'updated_at'>;
