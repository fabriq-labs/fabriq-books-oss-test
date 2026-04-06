
import React from 'react';
import { Activity } from 'lucide-react';
import { CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FlowProcessSelectorProps {
  selectedProcess: string;
  onProcessChange: (value: string) => void;
  processes: string[];
}

const FlowProcessSelector: React.FC<FlowProcessSelectorProps> = ({
  selectedProcess,
  onProcessChange,
  processes
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <Activity className="h-6 w-6 mr-2" />
        <CardTitle>Flow Diagram</CardTitle>
      </div>
      <Select
        value={selectedProcess}
        onValueChange={onProcessChange}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Select a process" />
        </SelectTrigger>
        <SelectContent>
          {processes.map((process) => (
            <SelectItem key={process} value={process}>
              {process}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default FlowProcessSelector;
