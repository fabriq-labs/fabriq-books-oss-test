import React, { useState, useEffect } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sessionAPI } from '@/api/api';
import type { AgentSession } from '@/contexts/AgentSessionContext';
import { AssistantMessageRenderer } from '@/components/chat/AssistantMessageRenderer';
import { StepCard } from './StepCard';
import { TraceViewer, type SessionTrace } from './TraceViewer';
import { downloadTaxPackageExcel, downloadTaxPackageMarkdown } from '@/lib/taxPackageExport';

interface CompletedViewProps {
  session: AgentSession;
}

/** Ignore short stubs like "Spending report generated successfully." */
const MIN_REPORT_CHARS = 80;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function pickReportContent(messages: Array<{ role?: string; content?: string }> | null): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== 'assistant') continue;
    const text = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (text.length >= MIN_REPORT_CHARS) return text;
  }
  return null;
}

export const CompletedView: React.FC<CompletedViewProps> = ({ session }) => {
  const [showTrace, setShowTrace] = useState(false);
  const [trace, setTrace] = useState<SessionTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  // Load the last substantive assistant message as the session report
  useEffect(() => {
    let cancelled = false;
    setReportLoading(true);
    setReportContent(null);

    sessionAPI.getMessages(session.id)
      .then((messages) => {
        if (cancelled) return;
        setReportContent(pickReportContent(messages));
      })
      .catch(() => {
        if (!cancelled) setReportContent(null);
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });

    return () => { cancelled = true; };
  }, [session.id]);

  // Fetch trace when panel opens
  useEffect(() => {
    if (showTrace && !trace) {
      setTraceLoading(true);
      sessionAPI.getTrace(session.id)
        .then((data) => setTrace(data))
        .catch(() => {})
        .finally(() => setTraceLoading(false));
    }
  }, [showTrace, trace, session.id]);

  const plan = session.plan || [];
  const completedSteps = plan.filter((s) => s.status === 'completed').length;
  const duration = session.completed_at && session.started_at
    ? new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()
    : null;
  const ctx = session.accumulated_context || {};
  const isTaxPackage = session.template_id === 'atpl_tax_package_ca_t1'
    || ctx.tax_package_kind === 'ca_t1'
    || Boolean(ctx.workpapers);
  const coverMarkdown = reportContent
    || (isTaxPackage ? String(plan.find((s) => s.type === 'report')?.result_summary || '') : '');

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Success banner */}
      <div className="px-6 py-5 border-b bg-green-50/50 shrink-0">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Session complete</p>
            <p className="text-xs text-gray-500 mt-1">
              {completedSteps} step{completedSteps !== 1 ? 's' : ''} completed
              {duration ? ` in ${formatDuration(duration)}` : ''}
              {session.completed_actions_count > 0
                ? ` · ${session.completed_actions_count} action${session.completed_actions_count !== 1 ? 's' : ''} executed`
                : ''}
            </p>
          </div>
          {isTaxPackage && ctx.workpapers && (
            <div className="ml-auto flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => downloadTaxPackageExcel(ctx, coverMarkdown)}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Excel organizer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => downloadTaxPackageMarkdown(coverMarkdown, ctx.tax_year)}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Cover letter
              </Button>
            </div>
          )}
          {duration && !isTaxPackage && (
            <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(duration)}
            </div>
          )}
        </div>
      </div>

      {/* Final report — last assistant message (already persisted for analytical sessions) */}
      {(reportLoading || reportContent) && (
        <div className="px-6 py-5 border-b shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-gray-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Report</p>
          </div>
          {reportLoading ? (
            <p className="text-xs text-gray-400">Loading report…</p>
          ) : reportContent ? (
            <div className="rounded-lg border bg-white px-4 py-4">
              <AssistantMessageRenderer content={reportContent} className="text-sm text-gray-800" />
            </div>
          ) : null}
        </div>
      )}

      {/* Step cards — same V2 philosophy as executing view */}
      {plan.length > 0 && (
        <div className="px-5 py-4 space-y-2 border-b shrink-0">
          {plan.map((step) => (
            <StepCard
              key={step.index}
              step={step}
              isCurrent={false}
              isAwaiting={false}
              clarification={null}
              events={[]}
              onClarify={async () => {}}
            />
          ))}
        </div>
      )}

      {/* Trace toggle */}
      <div className="px-6 py-3 flex-1 flex flex-col min-h-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-gray-500 h-7 gap-1.5 self-start"
          onClick={() => setShowTrace((v) => !v)}
        >
          {showTrace ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showTrace ? 'Hide' : 'Show'} session trace
        </Button>

        {showTrace && (
          <div className="mt-3 rounded-lg border overflow-auto flex-1 min-h-[200px]">
            {traceLoading ? (
              <p className="text-xs text-gray-400 p-4">Loading trace…</p>
            ) : trace ? (
              <TraceViewer trace={trace} />
            ) : (
              <p className="text-xs text-gray-400 p-4">Trace not available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
