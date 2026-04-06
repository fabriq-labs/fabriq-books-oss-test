import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAgentSession, type PendingAction } from '@/contexts/AgentSessionContext';

const confidenceColors: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
};

interface PendingActionRowProps {
  action: PendingAction;
  showActions?: boolean;
}

export const PendingActionRow: React.FC<PendingActionRowProps> = ({ action, showActions = true }) => {
  const { approvePendingAction, rejectPendingAction } = useAgentSession();
  const navigate = useNavigate();
  const { sessionId } = useParams();

  const preview = action.payload?.preview;
  const posting = preview?.posting;
  const match = preview?.match;

  const isResolved = action.status !== 'pending';

  return (
    <div className={`px-4 py-3 border-b last:border-b-0 ${isResolved ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-800 truncate">
              {posting?.description || action.title}
            </span>
            {match?.reference && (
              <>
                <span className="text-gray-400 text-xs shrink-0">-</span>
                <span className="text-xs text-gray-500 truncate">{match.reference}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {posting?.amount != null && (
              <span className="font-medium text-gray-700">
                {Number(posting.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
              </span>
            )}
            {match?.customer && <span>{match.customer}</span>}
            {posting?.date && <span>{posting.date}</span>}
          </div>
        </div>

        <Badge variant="outline" className={`${confidenceColors[action.confidence]} border-0 text-[10px] shrink-0`}>
          {action.confidence.toUpperCase()}
        </Badge>

        {isResolved ? (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {action.status}
          </Badge>
        ) : showActions ? (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-green-600 hover:bg-green-50"
              onClick={() => void approvePendingAction(action.id)}
              title="Approve"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-500 hover:bg-red-50"
              onClick={() => void rejectPendingAction(action.id, 'Rejected from batch list')}
              title="Reject"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-400 hover:bg-gray-50"
              onClick={() => navigate(`/workbench/sessions/${sessionId}/actions/${action.id}`)}
              title="Detail"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
