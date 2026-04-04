
import React from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap
} from 'reactflow';
import 'reactflow/dist/style.css';
import CustomStateNode from '../nodes/CustomStateNode';
import FlowPanel from '../FlowPanel';

interface FlowDiagramRendererProps {
  nodes: any[];
  edges: any[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (params: any) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: any) => void;
  hasContent: boolean;
}

const FlowDiagramRenderer: React.FC<FlowDiagramRendererProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEdgeContextMenu,
  hasContent
}) => {
  // Define the node types mapping
  const nodeTypes = {
    custom: CustomStateNode,
  };

  if (!hasContent) {
    return null;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onEdgeContextMenu={onEdgeContextMenu}
      nodeTypes={nodeTypes}
      fitView
      deleteKeyCode="Delete"
      nodesDraggable
      nodesConnectable
      elementsSelectable
      snapToGrid
    >
      <FlowPanel />
      <Controls />
      <MiniMap 
        nodeStrokeColor="#7028a0"
        nodeColor="#d9cae8"
        nodeBorderRadius={8}
      />
      <Background color="#f8f8f8" gap={16} size={1} />
    </ReactFlow>
  );
};

export default FlowDiagramRenderer;
