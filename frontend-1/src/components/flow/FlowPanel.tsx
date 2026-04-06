
import React from 'react';
import { Panel } from 'reactflow';

const FlowPanel: React.FC = () => {
  return (
    <Panel position="top-left" className="bg-white p-2 rounded shadow mt-2 ml-2 text-xs text-gray-500">
      <p>Drag between states to create transitions.</p>
      <p>Right-click on transitions to delete them.</p>
    </Panel>
  );
};

export default FlowPanel;
