
export interface Location {
  id: string;
  name: string;
  org_id: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  created_at: string;
  updated_at: string;
  department_id?: string;
}

export interface LocationFormData {
  name: string;
  org_id: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  department_id?: string;
}
