
import React from 'react';
import { FlowState } from '@/models/FlowState';
import { FlowTransition } from '@/models/FlowTransition';
import { useFlowDiagram } from './hooks/useFlowDiagram';
import FlowDiagramContainer from './diagram/FlowDiagramContainer';

interface FlowDiagramViewProps {
  flowStates: FlowState[];
  flowTransitions: FlowTransition[];
  onFlowTransitionsChange: (flowId: string) => void;
}

const FlowDiagramView: React.FC<FlowDiagramViewProps> = ({
  flowStates,
  flowTransitions,
  onFlowTransitionsChange
}) => {
  const {
    selectedProcess,
    setSelectedProcess,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onEdgeContextMenu,
    uniqueProcesses
  } = useFlowDiagram(flowStates, flowTransitions, onFlowTransitionsChange);

  return (
    <FlowDiagramContainer
      selectedProcess={selectedProcess}
      onProcessChange={setSelectedProcess}
      processes={uniqueProcesses}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onEdgeContextMenu={onEdgeContextMenu}
    />
  );
};

export default FlowDiagramView;
