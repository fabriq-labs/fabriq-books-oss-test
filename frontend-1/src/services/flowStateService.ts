import { supabase } from '@/integrations/supabase/client';
import { FlowState, FlowStateFormData } from '@/models/FlowState';
import { toast } from 'sonner';

export const getFlowStates = async (): Promise<FlowState[]> => {
  try {
    const { data, error } = await supabase
      .from('flow_states')
      .select('*')
      .order('process_name');

    if (error) {
      throw error;
    }

    return data as FlowState[];
  } catch (error) {
    toast.error('Failed to fetch flow states');
    console.error('Error fetching flow states:', error);
    return [];
  }
};

export const getFlowStateById = async (id: string): Promise<FlowState | null> => {
  try {
    const { data, error } = await supabase
      .from('flow_states')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return data as FlowState;
  } catch (error) {
    toast.error('Failed to fetch flow state');
    console.error('Error fetching flow state:', error);
    return null;
  }
};

export const createFlowState = async (flowState: FlowStateFormData): Promise<FlowState | null> => {
  try {
    const { data, error } = await supabase
      .from('flow_states')
      .insert([flowState as any])
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Flow state created successfully');
    return data as FlowState;
  } catch (error) {
    toast.error('Failed to create flow state');
    console.error('Error creating flow state:', error);
    return null;
  }
};

export const updateFlowState = async (id: string, flowState: FlowStateFormData): Promise<FlowState | null> => {
  try {
    const { data, error } = await supabase
      .from('flow_states')
      .update(flowState as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Flow state updated successfully');
    return data as FlowState;
  } catch (error) {
    toast.error('Failed to update flow state');
    console.error('Error updating flow state:', error);
    return null;
  }
};

export const deleteFlowState = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('flow_states')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    toast.success('Flow state deleted successfully');
    return true;
  } catch (error) {
    toast.error('Failed to delete flow state');
    console.error('Error deleting flow state:', error);
    return false;
  }
};

export const updateFlowStateField = async (id: string, field: string, value: any): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('flow_states')
      .update({ [field]: value })
      .eq('id', id);

    if (error) {
      throw error;
    }

    toast.success(`Flow state ${field} updated successfully`);
    return true;
  } catch (error) {
    toast.error(`Failed to update flow state ${field}`);
    console.error(`Error updating flow state ${field}:`, error);
    return false;
  }
};
