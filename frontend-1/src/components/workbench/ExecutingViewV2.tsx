import React from 'react';
import { Wifi, WifiOff, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSession } from '@/contexts/AgentSessionContext';
import type { SessionEvent, ConnectionStatus } from '@/hooks/useSessionEvents';
import { StepCard } from './StepCard';

interface ExecutingViewV2Props {
  session: AgentSession;
  events: SessionEvent[];
  connectionStatus: ConnectionStatus;
  onClarify: (answer: string) => Promise<void>;
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') return null;
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs shrink-0',
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

export const ExecutingViewV2: React.FC<ExecutingViewV2Props> = ({
  session,
  events,
  connectionStatus,
  onClarify,
}) => {
  const plan = session.plan || [];
  const currentIdx = session.current_step_index ?? 0;
  const isAwaitingInput = session.status === 'awaiting_input';

  if (plan.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 p-6">
        <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 animate-pulse" />
        Waiting for plan…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Connection badge only if not connected */}
      {connectionStatus !== 'connected' && (
        <div className="px-5 pt-3 flex justify-end">
          <ConnectionBadge status={connectionStatus} />
        </div>
      )}

      <div className="flex-1 overflow-auto px-5 py-4 space-y-2">
        {plan.map((step, i) => {
          const stepEvents = events.filter(
            (e) => e.data?.step_index === step.index || e.data?.step_index === i
          );
          const isCurrent = i === currentIdx;
          const isStepAwaiting = isAwaitingInput && isCurrent;

          return (
            <StepCard
              key={step.index}
              step={step}
              isCurrent={isCurrent}
              isAwaiting={isStepAwaiting}
              clarification={isStepAwaiting ? session.clarification_request : null}
              events={stepEvents}
              onClarify={onClarify}
            />
          );
        })}
      </div>
    </div>
  );
};
