
import { supabase } from '@/integrations/supabase/client';
import { FlowTransition, FlowTransitionFormData } from '@/models/FlowTransition';
import { toast } from 'sonner';

export const getFlowTransitionsByFlowId = async (flowId: string): Promise<FlowTransition[]> => {
  try {
    const { data, error } = await supabase
      .from('flow_transitions')
      .select('*')
      .eq('flow_id', flowId)
      .order('from_state');

    if (error) {
      throw error;
    }

    return data as FlowTransition[];
  } catch (error) {
    toast.error('Failed to fetch flow transitions');
    console.error('Error fetching flow transitions:', error);
    return [];
  }
};

export const getFlowTransitionById = async (id: string): Promise<FlowTransition | null> => {
  try {
    const { data, error } = await supabase
      .from('flow_transitions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return data as FlowTransition;
  } catch (error) {
    toast.error('Failed to fetch flow transition');
    console.error('Error fetching flow transition:', error);
    return null;
  }
};

export const createFlowTransition = async (transition: FlowTransitionFormData): Promise<FlowTransition | null> => {
  try {
    const { data, error } = await supabase
      .from('flow_transitions')
      .insert([transition as any])
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Flow transition created successfully');
    return data as FlowTransition;
  } catch (error) {
    toast.error('Failed to create flow transition');
    console.error('Error creating flow transition:', error);
    return null;
  }
};

export const updateFlowTransition = async (id: string, transition: FlowTransitionFormData): Promise<FlowTransition | null> => {
  try {
    const { data, error } = await supabase
      .from('flow_transitions')
      .update(transition as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    toast.success('Flow transition updated successfully');
    return data as FlowTransition;
  } catch (error) {
    toast.error('Failed to update flow transition');
    console.error('Error updating flow transition:', error);
    return null;
  }
};

export const deleteFlowTransition = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('flow_transitions')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    toast.success('Flow transition deleted successfully');
    return true;
  } catch (error) {
    toast.error('Failed to delete flow transition');
    console.error('Error deleting flow transition:', error);
    return false;
  }
};

export const deleteFlowTransitionsByFlowId = async (flowId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('flow_transitions')
      .delete()
      .eq('flow_id', flowId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error deleting flow transitions:', error);
    return false;
  }
};
