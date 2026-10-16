import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PauseCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AgentSession, PendingAction } from '@/contexts/AgentSessionContext';
import { getActionType } from './actions/registry';

interface AwaitingApprovalViewProps {
  session: AgentSession;
  pendingActions: PendingAction[];
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onBulkApprove: (batchId: string, confidence?: 'high' | 'medium' | 'low') => Promise<void>;
}

const confidenceColors: Record<string, string> = {
  high: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
};

export const AwaitingApprovalView: React.FC<AwaitingApprovalViewProps> = ({
  session,
  pendingActions,
  onApprove,
  onReject,
  onBulkApprove,
}) => {
  const navigate = useNavigate();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const pending = pendingActions.filter((a) => a.status === 'pending');
  const resolved = pendingActions.filter((a) => a.status !== 'pending');

  const highCount = pending.filter((a) => a.confidence === 'high').length;

  // Group by batch_id
  const batchIds = [...new Set(pending.map((a) => a.batch_id).filter(Boolean) as string[])];
  const firstBatchId = batchIds[0];

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApprove = async (id: string) => {
    setProcessingIds((p) => new Set(p).add(id));
    await onApprove(id);
    setProcessingIds((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  const handleReject = async (id: string) => {
    setProcessingIds((p) => new Set(p).add(id));
    await onReject(id, 'Rejected by user');
    setProcessingIds((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header banner */}
      <div className="px-6 py-4 border-b bg-orange-50/70 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PauseCircle className="h-5 w-5 text-orange-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-800">
              {pending.length} action{pending.length !== 1 ? 's' : ''} waiting for your review
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Review each proposed change before it's written to your books.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {highCount > 0 && firstBatchId && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => onBulkApprove(firstBatchId, 'high')}
            >
              Approve {highCount} high-confidence
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 text-gray-600"
            onClick={() => navigate(`/workbench/inbox?session=${session.id}`)}
          >
            Open in Inbox
          </Button>
        </div>
      </div>

      {/* Action list */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-2">
        {pending.map((action) => {
          const isExpanded = expandedIds.has(action.id);
          const isProcessing = processingIds.has(action.id);
          const entry = getActionType(action.action_type);
          const summary = entry.renderRowSummary(action);
          return (
            <div
              key={action.id}
              className="border rounded-lg bg-white overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0', entry.badgeClass)}>
                  <entry.icon className="h-3 w-3" />
                  {entry.label}
                </span>
                <Badge
                  variant="outline"
                  className={cn('text-[10px] h-5 px-1.5 shrink-0 capitalize', confidenceColors[action.confidence])}
                >
                  {action.confidence}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{summary.primary}</p>
                  {summary.secondary && (
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{summary.secondary}</p>
                  )}
                </div>
                {summary.amount && (
                  <span className="text-xs font-semibold text-gray-700 tabular-nums shrink-0">{summary.amount}</span>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => toggleExpand(action.id)}
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded
                      ? <ChevronUp className="h-3.5 w-3.5" />
                      : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
                    disabled={isProcessing}
                    onClick={() => handleReject(action.id)}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs px-2 bg-green-600 hover:bg-green-700"
                    disabled={isProcessing}
                    onClick={() => handleApprove(action.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>

              {/* Expanded payload view */}
              {isExpanded && (
                <div className="border-t bg-gray-50 px-4 py-3">
                  <pre className="text-[11px] text-gray-600 whitespace-pre-wrap break-all max-h-48 overflow-auto">
                    {JSON.stringify(action.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {/* Resolved section */}
        {resolved.length > 0 && (
          <div className="pt-4">
            <p className="text-xs text-gray-400 mb-2">Resolved ({resolved.length})</p>
            <div className="space-y-1">
              {resolved.map((action) => (
                <div key={action.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-xs">
                  {action.status === 'executed' || action.status === 'approved' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  )}
                  <span className="text-gray-500 truncate">{action.title}</span>
                  <span className="ml-auto text-gray-400 capitalize shrink-0">{action.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
