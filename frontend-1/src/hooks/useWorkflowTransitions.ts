
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FlowTransition } from '@/models/FlowTransition';
import { PurchaseRequisition } from '@/models/PurchaseRequisition';
import { toast } from 'sonner';

export const useWorkflowTransitions = (
  processName: string,
  currentState: string | undefined = 'Draft', // Default to Draft if not specified
  recordId: string | undefined
) => {
  const [transitions, setTransitions] = useState<FlowTransition[]>([]);
  const [loading, setLoading] = useState(false);
  const [transitionLoading, setTransitionLoading] = useState(false);

  useEffect(() => {
    // Only fetch transitions if we have a current state to work with
    if (currentState) {
      fetchTransitions();
    } else {
      // If currentState is undefined, set default transitions for 'Draft' state
      fetchTransitions('Draft');
    }
  }, [currentState, processName]);

  const fetchTransitions = async (stateToUse = currentState) => {
    setLoading(true);
    try {
      // Get the flow_id for the process
      const { data: flowStates, error: flowStateError } = await supabase
        .from('flow_states')
        .select('flow_id')
        .eq('process_name', processName)
        .limit(1);

      if (flowStateError) {
        throw flowStateError;
      }

      if (flowStates && flowStates.length > 0) {
        const flowId = flowStates[0].flow_id;

        // Get transitions from the current state
        const { data: transitionData, error: transitionError } = await supabase
          .from('flow_transitions')
          .select('*')
          .eq('flow_id', flowId)
          .eq('from_state', stateToUse);

        if (transitionError) {
          throw transitionError;
        }

        setTransitions(transitionData || []);
      }
    } catch (error) {
      console.error('Error fetching transitions:', error);
      // toast.error('Failed to fetch workflow transitions');
    } finally {
      setLoading(false);
    }
  };

  const executeTransition = async (toState: string) => {
    if (!recordId) return false;

    setTransitionLoading(true);
    try {
      // Update the PR status to the new state
      const { error } = await supabase
        .from('purchase_requisitions')
        .update({ pr_status: toState })
        .eq('id', recordId);

      if (error) {
        throw error;
      }

      toast.success(`Purchase requisition status updated to ${toState}`);
      return true;
    } catch (error) {
      console.error('Error executing transition:', error);
      toast.error('Failed to update status');
      return false;
    } finally {
      setTransitionLoading(false);
    }
  };

  // Get the first available transition to move from Draft to the next state
  const getFirstTransition = () => {
    if (transitions && transitions.length > 0) {
      return transitions[0];
    }
    return null;
  };

  return {
    transitions,
    loading,
    transitionLoading,
    executeTransition,
    getFirstTransition
  };
};
