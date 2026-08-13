import prisma from '../../lib/prisma';

// ── Types ──────────────────────────────────────────────────────

interface TraceSession {
  id: string;
  goal: string;
  goal_model: string | null;
  mode: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

interface TracePlanStep {
  index: number;
  type: string;
  title: string;
  description: string;
  status: string;
  result_summary: string | null;
}

interface TraceToolCall {
  tool: string;
  args: any;
}

interface TraceToolResult {
  tool: string;
  result_preview: string;
}

interface TraceLLMStep {
  step_number: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_prompt_tokens: number | null;
  cache_creation_tokens: number | null;
  tool_calls: TraceToolCall[];
  tool_results: TraceToolResult[];
  sql_queries: any[];
  response_text: string | null;
}

interface TraceTimelineEntry {
  type: 'message' | 'llm_call' | 'action_queued' | 'action_resolved';
  timestamp: string;
  [key: string]: any;
}

interface TraceUsage {
  total_llm_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  /** Sum of provider cache-read tokens across traces (subset of prompt tokens). */
  total_cached_prompt_tokens: number;
  /** Sum of provider cache-write tokens (Anthropic/Bedrock); often 0 on Gemini. */
  total_cache_creation_tokens: number;
  total_duration_ms: number;
  tools_used: string[];
  sql_queries_count: number;
}

interface TraceAction {
  id: string;
  action_type: string;
  title: string;
  description: string | null;
  confidence: string;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  execution_result: any;
  execution_error: string | null;
  created_at: string;
}

export interface SessionTrace {
  session: TraceSession;
  plan: TracePlanStep[];
  timeline: TraceTimelineEntry[];
  usage: TraceUsage;
  actions: TraceAction[];
}

// ── Main Function ──────────────────────────────────────────────

export async function getSessionTrace(sessionId: string): Promise<SessionTrace> {
  // Fetch all data in parallel
  const [session, messages, traces, actions] = await Promise.all([
    prisma.agent_session.findUniqueOrThrow({ where: { id: sessionId } }),
    prisma.agent_message.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'asc' },
    }),
    prisma.llm_trace.findMany({
      where: { session_id: sessionId },
      include: { steps: { orderBy: { step_number: 'asc' } } },
      orderBy: { created_at: 'asc' },
    }),
    prisma.pending_action.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'asc' },
    }),
  ]);

  // ── Session summary ──
  const startedAt = session.started_at;
  const completedAt = session.completed_at;
  const durationMs = completedAt
    ? completedAt.getTime() - startedAt.getTime()
    : null;

  const traceSession: TraceSession = {
    id: session.id,
    goal: session.goal,
    goal_model: session.goal_model,
    mode: session.mode,
    status: session.status,
    started_at: startedAt.toISOString(),
    completed_at: completedAt?.toISOString() ?? null,
    duration_ms: durationMs,
  };

  // ── Plan ──
  const plan: TracePlanStep[] = ((session.plan as any[]) || []).map((step) => ({
    index: step.index,
    type: step.type,
    title: step.title,
    description: step.description,
    status: step.status,
    result_summary: step.result_summary || null,
  }));

  // ── Build timeline ──
  const timeline: TraceTimelineEntry[] = [];

  // Messages
  for (const msg of messages) {
    timeline.push({
      type: 'message',
      timestamp: msg.created_at.toISOString(),
      role: msg.role,
      content: msg.content,
      step_index: msg.step_index,
      tool_calls: msg.tool_calls || undefined,
    });
  }

  // LLM calls
  for (const trace of traces) {
    const llmSteps: TraceLLMStep[] = (trace.steps || []).map((s) => {
      const toolCalls = ((s.tool_calls as any[]) || []).map((tc) => ({
        tool: tc.toolName || tc.tool || '(unknown)',
        args: tc.args,
      }));
      const toolResults = ((s.tool_results as any[]) || []).map((tr) => ({
        tool: tr.toolName || tr.tool || '(unknown)',
        result_preview: typeof tr.result_preview === 'string'
          ? tr.result_preview
          : JSON.stringify(tr.result_preview)?.substring(0, 500) || '',
      }));
      return {
        step_number: s.step_number,
        prompt_tokens: s.prompt_tokens,
        completion_tokens: s.completion_tokens,
        cached_prompt_tokens: s.cached_prompt_tokens,
        cache_creation_tokens: s.cache_creation_tokens,
        tool_calls: toolCalls,
        tool_results: toolResults,
        sql_queries: (s.sql_queries as any[]) || [],
        response_text: s.response_text,
      };
    });

    timeline.push({
      type: 'llm_call',
      timestamp: trace.created_at.toISOString(),
      duration_ms: trace.duration_ms,
      llm_model: trace.llm_model,
      prompt_tokens: trace.prompt_tokens,
      completion_tokens: trace.completion_tokens,
      cached_prompt_tokens: trace.cached_prompt_tokens,
      cache_creation_tokens: trace.cache_creation_tokens,
      steps_count: trace.steps_count,
      tools_called: trace.tools_called,
      response_text: trace.response_text,
      steps: llmSteps,
    });
  }

  // Pending actions — queued and resolved events
  for (const action of actions) {
    timeline.push({
      type: 'action_queued',
      timestamp: action.created_at.toISOString(),
      action_id: action.id,
      action_type: action.action_type,
      title: action.title,
      confidence: action.confidence,
      status: action.status,
    });

    if (action.resolved_at) {
      timeline.push({
        type: 'action_resolved',
        timestamp: action.resolved_at.toISOString(),
        action_id: action.id,
        resolution: action.status,
        resolved_by: action.resolved_by,
        execution_result: action.execution_result,
        execution_error: action.execution_error,
      });
    }
  }

  // Sort timeline chronologically
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // ── Usage summary ──
  const allToolsUsed = new Set<string>();
  let totalSqlQueries = 0;
  for (const trace of traces) {
    for (const tool of (trace.tools_called || [])) {
      allToolsUsed.add(tool);
    }
    for (const step of (trace.steps || [])) {
      totalSqlQueries += ((step.sql_queries as any[]) || []).length;
    }
  }

  const usage: TraceUsage = {
    total_llm_calls: traces.length,
    total_prompt_tokens: traces.reduce((sum, t) => sum + (t.prompt_tokens || 0), 0),
    total_completion_tokens: traces.reduce((sum, t) => sum + (t.completion_tokens || 0), 0),
    total_cached_prompt_tokens: traces.reduce(
      (sum, t) => sum + (t.cached_prompt_tokens || 0),
      0
    ),
    total_cache_creation_tokens: traces.reduce(
      (sum, t) => sum + (t.cache_creation_tokens || 0),
      0
    ),
    total_duration_ms: traces.reduce((sum, t) => sum + (t.duration_ms || 0), 0),
    tools_used: Array.from(allToolsUsed).sort(),
    sql_queries_count: totalSqlQueries,
  };

  // ── Actions summary ──
  const traceActions: TraceAction[] = actions.map((a) => ({
    id: a.id,
    action_type: a.action_type,
    title: a.title,
    description: a.description,
    confidence: a.confidence,
    status: a.status,
    resolved_by: a.resolved_by,
    resolved_at: a.resolved_at?.toISOString() ?? null,
    execution_result: a.execution_result,
    execution_error: a.execution_error,
    created_at: a.created_at.toISOString(),
  }));

  return {
    session: traceSession,
    plan,
    timeline,
    usage,
    actions: traceActions,
  };
}
