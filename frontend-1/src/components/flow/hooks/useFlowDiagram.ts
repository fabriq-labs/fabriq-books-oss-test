
import { useState, useEffect, useCallback } from 'react';
import { Connection, Edge, Node, addEdge } from 'reactflow';
import { FlowState } from '@/models/FlowState';
import { FlowTransition } from '@/models/FlowTransition';
import { Role } from '@/models/Role';
import { toast } from '@/components/ui/use-toast';
import { updateFlowStateField } from '@/services/flowStateService';
import { createFlowTransition, deleteFlowTransition } from '@/services/flowTransitionService';
import { createNodesFromStates } from '../utils/flowNodeFactory';
import { createEdgesFromTransitions, createEdgeFromParams } from '../utils/flowEdgeFactory';
import { getRoles } from '@/services/roleService';

export const useFlowDiagram = (
  flowStates: FlowState[],
  flowTransitions: FlowTransition[],
  onFlowTransitionsChange: (flowId: string) => void
) => {
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  
  const uniqueProcesses = [...new Set(flowStates.map(state => state.process_name))];
  
  // Fetch roles for the dropdown
  useEffect(() => {
    const fetchRoles = async () => {
      const rolesData = await getRoles();
      setRoles(rolesData);
    };
    fetchRoles();
  }, []);

  // Convert flow states to nodes and transitions to edges when selected process changes
  useEffect(() => {
    if (!selectedProcess) {
      setNodes([]);
      setEdges([]);
      return;
    }
    
    const processStates = flowStates.filter(state => state.process_name === selectedProcess);
    const processFlowId = processStates.length > 0 ? processStates[0].flow_id : '';
    
    // Create nodes with role information and update handler
    const stateNodes = createNodesFromStates(processStates, roles, handleNodeUpdate);
    const transitionEdges = createEdgesFromTransitions(flowTransitions, processFlowId);
    
    setNodes(stateNodes);
    setEdges(transitionEdges);
  }, [selectedProcess, flowStates, flowTransitions, roles]);
  
  // Handle node updates (name or role)
  const handleNodeUpdate = useCallback(async (nodeId: string, data: { state?: string; assigned_role?: string | null }) => {
    const stateToUpdate = flowStates.find(state => state.state === nodeId);
    
    if (!stateToUpdate) {
      toast({
        title: "Error",
        description: "Could not find the state to update",
        variant: "destructive"
      });
      return;
    }
    
    let updateSuccess = true;
    
    // Update state name if provided
    if (data.state && data.state !== nodeId) {
      updateSuccess = await updateFlowStateField(stateToUpdate.id, 'state', data.state);
      
      // If state name was updated successfully, we need to update all transitions that reference this state
      if (updateSuccess) {
        // This would require updating from_state and to_state in transitions
        // For now, we'll just reload the data
        onFlowTransitionsChange(stateToUpdate.flow_id);
      }
    }
    
    // Update assigned role if provided
    if (data.assigned_role !== undefined && data.assigned_role !== stateToUpdate.assigned_role) {
      updateSuccess = await updateFlowStateField(stateToUpdate.id, 'assigned_role', data.assigned_role);
    }
    
    if (updateSuccess) {
      // Refresh the states after update
      window.location.reload(); // This is a simple solution - in a more sophisticated app, we'd use react-query or similar
      
      toast({
        title: "Success",
        description: "Flow state updated successfully"
      });
    }
  }, [flowStates, onFlowTransitionsChange]);
  
  const onNodesChange = useCallback((changes: any) => {
    setNodes(nds => {
      const newNodes = [...nds];
      changes.forEach((change: any) => {
        if (change.type === 'position' && change.dragging) {
          const index = newNodes.findIndex(n => n.id === change.id);
          if (index !== -1) {
            newNodes[index] = { ...newNodes[index], position: change.position };
          }
        }
      });
      return newNodes;
    });
  }, []);

  const onEdgesChange = useCallback((changes: any) => {
    setEdges(eds => {
      const newEdges = [...eds];
      changes.forEach((change: any) => {
        if (change.type === 'remove') {
          const index = newEdges.findIndex(e => e.id === change.id);
          if (index !== -1) {
            newEdges.splice(index, 1);
          }
        }
      });
      return newEdges;
    });
  }, []);
  
  const onConnect = useCallback(
    async (params: Connection) => {
      // Find the selected process's flow_id
      const currentStates = flowStates.filter(state => state.process_name === selectedProcess);
      if (currentStates.length === 0) return;
      
      const flowId = currentStates[0].flow_id;
      
      try {
        // Create a new transition
        const newTransition = {
          flow_id: flowId,
          from_state: params.source || '',
          to_state: params.target || '',
          label_name: `Transition to ${params.target}`,
        };
        
        const result = await createFlowTransition(newTransition);
        
        if (result) {
          // Update the transitions
          onFlowTransitionsChange(flowId);
          
          // Add the new edge
          if (params.source && params.target) {
            const newEdge = createEdgeFromParams(
              result.id,
              params.source,
              params.target,
              newTransition.label_name
            );
            setEdges(eds => addEdge(newEdge, eds));
          }
          
          toast({
            title: "Success",
            description: "Transition created successfully"
          });
        }
      } catch (error) {
        console.error('Error creating transition:', error);
        toast({
          title: "Error",
          description: "Failed to create transition",
          variant: "destructive"
        });
      }
    },
    [selectedProcess, flowStates, onFlowTransitionsChange]
  );
  
  const onEdgeDelete = useCallback(
    async (edgeId: string) => {
      try {
        const result = await deleteFlowTransition(edgeId);
        
        if (result) {
          // Find the current flow ID to update transitions
          const currentStates = flowStates.filter(state => state.process_name === selectedProcess);
          if (currentStates.length > 0) {
            onFlowTransitionsChange(currentStates[0].flow_id);
          }
          
          // Remove the edge from the diagram
          setEdges(edges => edges.filter(edge => edge.id !== edgeId));
          
          toast({
            title: "Success",
            description: "Transition deleted successfully"
          });
        }
      } catch (error) {
        console.error('Error deleting transition:', error);
        toast({
          title: "Error",
          description: "Failed to delete transition",
          variant: "destructive"
        });
      }
    },
    [selectedProcess, flowStates, onFlowTransitionsChange]
  );
  
  // Custom edge context menu for deletion
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      if (window.confirm('Are you sure you want to delete this transition?')) {
        onEdgeDelete(edge.id);
      }
    },
    [onEdgeDelete]
  );

  return {
    selectedProcess,
    setSelectedProcess,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onEdgeContextMenu,
    uniqueProcesses
  };
};
