import React, { useEffect } from 'react';
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getActionType } from './actions/registry';
import type { PendingAction } from '@/contexts/AgentSessionContext';

interface ActionDetailDrawerProps {
  action: PendingAction | null;
  isOpen: boolean;
  isProcessing?: boolean;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

export const ActionDetailDrawer: React.FC<ActionDetailDrawerProps> = ({
  action,
  isOpen,
  isProcessing = false,
  onClose,
  onApprove,
  onReject,
}) => {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const entry = action ? getActionType(action.action_type) : null;
  const isPending = action?.status === 'pending';
  const isResolved = action && !isPending;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/20 z-40 transition-opacity',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col',
          'transition-transform duration-200 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b">
          {entry && (
            <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border', entry.badgeClass)}>
              <entry.icon className="h-3 w-3" />
              {entry.label}
            </span>
          )}
          <h3 className="text-sm font-semibold text-gray-800 flex-1 truncate">
            {action?.title || 'Action Detail'}
          </h3>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-auto">
          {!action ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          ) : (
            <>
              {/* Resolved banner */}
              {isResolved && (
                <div className={cn(
                  'px-5 py-3 text-xs font-medium flex items-center gap-2',
                  action.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                )}>
                  {action.status === 'rejected'
                    ? <XCircle className="h-4 w-4" />
                    : <CheckCircle2 className="h-4 w-4" />}
                  <span className="capitalize">{action.status}</span>
                  {action.resolved_by && (
                    <span className="text-gray-400 font-normal">by {action.resolved_by}</span>
                  )}
                </div>
              )}

              {/* Detail component */}
              {entry && <entry.DetailComponent action={action} />}
            </>
          )}
        </div>

        {/* Footer — Approve / Reject (only for pending) */}
        {isPending && (
          <div className="px-5 py-4 border-t flex items-center gap-3 bg-gray-50">
            <Button
              variant="outline"
              className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={isProcessing}
              onClick={() => action && onReject(action.id)}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Reject
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={isProcessing}
              onClick={() => action && onApprove(action.id)}
            >
              {isProcessing
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Approve
            </Button>
          </div>
        )}
      </div>
    </>
  );
};
