
import React from 'react';
import { Users, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NodeDisplayProps {
  label: string;
  role: string | null;
  visibleTo: string[] | null;
  onEditClick: () => void;
}

const NodeDisplay: React.FC<NodeDisplayProps> = ({
  label,
  role,
  visibleTo,
  onEditClick
}) => {
  // Ensure visibleTo is always an array
  const safeVisibleTo = visibleTo || [];
  
  return (
    <>
      <div className="flex justify-between items-start">
        <div className="font-bold text-lg text-primary mb-2">{label}</div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="p-1 h-6 w-6" 
          onClick={onEditClick}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      </div>
      {role && (
        <div className="flex items-center justify-center text-xs text-gray-600 bg-slate-100 p-2 rounded mb-2">
          <Users className="h-3 w-3 mr-1" />
          <span>{role}</span>
        </div>
      )}
      {safeVisibleTo.length > 0 && (
        <div className="text-xs text-gray-500 border-t pt-2 mt-2">
          <div className="font-semibold mb-1">Visible to:</div>
          <div className="flex flex-wrap gap-1">
            {safeVisibleTo.map((email, index) => (
              <span key={index} className="bg-slate-100 px-1 rounded">{email}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default NodeDisplay;
