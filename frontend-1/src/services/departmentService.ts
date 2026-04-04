
import { supabase } from '@/integrations/supabase/client';
import { Department, DepartmentFormData } from '@/models/Department';
import { toast } from 'sonner';

export const getDepartments = async (): Promise<Department[]> => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('dept_name');

    if (error) {
      throw error;
    }

    return data as Department[];
  } catch (error) {
    toast.error('Failed to fetch departments');
    console.error('Error fetching departments:', error);
    return [];
  }
};

export const getDepartmentById = async (id: string): Promise<Department | null> => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return data as Department;
  } catch (error) {
    toast.error('Failed to fetch department');
    console.error('Error fetching department:', error);
    return null;
  }
};

export const createDepartment = async (department: DepartmentFormData): Promise<Department | null> => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .insert([department])
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Department created successfully');
    return data as Department;
  } catch (error) {
    toast.error('Failed to create department');
    console.error('Error creating department:', error);
    return null;
  }
};

export const updateDepartment = async (id: string, department: DepartmentFormData): Promise<Department | null> => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .update(department)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Department updated successfully');
    return data as Department;
  } catch (error) {
    toast.error('Failed to update department');
    console.error('Error updating department:', error);
    return null;
  }
};

export const deleteDepartment = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    toast.success('Department deleted successfully');
    return true;
  } catch (error) {
    toast.error('Failed to delete department');
    console.error('Error deleting department:', error);
    return false;
  }
};

export const getDepartmentsWithOrganizations = async (): Promise<(Department & { organization: { org_name: string } })[]> => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select(`
        *,
        organization:organizations(org_name)
      `)
      .order('dept_name');

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    toast.error('Failed to fetch departments with organizations');
    console.error('Error fetching departments with organizations:', error);
    return [];
  }
};
