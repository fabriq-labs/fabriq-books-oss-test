
import React, { useState } from 'react';
import { Handle, Position } from 'reactflow';
import NodeDisplay from './components/NodeDisplay';
import NodeEditForm from './components/NodeEditForm';
import { Role } from '@/models/Role';

interface CustomStateNodeProps {
  id: string;
  data: {
    label: string;
    role: string | null;
    visibleTo: string[] | null;
    roles: Role[];
    onNodeUpdate: (id: string, data: { state?: string; assigned_role?: string | null }) => void;
  };
}

const CustomStateNode: React.FC<CustomStateNodeProps> = ({ id, data }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [stateName, setStateName] = useState(data.label);
  const [roleValue, setRoleValue] = useState<string | null>(data.role);

  // Ensure we have valid roles or an empty array
  const roles = data.roles || [];

  const handleSave = () => {
    // Save changes
    data.onNodeUpdate(id, {
      state: stateName,
      assigned_role: roleValue
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset to original values
    setStateName(data.label);
    setRoleValue(data.role);
    setIsEditing(false);
  };

  return (
    <>
      <Handle type="target" position={Position.Top} className="w-2 h-2" />
      <div className="p-4 rounded-lg border-2 border-primary/30 bg-white shadow-md min-w-[200px]">
        {isEditing ? (
          <NodeEditForm
            stateName={stateName}
            roleValue={roleValue}
            roles={roles}
            onStateNameChange={setStateName}
            onRoleValueChange={setRoleValue}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : (
          <NodeDisplay
            label={data.label}
            role={data.role}
            visibleTo={data.visibleTo || []}
            onEditClick={() => setIsEditing(true)}
          />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </>
  );
};

export default CustomStateNode;
