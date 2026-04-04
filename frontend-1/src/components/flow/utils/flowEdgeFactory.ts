
import { Edge, MarkerType } from 'reactflow';
import { FlowTransition } from '@/models/FlowTransition';

export const createEdgesFromTransitions = (
  flowTransitions: FlowTransition[],
  processFlowId: string
): Edge[] => {
  const transitionEdges: Edge[] = flowTransitions
    .filter(transition => transition.flow_id === processFlowId)
    .map(transition => ({
      id: transition.id,
      source: transition.from_state,
      target: transition.to_state,
      label: transition.label_name,
      labelStyle: { fill: '#6b7280', fontWeight: 500 },
      labelBgStyle: { fill: '#f8fafc' },
      animated: true,
      style: { stroke: '#7028a0', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#7028a0',
      },
    }));

  return transitionEdges;
};

export const createEdgeFromParams = (
  id: string,
  source: string,
  target: string,
  label: string
): Edge => {
  return {
    id,
    source,
    target,
    label,
    labelStyle: { fill: '#6b7280', fontWeight: 500 },
    labelBgStyle: { fill: '#f8fafc' },
    animated: true,
    style: { stroke: '#7028a0', strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#7028a0',
    },
  };
};
