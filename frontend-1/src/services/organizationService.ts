
import { supabase } from '@/integrations/supabase/client';
import { Organization, OrganizationFormData } from '@/models/Organization';
import { toast } from 'sonner';

export const getOrganizations = async (): Promise<Organization[]> => {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('org_name');

    if (error) {
      throw error;
    }

    return data as Organization[];
  } catch (error) {
    toast.error('Failed to fetch organizations');
    console.error('Error fetching organizations:', error);
    return [];
  }
};

export const getOrganizationById = async (id: string): Promise<Organization | null> => {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return data as Organization;
  } catch (error) {
    toast.error('Failed to fetch organization');
    console.error('Error fetching organization:', error);
    return null;
  }
};

export const createOrganization = async (organization: OrganizationFormData): Promise<Organization | null> => {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .insert([organization])
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Organization created successfully');
    return data as Organization;
  } catch (error) {
    toast.error('Failed to create organization');
    console.error('Error creating organization:', error);
    return null;
  }
};

export const updateOrganization = async (id: string, organization: OrganizationFormData): Promise<Organization | null> => {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .update(organization)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Organization updated successfully');
    return data as Organization;
  } catch (error) {
    toast.error('Failed to update organization');
    console.error('Error updating organization:', error);
    return null;
  }
};

export const deleteOrganization = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    toast.success('Organization deleted successfully');
    return true;
  } catch (error) {
    toast.error('Failed to delete organization');
    console.error('Error deleting organization:', error);
    return false;
  }
};
