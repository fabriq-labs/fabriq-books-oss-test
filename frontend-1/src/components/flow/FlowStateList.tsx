
import React, { useState } from 'react';
import { ActivitySquare, Plus } from 'lucide-react';
import { FlowState } from '@/models/FlowState';
import { ListCard } from '@/components/ui/list-card';
import { ActionButtons } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface FlowStateListProps {
  flowStates: FlowState[];
  onEdit: (flowState: FlowState) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onManageTransitions: (flowState: FlowState) => void;
}

const FlowStateList: React.FC<FlowStateListProps> = ({ 
  flowStates, 
  onEdit, 
  onDelete, 
  onAdd,
  onManageTransitions
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredFlowStates = flowStates.filter(
    (flowState) => 
      flowState.process_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      flowState.state.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ListCard
      title="Flow States"
      icon={<ActivitySquare className="h-6 w-6" />}
      onSearch={setSearchTerm}
      searchValue={searchTerm}
      searchPlaceholder="Search flow states..."
      actionButton={
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Flow State
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Process Name</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Assigned Role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredFlowStates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-4 text-gray-500">
                No flow states found
              </TableCell>
            </TableRow>
          ) : (
            filteredFlowStates.map((flowState) => (
              <TableRow key={flowState.id}>
                <TableCell>{flowState.process_name}</TableCell>
                <TableCell>{flowState.state}</TableCell>
                <TableCell>{flowState.assigned_role || 'None'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onManageTransitions(flowState)}
                      className="mr-2"
                    >
                      Manage Transitions
                    </Button>
                    <ActionButtons
                      id={flowState.id}
                      onEdit={() => onEdit(flowState)}
                      onDelete={onDelete}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ListCard>
  );
};

export default FlowStateList;
