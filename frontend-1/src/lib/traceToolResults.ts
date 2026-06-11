import type { ToolInvocation } from '@/components/utils/helper';

export type TraceSqlQuery = {
  sql: string;
  description?: string;
  reasoning?: string;
  source: string;
  sourceLabel: string;
};

const TOOL_LABELS: Record<string, string> = {
  analyticsQuery: 'Analytics SQL',
  advancedSqlQuery: 'Advanced SQL',
  searchRecords: 'Record search',
  runFinancialReport: 'Financial report',
  'query log': 'Logged SQL',
};

function toolLabel(tool?: string): string {
  if (!tool) return 'Query';
  return TOOL_LABELS[tool] ?? tool.replace(/([A-Z])/g, ' $1').trim();
}

/** Human-readable label for tool badges in chat / trace UI. */
export function getToolDisplayLabel(toolName: string): string {
  return toolLabel(toolName);
}

function readToolName(entry: Record<string, unknown>): string | undefined {
  const name = entry.toolName ?? entry.tool ?? entry.tool_name;
  return typeof name === 'string' ? name : undefined;
}

function parseResultPayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { description: raw };
    }
  }
  return null;
}

/** Parse stored llm_trace_step.tool_results into ToolInvocation[] for ToolResponseRenderer. */
export function parseTraceToolInvocations(toolResults: unknown[]): ToolInvocation[] {
  if (!Array.isArray(toolResults)) return [];

  return toolResults
    .map((entry): ToolInvocation | null => {
      if (!entry || typeof entry !== 'object') return null;
      const tr = entry as Record<string, unknown>;
      const toolName = readToolName(tr);
      if (!toolName) return null;

      const payload =
        parseResultPayload(tr.result) ??
        parseResultPayload(tr.result_preview) ??
        parseResultPayload(tr.resultPreview);

      if (!payload) return null;

      return {
        state: 'result',
        toolName,
        result: {
          tool: toolName,
          model: String(payload.model ?? ''),
          resultType: String(payload.resultType ?? ''),
          data: payload.data,
          columns: payload.columns,
          uiHint: payload.uiHint,
          description: payload.description,
          report_id: payload.report_id,
          filters: payload.filters,
          currencyCode: payload.currencyCode,
          metaData: payload.metaData,
          error: payload.error,
          success: payload.success,
          focusAccountName: payload.focusAccountName,
          focusAccountId: payload.focusAccountId,
          tables: payload.tables,
        } as ToolInvocation['result'],
      };
    })
    .filter((item): item is ToolInvocation => item != null);
}

/** Merge all step tool_results from a trace into renderable invocations. */
export function parseTraceStepsToolInvocations(
  steps: Array<{ tool_results?: unknown }>
): ToolInvocation[] {
  const all: ToolInvocation[] = [];
  for (const step of steps) {
    const rows = Array.isArray(step.tool_results) ? step.tool_results : [];
    all.push(...parseTraceToolInvocations(rows));
  }
  return all;
}

/** Collect SQL from step.sql_queries and analytics/advanced tool call args. */
export function extractSqlQueriesFromStep(step: {
  sql_queries?: unknown;
  tool_calls?: unknown;
}): TraceSqlQuery[] {
  const seen = new Set<string>();
  const queries: TraceSqlQuery[] = [];

  const push = (sql: string, meta: Omit<TraceSqlQuery, 'sql' | 'sourceLabel'> & { source: string }) => {
    const trimmed = sql.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    queries.push({ sql: trimmed, ...meta, sourceLabel: toolLabel(meta.source) });
  };

  const sqlQueries = Array.isArray(step.sql_queries) ? step.sql_queries : [];
  for (const q of sqlQueries) {
    if (typeof q === 'string') {
      push(q, { source: 'query log' });
    } else if (q && typeof q === 'object') {
      const row = q as Record<string, unknown>;
      push(String(row.sql ?? ''), {
        description: row.description as string | undefined,
        reasoning: row.reasoning as string | undefined,
        source: 'query log',
      });
    }
  }

  const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== 'object') continue;
    const row = tc as Record<string, unknown>;
    const tool = readToolName(row);
    const args = (row.args ?? {}) as Record<string, unknown>;
    if (tool === 'analyticsQuery' || tool === 'advancedSqlQuery') {
      push(String(args.sql ?? args.query ?? ''), {
        description: args.description as string | undefined,
        reasoning: args.reasoning as string | undefined,
        source: tool,
      });
    }
  }

  return queries;
}

export function buildFinancialReportUrl(
  reportId: string,
  filters?: Record<string, unknown>
): string {
  const base =
    reportId === 'monthly_trial_balance'
      ? '/reports/monthly-trial-balance'
      : reportId === 'income_statement'
        ? '/reports/income-statement'
        : '/reports/balance-sheet';

  const params = new URLSearchParams();
  if (filters?.from_date) params.set('from_date', String(filters.from_date));
  if (filters?.to_date) params.set('to_date', String(filters.to_date));
  if (filters?.account_id) params.set('account_id', String(filters.account_id));
  if (filters?.currency_id) params.set('currency_id', String(filters.currency_id));
  const legalIds = filters?.legal_entity_ids;
  if (Array.isArray(legalIds) && legalIds.length > 0) {
    params.set('legal_entity_ids', legalIds.join(','));
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
