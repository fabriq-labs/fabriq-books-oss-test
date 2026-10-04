import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  AlertTriangle,
  MessageSquare,
  User,
  Layers,
  Sparkles,
} from "lucide-react";
import { viewAPI } from "@/api/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToolResponseRenderer } from "@/components/chat/tool-responses";
import {
  extractSqlQueriesFromStep,
  parseTraceToolInvocations,
  parseTraceStepsToolInvocations,
} from "@/lib/traceToolResults";
import {
  estimateGemini35FlashCost,
  formatUsd,
} from "@/lib/llmTokenCost";

interface TraceStep {
  id: string;
  step_number: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_prompt_tokens?: number | null;
  cache_creation_tokens?: number | null;
  duration_ms?: number;
  tool_calls?: any;
  tool_results?: any;
  sql_queries?: any;
  response_text?: string;
  status: string;
  error_message?: string;
}

interface TraceData {
  id: string;
  question: string;
  query_type?: string;
  status: string;
  llm_model: string;
  duration_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cached_prompt_tokens?: number | null;
  cache_creation_tokens?: number | null;
  /** Provider-reported USD cost (e.g. OpenRouter usage.cost). May arrive as string from Decimal. */
  cost_usd?: number | string | null;
  steps_count?: number;
  tools_called?: string[];
  model_name?: string;
  user_id?: string;
  session_id?: string;
  record_id?: string;
  org_id?: string;
  response_text?: string;
  error_message?: string;
  feedback?: string;
  created_at: string;
  steps?: TraceStep[];
}

function parseCostUsd(value?: number | string | null): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatDuration(ms?: number): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(count?: number): string {
  if (count == null) return "-";
  return count.toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "success" ? "default" : "destructive";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

function formatUserIdFallback(userId?: string): string {
  if (!userId) return "—";
  return userId
    .replace(/^user_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function truncateId(id?: string, len = 12): string {
  if (!id) return "—";
  if (id.length <= len + 4) return id;
  return `${id.slice(0, len)}…`;
}

function StepCard({ step }: { step: TraceStep }) {
  const [expanded, setExpanded] = useState(false);

  const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
  const toolResults = Array.isArray(step.tool_results) ? step.tool_results : [];
  const sqlQueries = extractSqlQueriesFromStep(step);
  const toolInvocations = parseTraceToolInvocations(toolResults);
  const hasContent =
    sqlQueries.length > 0 ||
    toolCalls.length > 0 ||
    toolResults.length > 0 ||
    toolInvocations.length > 0 ||
    step.response_text;

  return (
    <Card className="border">
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">Step {step.step_number}</span>
          <StatusBadge status={step.status} />
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {step.prompt_tokens != null && (
            <Badge variant="outline" className="font-normal">
              <Cpu className="h-3 w-3 mr-1" />
              {formatTokens(step.prompt_tokens)} + {formatTokens(step.completion_tokens)} tokens
            </Badge>
          )}
          {step.cached_prompt_tokens != null && step.cached_prompt_tokens > 0 && (
            <Badge variant="outline" className="font-normal text-emerald-700 border-emerald-200">
              {formatTokens(step.cached_prompt_tokens)} cached
            </Badge>
          )}
          {step.duration_ms != null && (
            <Badge variant="outline" className="font-normal">
              <Clock className="h-3 w-3 mr-1" />
              {formatDuration(step.duration_ms)}
            </Badge>
          )}
        </div>
      </button>

      {expanded && hasContent && (
        <CardContent className="pt-0 space-y-4">
          {/* SQL Queries */}
          {sqlQueries.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Database className="h-4 w-4" /> SQL details ({sqlQueries.length})
              </h4>
              <div className="space-y-2">
                {sqlQueries.map((q, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {q.source}
                      </Badge>
                      {q.description && (
                        <span className="text-xs text-muted-foreground">{q.description}</span>
                      )}
                    </div>
                    {q.reasoning && (
                      <p className="text-xs text-muted-foreground mb-1.5 italic">{q.reasoning}</p>
                    )}
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono text-slate-800">
                      <code>{q.sql}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {toolCalls.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Tool calls ({toolCalls.length})</h4>
              <div className="space-y-2">
                {toolCalls.map((tc: any, i: number) => {
                  const name = tc.toolName ?? tc.tool ?? "unknown";
                  const args = tc.args ?? {};
                  const argKeys = Object.keys(args);
                  return (
                    <div key={i} className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2">
                      <p className="text-xs font-medium text-indigo-800">{name}</p>
                      {argKeys.length > 0 && (
                        <pre className="text-[11px] text-slate-600 mt-1 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(args, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {toolResults.length > 0 && toolInvocations.length === 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Tool results (raw)</h4>
              <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                <code>{JSON.stringify(toolResults, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Step Response */}
          {step.response_text && (
            <div>
              <h4 className="text-sm font-medium mb-2">Response</h4>
              <pre className="rounded bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                {step.response_text}
              </pre>
            </div>
          )}

          {/* Step Error */}
          {step.error_message && (
            <div className="rounded border border-destructive/50 bg-destructive/5 p-3">
              <h4 className="text-sm font-medium text-destructive mb-1 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Error
              </h4>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{step.error_message}</pre>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export const LLMTraceDetailPage: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [trace, setTrace] = useState<TraceData | null>(null);
  const [userDisplay, setUserDisplay] = useState<{ name?: string | null; email?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (id && viewId) {
      setIsLoading(true);
      setUserDisplay(null);
      viewAPI
        .getById("llm_trace", id, viewId)
        .then(async (res: any) => {
          const data = res.data;
          setTrace(data);
          setFeedback(data.feedback || "");
          if (data.user_id) {
            try {
              const userRes: any = await viewAPI.getById("user", data.user_id, "user_view");
              const user = userRes?.data;
              if (user) {
                setUserDisplay({ name: user.name, email: user.email });
              }
            } catch {
              // Fall back to formatted user_id
            }
          }
        })
        .catch((err: any) => {
          console.error("Failed to load trace:", err);
          toast({ variant: "destructive", title: "Error", description: "Failed to load trace details." });
        })
        .finally(() => setIsLoading(false));
    }
  }, [id, viewId, toast]);

  const handleSaveFeedback = async () => {
    if (!id || !viewId) return;
    setIsSaving(true);
    try {
      await viewAPI.update("llm_trace", id, viewId, { feedback });
      toast({ title: "Saved", description: "Feedback saved successfully." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to save feedback." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Trace not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/settings/llm-traces")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Traces
        </Button>
      </div>
    );
  }

  const steps = (Array.isArray(trace.steps) ? trace.steps : [])
    .slice()
    .sort((a, b) => a.step_number - b.step_number);
  const allToolInvocations = parseTraceStepsToolInvocations(steps);
  const toolsCalled = Array.isArray(trace.tools_called) ? trace.tools_called : [];
  const userLabel = userDisplay?.name?.trim() || formatUserIdFallback(trace.user_id);
  const userSubtext = userDisplay?.email || (userDisplay?.name ? undefined : trace.user_id);
  const cachedPrompt = trace.cached_prompt_tokens ?? 0;
  const promptTokens = trace.prompt_tokens ?? 0;
  const cachedPct =
    promptTokens > 0 && cachedPrompt > 0
      ? Math.round((100 * cachedPrompt) / promptTokens)
      : null;
  const billedCost = parseCostUsd(trace.cost_usd);
  const isGeminiFlash = /gemini-3\.5-flash/i.test(trace.llm_model || "");
  const costEstimate =
    billedCost == null && isGeminiFlash
      ? estimateGemini35FlashCost({
          promptTokens: trace.prompt_tokens,
          completionTokens: trace.completion_tokens,
          cachedPromptTokens: trace.cached_prompt_tokens,
        })
      : null;

  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">LLM Trace</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm text-muted-foreground font-mono mt-1 cursor-default">
                {truncateId(trace.id, 20)}
              </p>
            </TooltipTrigger>
            <TooltipContent>{trace.id}</TooltipContent>
          </Tooltip>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground shrink-0"
          onClick={() => navigate("/settings/llm-traces")}
        >
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>

      {/* Summary Card */}
      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={trace.status} />
            {trace.query_type && (
              <Badge variant="outline" className="capitalize font-normal">
                {trace.query_type}
              </Badge>
            )}
            {trace.model_name && (
              <Badge variant="secondary" className="font-normal">
                {trace.model_name}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {new Date(trace.created_at).toLocaleString()}
            </span>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Question
              </p>
              <span className="text-xs text-muted-foreground">
                LLM Model{" "}
                <span className="font-medium text-foreground">{trace.llm_model}</span>
              </span>
            </div>
            <p className="text-base text-gray-900 leading-relaxed whitespace-pre-wrap">
              {trace.question}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
            <DetailField label="Duration">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDuration(trace.duration_ms)}
              </span>
            </DetailField>
            <DetailField label="Steps">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                {trace.steps_count ?? "—"}
              </span>
            </DetailField>
            <DetailField label="Tokens">
              <div className="space-y-0.5">
                <p className="font-medium">
                  {formatTokens(trace.total_tokens)} <span className="text-muted-foreground font-normal">total</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTokens(trace.prompt_tokens)} in · {formatTokens(trace.completion_tokens)} out
                </p>
                {cachedPrompt > 0 && (
                  <p className="text-xs text-emerald-700">
                    {formatTokens(cachedPrompt)} cached
                    {cachedPct != null ? ` (${cachedPct}% of prompt)` : ""}
                    {trace.cache_creation_tokens != null && trace.cache_creation_tokens > 0 && (
                      <> · {formatTokens(trace.cache_creation_tokens)} cache write</>
                    )}
                  </p>
                )}
              </div>
            </DetailField>
            {billedCost != null && (
              <DetailField label="Cost">
                <div className="space-y-0.5">
                  <p className="font-medium tabular-nums">{formatUsd(billedCost)}</p>
                  <p className="text-xs text-muted-foreground">Provider-reported</p>
                </div>
              </DetailField>
            )}
            {costEstimate && costEstimate.savings > 0 && (
              <DetailField label="Est. cost (OpenRouter)">
                <div className="space-y-0.5">
                  <p className="font-medium">{formatUsd(costEstimate.costWithCache)}</p>
                  <p className="text-xs text-muted-foreground">
                    vs {formatUsd(costEstimate.costWithoutCache)} without cache
                  </p>
                  <p className="text-xs text-emerald-700">
                    Saved {formatUsd(costEstimate.savings)}
                    {costEstimate.savingsPct != null
                      ? ` (${costEstimate.savingsPct.toFixed(0)}%)`
                      : ""}
                  </p>
                </div>
              </DetailField>
            )}
            <DetailField label="User">
              <div className="inline-flex items-start gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{userLabel}</p>
                  {userSubtext && (
                    <p className="text-xs text-muted-foreground">{userSubtext}</p>
                  )}
                </div>
              </div>
            </DetailField>
            <DetailField label="Session">
              {trace.session_id ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-mono text-xs text-muted-foreground cursor-default">
                      {truncateId(trace.session_id, 16)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm break-all">{trace.session_id}</TooltipContent>
                </Tooltip>
              ) : (
                <span>—</span>
              )}
            </DetailField>
            <DetailField label="Tools called">
              {toolsCalled.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {toolsCalled.map((tool) => (
                    <Badge key={tool} variant="secondary" className="font-normal">
                      {tool}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span>—</span>
              )}
            </DetailField>
          </div>
        </CardContent>
      </Card>

      {/* Response Card — tool output tables/reports + assistant text */}
      {(allToolInvocations.length > 0 || trace.response_text) && (
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100 py-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Response
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {allToolInvocations.length > 0 && (
              <ToolResponseRenderer toolInvocations={allToolInvocations} />
            )}
            {trace.response_text && (
              <div className={allToolInvocations.length > 0 ? "pt-2 border-t border-gray-100" : ""}>
                {allToolInvocations.length > 0 && (
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Assistant summary
                  </p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                  {trace.response_text}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Card */}
      {trace.status === "error" && trace.error_message && (
        <Card className="shadow-sm border-destructive/40">
          <CardHeader className="border-b border-destructive/20 bg-destructive/5 py-4">
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Error
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <pre className="rounded-lg bg-destructive/5 p-4 text-sm overflow-x-auto whitespace-pre-wrap">
              {trace.error_message}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Feedback Section */}
      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100 py-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <Textarea
            placeholder="Add feedback for prompt improvement..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button onClick={handleSaveFeedback} disabled={isSaving} size="sm">
              {isSaving ? "Saving..." : "Save feedback"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Steps Section */}
      {steps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Steps ({steps.length})</h2>
          {steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
};
