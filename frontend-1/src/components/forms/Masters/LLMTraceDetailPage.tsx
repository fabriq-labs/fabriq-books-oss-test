import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Clock, Cpu, Database, AlertTriangle, MessageSquare } from "lucide-react";
import { viewAPI } from "@/api/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";

interface TraceStep {
  id: string;
  step_number: number;
  prompt_tokens?: number;
  completion_tokens?: number;
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
  return <Badge variant={variant}>{status}</Badge>;
}

function StepCard({ step }: { step: TraceStep }) {
  const [expanded, setExpanded] = useState(false);
  const [toolResultsExpanded, setToolResultsExpanded] = useState(false);

  const sqlQueries = Array.isArray(step.sql_queries) ? step.sql_queries : [];
  const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
  const toolResults = Array.isArray(step.tool_results) ? step.tool_results : [];
  const hasContent = sqlQueries.length > 0 || toolCalls.length > 0 || toolResults.length > 0 || step.response_text;

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
                <Database className="h-4 w-4" /> SQL Queries ({sqlQueries.length})
              </h4>
              <div className="space-y-2">
                {sqlQueries.map((q: any, i: number) => (
                  <div key={i} className="rounded bg-muted p-3">
                    {q.description && (
                      <p className="text-xs text-muted-foreground mb-1">{q.description}</p>
                    )}
                    {q.reasoning && (
                      <p className="text-xs text-muted-foreground mb-1 italic">{q.reasoning}</p>
                    )}
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap"><code>{q.sql || JSON.stringify(q, null, 2)}</code></pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {toolCalls.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Tool Calls ({toolCalls.length})</h4>
              <pre className="rounded bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                <code>{JSON.stringify(toolCalls, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Tool Results */}
          {toolResults.length > 0 && (
            <div>
              <button
                className="text-sm font-medium mb-2 flex items-center gap-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); setToolResultsExpanded(!toolResultsExpanded); }}
              >
                {toolResultsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Tool Results ({toolResults.length})
              </button>
              {toolResultsExpanded && (
                <pre className="rounded bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                  <code>{JSON.stringify(toolResults, null, 2)}</code>
                </pre>
              )}
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
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (id && viewId) {
      setIsLoading(true);
      viewAPI
        .getById("llm_trace", id, viewId)
        .then((res: any) => {
          const data = res.data;
          setTrace(data);
          setFeedback(data.feedback || "");
        })
        .catch((err: any) => {
          console.error("Failed to load trace:", err);
          toast({ variant: "destructive", title: "Error", description: "Failed to load trace details." });
        })
        .finally(() => setIsLoading(false));
    }
  }, [id, viewId]);

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

  const steps = (trace.steps || []).sort((a, b) => a.step_number - b.step_number);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings/llm-traces")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">{trace.question}</h1>
          <p className="text-sm text-muted-foreground">{trace.id}</p>
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Question</p>
              <p className="font-medium whitespace-pre-wrap">{trace.question}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Query Type</p>
              <p className="font-medium">{trace.query_type || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <StatusBadge status={trace.status} />
            </div>
            <div>
              <p className="text-muted-foreground">LLM Model</p>
              <p className="font-medium">{trace.llm_model}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Duration</p>
              <p className="font-medium">{formatDuration(trace.duration_ms)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Tokens (prompt / completion / total)</p>
              <p className="font-medium">
                {formatTokens(trace.prompt_tokens)} / {formatTokens(trace.completion_tokens)} / {formatTokens(trace.total_tokens)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Steps</p>
              <p className="font-medium">{trace.steps_count ?? "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Tools Called</p>
              <p className="font-medium">{trace.tools_called?.join(", ") || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Model</p>
              <p className="font-medium">{trace.model_name || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">User</p>
              <p className="font-medium">{trace.user_id || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">{new Date(trace.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Session</p>
              <p className="font-medium text-xs break-all">{trace.session_id || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Response Card */}
      {trace.response_text && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Response</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded bg-muted p-4 text-sm overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {trace.response_text}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Error Card */}
      {trace.status === "error" && trace.error_message && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded bg-destructive/5 p-4 text-sm overflow-x-auto whitespace-pre-wrap">
              {trace.error_message}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Feedback Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Add feedback for prompt improvement..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
          />
          <Button onClick={handleSaveFeedback} disabled={isSaving} size="sm">
            {isSaving ? "Saving..." : "Save Feedback"}
          </Button>
        </CardContent>
      </Card>

      {/* Steps Section */}
      {steps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Steps ({steps.length})</h2>
          {steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
};
