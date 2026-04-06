
import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import FlowProcessSelector from '../FlowProcessSelector';
import FlowDiagramRenderer from './FlowDiagramRenderer';
import EmptyFlowState from '../EmptyFlowState';

interface FlowDiagramContainerProps {
  selectedProcess: string;
  onProcessChange: (process: string) => void;
  processes: string[];
  nodes: any[];
  edges: any[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (params: any) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: any) => void;
}

const FlowDiagramContainer: React.FC<FlowDiagramContainerProps> = ({
  selectedProcess,
  onProcessChange,
  processes,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEdgeContextMenu,
}) => {
  return (
    <Card className="shadow-lg">
      <CardHeader className="bg-slate-50 dark:bg-slate-800 rounded-t-lg p-4">
        <FlowProcessSelector
          selectedProcess={selectedProcess}
          onProcessChange={onProcessChange}
          processes={processes}
        />
      </CardHeader>
      <CardContent className="p-0 h-[70vh]">
        {selectedProcess ? (
          <FlowDiagramRenderer
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeContextMenu={onEdgeContextMenu}
            hasContent={true}
          />
        ) : (
          <EmptyFlowState />
        )}
      </CardContent>
    </Card>
  );
};

export default FlowDiagramContainer;
