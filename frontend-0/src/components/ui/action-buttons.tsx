
import React from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Eye, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionButtonsProps {
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  id: string;
  className?: string;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onView,
  onEdit,
  onDelete,
  onDuplicate,
  id,
  className
}) => {
  return (
    <div className={cn("flex justify-end gap-1", className)}>
      {onView && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onView(id)}
          className="h-8 w-8 text-green-600 hover:bg-green-100 hover:text-green-700"
        >
          <Eye size={16} />
        </Button>
      )}
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(id)}
          className="h-8 w-8 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
        >
          <Pencil size={16} />
        </Button>
      )}
      {onDuplicate && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDuplicate(id)}
          className="h-8 w-8 text-slate-600 hover:bg-slate-100 hover:text-slate-700"
        >
          <Copy size={16} />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(id)}
          className="h-8 w-8 text-red-600 hover:bg-red-100 hover:text-red-700"
        >
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  );
};
