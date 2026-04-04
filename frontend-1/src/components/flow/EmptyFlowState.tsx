
import React from 'react';
import { ArrowRightCircle } from 'lucide-react';

const EmptyFlowState: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-gray-500">
      <ArrowRightCircle className="h-16 w-16 mb-4 opacity-30" />
      <p className="text-lg">Select a process to view and edit its flow diagram</p>
      <p className="text-sm mt-2">
        Drag between states to create transitions. Right-click on transitions to delete them.
      </p>
    </div>
  );
};

export default EmptyFlowState;
