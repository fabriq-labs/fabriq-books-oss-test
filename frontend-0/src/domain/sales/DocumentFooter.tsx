import React from 'react';
import { Button } from '@/components/ui/button';
import type { DocumentAction } from './documentActions';

type Props = {
  actions: DocumentAction[];
  busy?: boolean;
  onAction: (id: DocumentAction['id']) => void;
};

export function DocumentFooter({ actions, busy, onAction }: Props) {
  if (!actions.length) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t bg-background/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            variant={action.variant ?? (action.primary ? 'default' : 'outline')}
            disabled={busy}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default DocumentFooter;
