
export interface Department {
  id: string;
  dept_name: string;
  location: string | null;
  org_id: string;
  created_at: string;
  updated_at: string;
}

export type DepartmentFormData = Omit<Department, 'id' | 'created_at' | 'updated_at'>;
