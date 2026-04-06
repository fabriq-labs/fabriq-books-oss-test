
import { Node } from 'reactflow';
import { FlowState } from '@/models/FlowState';
import { Role } from '@/models/Role';

export const createNodesFromStates = (
  states: FlowState[],
  roles: Role[],
  onNodeUpdate: (nodeId: string, data: { state?: string; assigned_role?: string | null }) => void
): Node[] => {
  // Ensure roles is always an array
  const safeRoles = roles || [];
  
  return states.map((state) => ({
    id: state.state,
    type: 'custom',
    position: {
      x: Math.random() * 500,
      y: Math.random() * 500,
    },
    data: {
      label: state.state,
      role: state.assigned_role,
      visibleTo: state.visible_to,
      roles: safeRoles,
      onNodeUpdate,
    },
  }));
};
