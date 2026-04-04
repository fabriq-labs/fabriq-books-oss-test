
import React, { useState } from 'react';
import { ArrowRightCircle, Plus } from 'lucide-react';
import { FlowTransition } from '@/models/FlowTransition';
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

interface FlowTransitionListProps {
  flowTransitions: FlowTransition[];
  processName: string;
  onEdit: (transition: FlowTransition) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onBack: () => void;
}

const FlowTransitionList: React.FC<FlowTransitionListProps> = ({ 
  flowTransitions, 
  processName,
  onEdit, 
  onDelete, 
  onAdd,
  onBack
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTransitions = flowTransitions.filter(
    (transition) => 
      transition.from_state.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transition.to_state.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transition.label_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={onBack}>
        Back to Flow States
      </Button>

      <ListCard
        title={`Transitions for ${processName}`}
        icon={<ArrowRightCircle className="h-6 w-6" />}
        onSearch={setSearchTerm}
        searchValue={searchTerm}
        searchPlaceholder="Search transitions..."
        actionButton={
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Transition
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From State</TableHead>
              <TableHead>To State</TableHead>
              <TableHead>Transition Label</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransitions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4 text-gray-500">
                  No transitions found
                </TableCell>
              </TableRow>
            ) : (
              filteredTransitions.map((transition) => (
                <TableRow key={transition.id}>
                  <TableCell>{transition.from_state}</TableCell>
                  <TableCell>{transition.to_state}</TableCell>
                  <TableCell>{transition.label_name}</TableCell>
                  <TableCell>
                    <ActionButtons
                      id={transition.id}
                      onEdit={() => onEdit(transition)}
                      onDelete={onDelete}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListCard>
    </div>
  );
};

export default FlowTransitionList;
