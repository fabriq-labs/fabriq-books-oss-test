/**
 * Rebuild LLM chat history from persisted agent_message rows.
 *
 * Workbench continuation was sending assistant turns with empty `content` and
 * dropping `tool_calls`. Gemini then returns an empty reply (no tools), the
 * step never advances, and the session sits in `executing` until the watchdog.
 */

export type PersistedSessionMessage = {
  role: string;
  content?: string | null;
  tool_calls?: unknown;
};

export type HistoryChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function toolCallName(tc: any): string {
  return tc?.toolName || tc?.name || 'tool';
}

function summarizeToolCalls(toolCalls: unknown): string {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return '';
  const parts = toolCalls.map((tc: any) => {
    const name = toolCallName(tc);
    const summary = tc?.args?.result_summary;
    if (name === 'completeStep' && typeof summary === 'string' && summary.trim()) {
      return `completeStep (${summary.trim()})`;
    }
    if (name === 'createPlan') return 'createPlan';
    return name;
  });
  return `Previous agent turn used tools: ${parts.join('; ')}.`;
}

export function toSessionHistoryMessages(
  sessionMessages: PersistedSessionMessage[],
): HistoryChatMessage[] {
  const out: HistoryChatMessage[] = [];
  for (const m of sessionMessages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const text = (m.content ?? '').trim();
    const toolSummary = m.role === 'assistant' ? summarizeToolCalls(m.tool_calls) : '';
    const content = text || toolSummary;
    if (!content) continue;
    out.push({ role: m.role, content });
  }
  return out;
}

export const STEP_STALL_FAIL_REASON =
  'Agent did not complete the current step (no completeStep / no progress)';
