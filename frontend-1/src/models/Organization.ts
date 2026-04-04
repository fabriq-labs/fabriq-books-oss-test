
export interface Organization {
  id: string;
  org_name: string;
  legal_name: string;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export type OrganizationFormData = Omit<Organization, 'id' | 'created_at' | 'updated_at'>;
