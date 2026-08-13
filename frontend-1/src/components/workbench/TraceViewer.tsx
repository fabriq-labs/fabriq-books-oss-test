import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Cpu,
  CheckSquare,
  XSquare,
  Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  estimateGemini35FlashCost,
  formatUsd,
} from '@/lib/llmTokenCost';

// ── Types (mirror SessionTraceService) ────────────────────────

export interface TraceUsage {
  total_llm_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cached_prompt_tokens?: number;
  total_cache_creation_tokens?: number;
  total_duration_ms: number;
  tools_used: string[];
  sql_queries_count: number;
}

export interface TraceTimelineEntry {
  type: 'message' | 'llm_call' | 'action_queued' | 'action_resolved';
  timestamp: string;
  [key: string]: any;
}

export interface SessionTrace {
  session: any;
  plan: any[];
  timeline: TraceTimelineEntry[];
  usage: TraceUsage;
  actions: any[];
}

// ── Helpers ────────────────────────────────────────────────────

function formatDurationMs(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

// ── Sub-components ─────────────────────────────────────────────

function UsageStats({ usage }: { usage: TraceUsage }) {
  const cached = usage.total_cached_prompt_tokens ?? 0;
  const prompt = usage.total_prompt_tokens || 0;
  const cachedPct = prompt > 0 && cached > 0 ? Math.round((100 * cached) / prompt) : null;
  const cost = estimateGemini35FlashCost({
    promptTokens: usage.total_prompt_tokens,
    completionTokens: usage.total_completion_tokens,
    cachedPromptTokens: usage.total_cached_prompt_tokens,
  });

  const stats = [
    { label: 'LLM calls', value: String(usage.total_llm_calls) },
    { label: 'Prompt tokens', value: formatTokens(usage.total_prompt_tokens) },
    ...(cached > 0
      ? [{ label: cachedPct != null ? `Cached (${cachedPct}%)` : 'Cached tokens', value: formatTokens(cached) }]
      : []),
    { label: 'Completion tokens', value: formatTokens(usage.total_completion_tokens) },
    { label: 'Duration', value: formatDurationMs(usage.total_duration_ms) },
    { label: 'SQL queries', value: String(usage.sql_queries_count) },
    ...(cost.savings > 0
      ? [{
          label: `Est. saved vs full rate`,
          value: formatUsd(cost.savings),
        }]
      : []),
  ];

  return (
    <div className="flex flex-wrap gap-3 px-4 py-3 bg-gray-50 border-b">
      {stats.map((s) => (
        <div key={s.label} className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-semibold text-gray-700">{s.value}</span>
          <span className="text-[11px] text-gray-400">{s.label}</span>
        </div>
      ))}
      {usage.tools_used.length > 0 && (
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-gray-400">Tools:</span>
          <span className="text-[11px] text-gray-600">{usage.tools_used.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

function LLMCallEntry({ entry, index }: { entry: TraceTimelineEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const steps: any[] = entry.steps || [];
  const toolsCalled: string[] = entry.tools_called || [];

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left bg-white hover:bg-gray-50 transition-colors"
      >
        <Cpu className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
        <span className="text-xs font-medium text-gray-700 flex-1">
          LLM call #{index + 1}
          {entry.llm_model && (
            <span className="ml-2 text-[10px] text-gray-400 font-normal">{entry.llm_model}</span>
          )}
        </span>
        <div className="flex items-center gap-3 text-[11px] text-gray-400 shrink-0">
          {entry.prompt_tokens > 0 && (
            <span>{formatTokens(entry.prompt_tokens)} in</span>
          )}
          {entry.cached_prompt_tokens > 0 && (
            <span className="text-emerald-600">
              {formatTokens(entry.cached_prompt_tokens)} cached
            </span>
          )}
          {entry.completion_tokens > 0 && (
            <span>{formatTokens(entry.completion_tokens)} out</span>
          )}
          {entry.duration_ms > 0 && (
            <span>{formatDurationMs(entry.duration_ms)}</span>
          )}
          <span className="text-[10px] text-gray-300">{formatTime(entry.timestamp)}</span>
        </div>
        {steps.length > 0 && (
          expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
      </button>

      {/* Tools called (always visible) */}
      {toolsCalled.length > 0 && !expanded && (
        <div className="px-4 pb-2.5 bg-white">
          <p className="text-[11px] text-gray-400">
            · {toolsCalled.join('  ·  ')}
          </p>
        </div>
      )}

      {/* Expanded step details */}
      {expanded && steps.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 divide-y divide-gray-100">
          {steps.map((step, si) => (
            <div key={si} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[11px] font-medium text-gray-500">Step {step.step_number}</p>
                {step.prompt_tokens > 0 && (
                  <span className="text-[10px] text-gray-400">
                    {formatTokens(step.prompt_tokens)} in
                    {step.cached_prompt_tokens > 0 && (
                      <span className="text-emerald-600">
                        {' '}· {formatTokens(step.cached_prompt_tokens)} cached
                      </span>
                    )}
                    {step.completion_tokens > 0 && (
                      <span> · {formatTokens(step.completion_tokens)} out</span>
                    )}
                  </span>
                )}
              </div>

              {/* Tool calls */}
              {(step.tool_calls || []).map((tc: any, tci: number) => (
                <div key={tci} className="pl-3 border-l-2 border-indigo-200">
                  <p className="text-[11px] text-indigo-700 font-medium">→ {tc.tool}</p>
                  {tc.args && Object.keys(tc.args).length > 0 && (
                    <pre className="text-[10px] text-gray-500 mt-0.5 whitespace-pre-wrap break-all leading-relaxed">
                      {JSON.stringify(tc.args, null, 2).slice(0, 400)}
                    </pre>
                  )}
                </div>
              ))}

              {/* Tool results */}
              {(step.tool_results || []).map((tr: any, tri: number) => (
                <div key={tri} className="pl-3 border-l-2 border-green-200">
                  <p className="text-[11px] text-green-700 font-medium">← {tr.tool}</p>
                  {tr.result_preview && (
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed break-all">
                      {tr.result_preview.slice(0, 300)}
                    </p>
                  )}
                </div>
              ))}

              {/* SQL queries */}
              {(step.sql_queries || []).map((q: any, qi: number) => (
                <div key={qi} className="pl-3 border-l-2 border-orange-200">
                  <p className="text-[10px] text-orange-700 font-mono leading-relaxed break-all">
                    {typeof q === 'string' ? q.slice(0, 300) : JSON.stringify(q).slice(0, 300)}
                  </p>
                </div>
              ))}

              {/* Response text */}
              {step.response_text && (
                <p className="text-[11px] text-gray-600 pl-3 border-l-2 border-gray-200 leading-relaxed">
                  {step.response_text.slice(0, 200)}
                  {step.response_text.length > 200 ? '…' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageEntry({ entry }: { entry: TraceTimelineEntry }) {
  const isUser = entry.role === 'user';
  return (
    <div className={cn('flex items-start gap-2 px-1', isUser ? 'opacity-70' : '')}>
      <MessageSquare className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', isUser ? 'text-gray-400' : 'text-blue-400')} />
      <div className="flex-1 min-w-0">
        <span className={cn('text-[10px] font-medium uppercase tracking-wide', isUser ? 'text-gray-400' : 'text-blue-500')}>
          {entry.role}
        </span>
        {entry.step_index != null && (
          <span className="ml-2 text-[10px] text-gray-300">step {entry.step_index + 1}</span>
        )}
        <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed break-words">
          {String(entry.content || '').slice(0, 200)}
          {String(entry.content || '').length > 200 ? '…' : ''}
        </p>
      </div>
      <span className="text-[10px] text-gray-300 shrink-0">{formatTime(entry.timestamp)}</span>
    </div>
  );
}

function ActionEntry({ entry }: { entry: TraceTimelineEntry }) {
  const isResolved = entry.type === 'action_resolved';
  const isApproved = entry.resolution === 'approved';

  return (
    <div className="flex items-start gap-2 px-1">
      {isResolved ? (
        isApproved
          ? <CheckSquare className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
          : <XSquare className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
      ) : (
        <div className="h-3.5 w-3.5 rounded border-2 border-amber-400 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-700 leading-snug">
          {isResolved
            ? `Action ${isApproved ? 'approved' : 'rejected'}${entry.resolved_by ? ` by ${entry.resolved_by}` : ''}`
            : entry.title || `Action queued (${entry.action_type})`}
        </p>
        {!isResolved && entry.confidence && (
          <span className="text-[10px] text-gray-400">{entry.confidence} confidence</span>
        )}
        {isResolved && entry.execution_error && (
          <p className="text-[10px] text-red-500 mt-0.5">{entry.execution_error}</p>
        )}
      </div>
      <span className="text-[10px] text-gray-300 shrink-0">{formatTime(entry.timestamp)}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────

interface TraceViewerProps {
  trace: SessionTrace;
}

export const TraceViewer: React.FC<TraceViewerProps> = ({ trace }) => {
  const [showRaw, setShowRaw] = useState(false);

  // Count entries per type for the summary label
  const llmCalls = trace.timeline.filter((e) => e.type === 'llm_call');
  const messages = trace.timeline.filter((e) => e.type === 'message');
  const actionEntries = trace.timeline.filter(
    (e) => e.type === 'action_queued' || e.type === 'action_resolved'
  );

  // Interleave LLM call index tracking
  let llmCallIdx = 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Usage stats bar */}
      <UsageStats usage={trace.usage} />

      {/* Timeline */}
      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Timeline · {llmCalls.length} LLM calls · {messages.length} messages
          {actionEntries.length > 0 ? ` · ${actionEntries.length} action events` : ''}
        </p>

        {trace.timeline.map((entry, i) => {
          if (entry.type === 'llm_call') {
            const idx = llmCallIdx++;
            return <LLMCallEntry key={i} entry={entry} index={idx} />;
          }
          if (entry.type === 'message') {
            return <MessageEntry key={i} entry={entry} />;
          }
          if (entry.type === 'action_queued' || entry.type === 'action_resolved') {
            return <ActionEntry key={i} entry={entry} />;
          }
          return null;
        })}
      </div>

      {/* Raw JSON toggle */}
      <div className="px-4 pb-4 border-t pt-3">
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Code2 className="h-3.5 w-3.5" />
          {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
        </button>
        {showRaw && (
          <div className="mt-3 rounded-lg border bg-gray-50 overflow-auto max-h-80">
            <pre className="text-[10px] text-gray-600 p-4 whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(trace, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
