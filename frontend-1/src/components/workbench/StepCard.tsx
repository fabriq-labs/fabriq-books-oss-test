import React from 'react';
import { CheckCircle2, XCircle, Loader2, PauseCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanStep, ClarificationRequest } from '@/contexts/AgentSessionContext';
import { ClarificationCard } from './ClarificationCard';
import type { SessionEvent } from '@/hooks/useSessionEvents';

interface StepCardProps {
  step: PlanStep;
  isCurrent: boolean;
  isAwaiting: boolean; // session.status === 'awaiting_input' && isCurrent
  clarification: ClarificationRequest | null;
  events: SessionEvent[]; // filtered to this step's step_index
  onClarify: (answer: string) => Promise<void>;
}

function StatusIcon({ step, isCurrent, isAwaiting }: { step: PlanStep; isCurrent: boolean; isAwaiting: boolean }) {
  if (step.status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />;
  if (step.status === 'failed') return <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
  if (isAwaiting) return <PauseCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  if (isCurrent) return <Loader2 className="h-4 w-4 text-amber-500 animate-spin shrink-0 mt-0.5" />;
  return <div className="h-4 w-4 rounded-full border-2 border-gray-200 shrink-0 mt-0.5" />;
}

function StepCardInner({
  step,
  isCurrent,
  isAwaiting,
  clarification,
  events,
  onClarify,
}: StepCardProps) {
  const isDone = step.status === 'completed';
  const isFailed = step.status === 'failed';
  const hasClarified = step.status === 'completed' &&
    events.some((e) => e.type === 'tool_called' && e.data?.tool_name === 'requestClarification');

  // Tool calls for this step (muted secondary lines) — skip infrastructure tools
  const SKIP_TOOLS = new Set(['getAnalyticsContext', 'createPlan', 'completeStep', 'requestClarification']);
  const toolEvents = events.filter(
    (e) => e.type === 'tool_called' && !SKIP_TOOLS.has(e.data?.tool_name)
  );

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 transition-colors',
        isDone && 'border-green-100 bg-white',
        isFailed && 'border-red-100 bg-red-50/40',
        isAwaiting && 'border-amber-200 bg-amber-50/40',
        isCurrent && !isAwaiting && !isDone && 'border-amber-200 bg-amber-50/30',
        !isCurrent && !isDone && !isFailed && 'border-gray-100 bg-white opacity-60'
      )}
    >
      {/* Header row: status icon + title */}
      <div className="flex items-start gap-2.5">
        <StatusIcon step={step} isCurrent={isCurrent} isAwaiting={isAwaiting} />
        <div className="flex-1 min-w-0">
          {/* Primary line */}
          <p className={cn(
            'text-sm leading-snug',
            isDone ? 'text-gray-800' : isFailed ? 'text-red-700' : 'text-gray-700',
          )}>
            {isDone && step.result_summary
              ? step.result_summary
              : step.title}
            {hasClarified && (
              <span className="ml-2 text-[10px] text-amber-600 border border-amber-200 bg-amber-50 rounded px-1 py-0.5">
                ↩ clarified
              </span>
            )}
          </p>

          {/* Failed guidance */}
          {isFailed && step.result_summary && (
            <p className="text-xs text-red-600 mt-0.5">{step.result_summary}</p>
          )}

          {/* Secondary muted lines — tool calls */}
          {toolEvents.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {toolEvents.map((e, i) => (
                <p key={e.id || i} className="text-[11px] text-gray-400 leading-snug">
                  · {e.data?.tool_name}
                  {e.data?.args_preview ? ` — ${summariseArgs(e.data.args_preview)}` : ''}
                </p>
              ))}
            </div>
          )}

          {/* Clarification input — inline in this step card */}
          {isAwaiting && clarification && (
            <ClarificationCard clarification={clarification} onSubmit={onClarify} />
          )}
        </div>
      </div>
    </div>
  );
}

export const StepCard = React.memo(StepCardInner);

/** Convert a raw args_preview string into a compact readable summary */
function summariseArgs(preview: string): string {
  try {
    const obj = JSON.parse(preview);
    // For analyticsQuery, show row count hint from description
    if (obj.description) return obj.description;
    if (obj.query) return 'SQL query';
    if (obj.account_id) return `account ${obj.account_id.slice(0, 8)}…`;
  } catch {
    // not JSON
  }
  return preview.slice(0, 60);
}
