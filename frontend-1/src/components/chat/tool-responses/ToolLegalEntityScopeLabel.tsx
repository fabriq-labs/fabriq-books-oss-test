import React from 'react';
import { cn } from '@/lib/utils';

interface ToolLegalEntityScopeLabelProps {
  label: string | null | undefined;
  className?: string;
}

/** Entity name from the tool step (legal_entity_ids → legal_entity_names), not the chat header. */
export const ToolLegalEntityScopeLabel: React.FC<ToolLegalEntityScopeLabelProps> = ({
  label,
  className,
}) => {
  if (!label?.trim()) return null;
  return (
    <p className={cn('text-xs text-slate-500', className)}>
      Entity: <span className="font-medium text-slate-700">{label.trim()}</span>
    </p>
  );
};
