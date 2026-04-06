
import { supabase } from '@/integrations/supabase/client';
import { Role, RoleFormData } from '@/models/Role';
import { toast } from 'sonner';

export const getRoles = async (): Promise<Role[]> => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('role_name');

    if (error) {
      throw error;
    }

    // Make sure we never return undefined or empty string role names
    return (data || []).map(role => ({
      ...role, 
      role_name: role.role_name || 'Unnamed Role'
    })) as Role[];
  } catch (error) {
    toast.error('Failed to fetch roles');
    console.error('Error fetching roles:', error);
    return [];
  }
};

export const getRoleById = async (id: string): Promise<Role | null> => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return data as Role;
  } catch (error) {
    toast.error('Failed to fetch role');
    console.error('Error fetching role:', error);
    return null;
  }
};

export const createRole = async (role: RoleFormData): Promise<Role | null> => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .insert([role])
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Role created successfully');
    return data as Role;
  } catch (error) {
    toast.error('Failed to create role');
    console.error('Error creating role:', error);
    return null;
  }
};

export const updateRole = async (id: string, role: RoleFormData): Promise<Role | null> => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .update(role)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Role updated successfully');
    return data as Role;
  } catch (error) {
    toast.error('Failed to update role');
    console.error('Error updating role:', error);
    return null;
  }
};

export const deleteRole = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    toast.success('Role deleted successfully');
    return true;
  } catch (error) {
    toast.error('Failed to delete role');
    console.error('Error deleting role:', error);
    return false;
  }
};

export const getRolesWithUsers = async (): Promise<(Role & { user: { username: string } })[]> => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select(`
        *,
        user:app_users(username)
      `)
      .order('role_name');

    if (error) {
      throw error;
    }

    // Make sure we never return undefined or empty string role names
    return (data || []).map(item => ({
      ...item, 
      role_name: item.role_name || 'Unnamed Role'
    }));
  } catch (error) {
    toast.error('Failed to fetch roles with users');
    console.error('Error fetching roles with users:', error);
    return [];
  }
};
