
import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Role } from '@/models/Role';

interface NodeEditFormProps {
  stateName: string;
  roleValue: string | null;
  roles: Role[];
  onStateNameChange: (value: string) => void;
  onRoleValueChange: (value: string | null) => void;
  onSave: () => void;
  onCancel: () => void;
}

const NodeEditForm: React.FC<NodeEditFormProps> = ({
  stateName,
  roleValue,
  roles,
  onStateNameChange,
  onRoleValueChange,
  onSave,
  onCancel
}) => {
  // Ensure roles is always an array even if it's undefined
  const safeRoles = roles || [];
  
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        <Input 
          value={stateName} 
          onChange={(e) => onStateNameChange(e.target.value)}
          className="text-sm"
          placeholder="State name"
        />
      </div>
      <div>
        <Select 
          value={roleValue || 'none'} 
          onValueChange={(value) => onRoleValueChange(value === 'none' ? null : value)}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {safeRoles.map((role) => (
              <SelectItem key={role.id} value={role.role_name}>
                {role.role_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end space-x-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          <Check className="h-3 w-3 mr-1" />
          Save
        </Button>
      </div>
    </div>
  );
};

export default NodeEditForm;
