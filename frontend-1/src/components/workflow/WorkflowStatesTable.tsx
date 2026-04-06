import React, { useState } from "react";
import { workflowManagementAPI } from "@/api/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Edit, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkflowStateModal from "./WorkflowStateModal";

interface WorkflowState {
  id: string;
  name: string;
  description?: string;
  sequence: number;
  is_initial: boolean;
  is_final: boolean;
  is_active: boolean;
  skip: boolean;
  skip_target_state_id?: string | null;
  assigned_for: string;
  assigned_role_id?: string;
  assigned_user_id?: string;
  assigned_expression?: string;
  source_actions?: WorkflowAction[];
  assigned_role?: {
    id: string;
    name: string;
  };
  assigned_user?: {
    id: string;
    name: string;
    email: string;
  };
}

interface WorkflowAction {
  id: string;
  name: string;
  description?: string;
  target_state_id: string;
  target_state: WorkflowState;
  side_effects?: Record<string, unknown>;
}

interface WorkflowStatesTableProps {
  states: WorkflowState[];
  flowId: string;
  onStateUpdated: () => void;
}

const WorkflowStatesTable: React.FC<WorkflowStatesTableProps> = ({
  states,
  flowId,
  onStateUpdated,
}) => {
  const { toast } = useToast();
  const [editingState, setEditingState] = useState<WorkflowState | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const getAssignedDisplay = (state: WorkflowState) => {
    if (state.assigned_for === 'ROLE' && state.assigned_role) {
      return <span>Role: <strong>{state.assigned_role.name}</strong></span>;
    } else if (state.assigned_for === 'USER' && state.assigned_user) {
      return <span>User: <strong>{state.assigned_user.name}</strong></span>;
    } else if (state.assigned_for === 'EXPRESSION' && state.assigned_expression) {
      return <span className="font-mono text-xs">{state.assigned_expression}</span>;
    }
    return <span className="text-gray-400">Not assigned</span>;
  };

  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    // Add drag styling
    (e.target as HTMLElement).classList.add('opacity-50');
  };

  const handleDragEnd = (e: React.DragEvent<HTMLTableRowElement>) => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    (e.target as HTMLElement).classList.remove('opacity-50');
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent<HTMLTableRowElement>, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    setIsReordering(true);
    setDragOverIndex(null);

    try {
      // Reorder the states array
      const newStates = [...states];
      const [draggedState] = newStates.splice(draggedIndex, 1);
      newStates.splice(dropIndex, 0, draggedState);

      // Create batch update with new sequences
      const updates = newStates.map((state, index) => ({
        id: state.id,
        sequence: index,
      }));

      await workflowManagementAPI.batchUpdateStates(flowId, updates);

      toast({
        title: "Success",
        description: "States reordered successfully",
      });

      onStateUpdated();
    } catch (error: any) {
      console.error("Error reordering states:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reorder states",
        variant: "destructive",
      });
    } finally {
      setDraggedIndex(null);
      setIsReordering(false);
    }
  };

  return (
    <>
      <div className="border rounded-lg relative">
        {isReordering && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reordering...
            </div>
          </div>
        )}
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead>Assignment</TableHead>
              <TableHead className="w-28">Skip</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {states.map((state, index) => (
              <TableRow
                key={state.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                className={`
                  cursor-grab active:cursor-grabbing transition-colors
                  ${dragOverIndex === index ? 'bg-blue-50 border-t-2 border-blue-400' : ''}
                  ${draggedIndex === index ? 'opacity-50' : ''}
                `}
              >
                <TableCell className="w-10">
                  <div className="flex items-center justify-center text-gray-400 hover:text-gray-600">
                    <GripVertical className="h-4 w-4" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{state.name}</div>
                  {state.description && (
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                      {state.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {state.is_initial && (
                      <Badge variant="default" className="text-xs">Initial</Badge>
                    )}
                    {state.is_final && (
                      <Badge variant="secondary" className="text-xs">Final</Badge>
                    )}
                    {!state.is_initial && !state.is_final && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {getAssignedDisplay(state)}
                </TableCell>
                <TableCell>
                  {state.skip ? (
                    <div className="space-y-0.5">
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        Skip
                      </Badge>
                      {state.skip_target_state_id && (
                        <div className="text-xs text-gray-500">
                          → {states.find(s => s.id === state.skip_target_state_id)?.name || 'Unknown'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        state.is_active ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                    <span className="text-xs text-gray-600">
                      {state.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingState(state)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {states.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No states found for this workflow.
          </div>
        )}
      </div>

      <WorkflowStateModal
        open={editingState !== null}
        onClose={() => setEditingState(null)}
        state={editingState}
        allStates={states}
        flowId={flowId}
        onSaved={onStateUpdated}
      />
    </>
  );
};

export default WorkflowStatesTable;
