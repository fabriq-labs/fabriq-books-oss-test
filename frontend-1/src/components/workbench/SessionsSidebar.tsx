import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, CheckCircle2, Loader2, PauseCircle, XCircle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAgentSession, type AgentSessionSummary } from '@/contexts/AgentSessionContext';

const statusIcon: Record<string, React.ReactNode> = {
  planning: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
  executing: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />,
  awaiting_approval: <PauseCircle className="h-3.5 w-3.5 text-orange-500" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

function sessionLabel(s: AgentSessionSummary): string {
  // Prefer auto-generated name (4-6 words), fall back to truncated goal
  if (s.name) return s.name;
  return s.goal.length > 42 ? s.goal.slice(0, 42) + '…' : s.goal;
}

export const SessionsSidebar: React.FC = () => {
  const { sessions, inboxCount } = useAgentSession();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const location = useLocation();

  const isInbox = location.pathname.startsWith('/workbench/inbox');

  return (
    <div className="w-60 border-r bg-gray-50/50 flex flex-col h-full shrink-0">
      {/* Top buttons */}
      <div className="p-3 border-b flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start text-sm font-medium h-8 gap-2 text-gray-700 hover:text-gray-900"
          onClick={() => navigate('/workbench')}
        >
          <Plus className="h-4 w-4" />
          New Session
        </Button>
        <Button
          variant={isInbox ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8 shrink-0 relative"
          title="Inbox"
          onClick={() => navigate('/workbench/inbox')}
        >
          <Inbox className="h-4 w-4" />
          {inboxCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center leading-none">
              {inboxCount > 99 ? '99+' : inboxCount}
            </span>
          )}
        </Button>
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {sessions.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">No sessions yet</p>
          )}
          {sessions.map((s) => {
            const isActive = sessionId === s.id;
            const pendingCount = Math.max(
              0,
              (s.pending_actions_count || 0) - (s.completed_actions_count || 0)
            );
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/workbench/${s.id}`)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-gray-100 border border-transparent'
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    {statusIcon[s.status] || statusIcon.planning}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate leading-tight">
                      {sessionLabel(s)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-gray-400">
                        {formatTime(s.last_active_at || s.started_at)}
                      </span>
                      {pendingCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 text-[10px] bg-orange-100 text-orange-700 border-0"
                        >
                          {pendingCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
