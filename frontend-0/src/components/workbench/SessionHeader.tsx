import React from 'react';
import { Check, Loader2, Circle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSession, PlanStep } from '@/contexts/AgentSessionContext';

export type ViewMode = 'v1' | 'v2';

interface SessionHeaderProps {
  session: AgentSession;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

const modeLabels: Record<string, string> = {
  supervised: 'Supervised',
  semi_auto: 'Semi-Auto',
  autonomous: 'Autonomous',
};

function StepDot({
  step,
  isCurrent,
  isAwaiting,
}: {
  step: PlanStep;
  isCurrent: boolean;
  isAwaiting: boolean;
}) {
  const isDone = step.status === 'completed';
  const isActive = isCurrent && !isDone && !isAwaiting;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'h-6 w-6 rounded-full flex items-center justify-center border-2 transition-colors',
          isDone && 'bg-green-500 border-green-500 text-white',
          isAwaiting && 'border-amber-400 bg-amber-50 text-amber-600',
          isActive && 'border-amber-400 bg-amber-50 text-amber-600',
          !isDone && !isActive && !isAwaiting && 'border-gray-200 bg-white text-gray-300'
        )}
      >
        {isDone ? (
          <Check className="h-3.5 w-3.5" />
        ) : isAwaiting ? (
          <HelpCircle className="h-3.5 w-3.5" />
        ) : isActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Circle className="h-2.5 w-2.5 fill-current" />
        )}
      </div>
      <span
        className={cn(
          'text-[10px] leading-tight text-center max-w-[64px] truncate',
          isDone && 'text-green-600',
          (isActive || isAwaiting) && 'text-amber-600 font-medium',
          !isDone && !isActive && !isAwaiting && 'text-gray-400'
        )}
        title={step.title}
      >
        {step.title}
      </span>
    </div>
  );
}

function SessionHeaderInner({
  session,
  viewMode,
  onViewModeChange,
}: SessionHeaderProps) {
  const plan = session.plan || [];
  const currentIdx = session.current_step_index ?? 0;
  const isAwaitingInput = session.status === 'awaiting_input';

  return (
    <div className="border-b bg-white px-5 py-3 flex flex-col gap-3">
      {/* Goal + mode + view toggle */}
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold text-gray-800 truncate flex-1" title={session.goal}>
          {session.name || session.goal}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-gray-400 bg-gray-100 rounded px-2 py-0.5">
            {modeLabels[session.mode] || session.mode}
          </span>
          {onViewModeChange && (
            <div className="flex items-center border border-gray-200 rounded overflow-hidden text-[11px]">
              {(['v1', 'v2'] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => onViewModeChange(m)}
                  className={cn(
                    'px-2 py-0.5 transition-colors',
                    viewMode === m
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-50'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step progress bar */}
      {plan.length > 0 && (
        <div className="flex items-start gap-0">
          {plan.map((step, i) => (
            <React.Fragment key={step.index}>
              <StepDot
                step={step}
                isCurrent={i === currentIdx}
                isAwaiting={isAwaitingInput && i === currentIdx}
              />
              {i < plan.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mt-3 mx-1 rounded transition-colors',
                    step.status === 'completed' ? 'bg-green-300' : 'bg-gray-200'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export const SessionHeader = React.memo(SessionHeaderInner, (prev, next) => {
  if (prev.viewMode !== next.viewMode) return false;
  if (prev.onViewModeChange !== next.onViewModeChange) return false;
  const a = prev.session;
  const b = next.session;
  if (a === b) return true;
  return (
    a.name === b.name &&
    a.goal === b.goal &&
    a.mode === b.mode &&
    a.status === b.status &&
    a.current_step_index === b.current_step_index &&
    a.plan === b.plan
  );
});
