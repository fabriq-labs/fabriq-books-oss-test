import React from 'react';
import { Loader2, Wrench, CheckCircle2, ChevronRight, Wifi, WifiOff, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSession } from '@/contexts/AgentSessionContext';
import type { SessionEvent, ConnectionStatus } from '@/hooks/useSessionEvents';

interface ExecutingViewProps {
  session: AgentSession;
  events: SessionEvent[];
  connectionStatus: ConnectionStatus;
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') return null;
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs',
      status === 'reconnecting' && 'bg-amber-50 text-amber-600 border border-amber-200',
      status === 'offline' && 'bg-red-50 text-red-600 border border-red-200',
      status === 'connecting' && 'bg-blue-50 text-blue-600 border border-blue-200',
    )}>
      {status === 'reconnecting' && <RotateCcw className="h-3 w-3 animate-spin" />}
      {status === 'offline' && <WifiOff className="h-3 w-3" />}
      {status === 'connecting' && <Wifi className="h-3 w-3 animate-pulse" />}
      <span className="capitalize">{status}</span>
    </div>
  );
}

function eventLabel(event: SessionEvent): { icon: React.ReactNode; text: string } {
  const { type, data } = event;
  switch (type) {
    case 'step_started':
      return {
        icon: <ChevronRight className="h-3.5 w-3.5 text-blue-500" />,
        text: `Step ${(data.step_index ?? 0) + 1}: ${data.title || ''}`,
      };
    case 'step_completed':
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
        text: data.result_preview
          ? `Completed: ${data.result_preview}`
          : `Step ${(data.step_index ?? 0) + 1} complete`,
      };
    case 'tool_called':
      return {
        icon: <Wrench className="h-3.5 w-3.5 text-violet-400" />,
        text: `${data.tool_name || data.tool || 'tool'} called`,
      };
    case 'action_queued':
      return {
        icon: <span className="h-3.5 w-3.5 flex items-center justify-center text-orange-500 font-bold text-xs">!</span>,
        text: `Action queued: ${data.title || data.action_type || ''}`,
      };
    case 'session_status_changed':
      return {
        icon: <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />,
        text: `Status → ${data.status}`,
      };
    default:
      return {
        icon: <ChevronRight className="h-3.5 w-3.5 text-gray-300" />,
        text: type,
      };
  }
}

export const ExecutingView: React.FC<ExecutingViewProps> = ({ session, events, connectionStatus }) => {
  const plan = session.plan || [];
  const currentIdx = session.current_step_index ?? 0;
  const currentStep = plan[currentIdx];

  // Filter to meaningful display events
  const displayEvents = events.filter(
    (e) => ['step_started', 'step_completed', 'tool_called', 'action_queued'].includes(e.type)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Current activity banner */}
      <div className="px-6 py-4 border-b bg-amber-50/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">
                {currentStep ? currentStep.title : 'Agent is running…'}
              </p>
              {currentStep?.description && (
                <p className="text-xs text-gray-500 mt-0.5">{currentStep.description}</p>
              )}
            </div>
          </div>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </div>

      {/* Activity feed */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {displayEvents.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Waiting for activity…
          </div>
        ) : (
          <div className="space-y-1.5">
            {displayEvents.map((event, i) => {
              const { icon, text } = eventLabel(event);
              return (
                <div key={event.id || i} className="flex items-start gap-2.5 text-xs text-gray-600">
                  <span className="mt-0.5 shrink-0">{icon}</span>
                  <span className="leading-relaxed">{text}</span>
                </div>
              );
            })}
            {/* Trailing spinner */}
            <div className="flex items-center gap-2.5 text-xs text-gray-300 pt-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>Working…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
