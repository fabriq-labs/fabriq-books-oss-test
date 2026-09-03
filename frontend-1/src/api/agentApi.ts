import Cookies from "js-cookie";
import { fetchAPI, uploadAPI, API_URL } from "./apiClient";
import { attachmentAPI } from "./metadataApi";

// ── Agent Session API ─────────────────────────────────────────────────────────

export const sessionAPI = {
  create: (data: {
    goal: string;
    mode?: string;
    goal_model?: string;
    template_id?: string;
    intake?: Record<string, unknown>;
  }) =>
    fetchAPI<any>('/api/agent/sessions', { method: 'POST', body: JSON.stringify(data) })
      .then((r: any) => r.data),

  list: () =>
    fetchAPI<any>('/api/agent/sessions').then((r: any) => r.data),

  get: (id: string) =>
    fetchAPI<any>(`/api/agent/sessions/${id}`).then((r: any) => r.data),

  update: (id: string, data: any) =>
    fetchAPI<any>(`/api/agent/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
      .then((r: any) => r.data),

  getMessages: (id: string) =>
    fetchAPI<any>(`/api/agent/sessions/${id}/messages`).then((r: any) => r.data),

  getTrace: (id: string) =>
    fetchAPI<any>(`/api/agent/sessions/${id}/trace`).then((r: any) => r.data),

  clarify: (id: string, response: string) =>
    fetchAPI<any>(`/api/agent/sessions/${id}/clarify`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),

  /** Fire-and-forget: kick off the agent's first LLM call for a session */
  startStream: (sessionId: string, goal: string, goalModel?: string) => {
    const token = Cookies.get('__session');
    return fetch(`${API_URL}/api/agent/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: goal }],
        sessionId,
        context: { modelName: goalModel || 'posting' },
        stream: true,
      }),
    }).then(async (response) => {
      if (response.body) {
        const reader = response.body.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
    }).catch(() => {
      // Agent continues server-side regardless
    });
  },
};

// ── Agent Template API ────────────────────────────────────────────────────────

export interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  goal_model: string | null;
  default_mode: string;
  user_hint: string | null;
  sort_order: number;
  pinned_plan?: unknown;
  intake_schema?: {
    lock_mode?: string;
    fields?: Array<{
      key: string;
      type: 'text' | 'number' | 'single_select';
      label: string;
      optional?: boolean;
      default?: string | number;
      options?: Array<{ id: string; label: string }>;
    }>;
  } | null;
}

export const agentTemplateAPI = {
  list: () =>
    fetchAPI<any>('/api/agent/templates').then((r: any) => r.data as AgentTemplate[]),
};

// ── Pending Action API ────────────────────────────────────────────────────────

export const pendingActionAPI = {
  list: (params?: { session_id?: string; batch_id?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.session_id) query.set('session_id', params.session_id);
    if (params?.batch_id) query.set('batch_id', params.batch_id);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return fetchAPI<any>(`/api/agent/pending-actions${qs ? `?${qs}` : ''}`).then((r: any) => r.data);
  },

  get: (id: string) =>
    fetchAPI<any>(`/api/agent/pending-actions/${id}`).then((r: any) => r.data),

  resolve: (id: string, data: {
    status: 'approved' | 'approved_with_edits' | 'rejected' | 'deferred';
    resolution_note?: string;
    edited_payload?: any;
    defer_until?: string;
  }) =>
    fetchAPI<any>(`/api/agent/pending-actions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then((r: any) => r.data),

  bulkApprove: (batchId: string, confidence?: 'high' | 'medium' | 'low') =>
    fetchAPI<any>(`/api/agent/pending-actions/batch/${batchId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ confidence }),
    }).then((r: any) => r.data),

  listPaginated: (params?: {
    page?: number;
    pageSize?: number;
    session_id?: string;
    action_type?: string;
    confidence?: string;
    status?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.session_id) query.set('session_id', params.session_id);
    if (params?.action_type) query.set('action_type', params.action_type);
    if (params?.confidence) query.set('confidence', params.confidence);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return fetchAPI<any>(`/api/agent/pending-actions/paginated${qs ? `?${qs}` : ''}`)
      .then((r: any) => r.data as {
        items: import('@/contexts/AgentSessionContext').PendingAction[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      });
  },
};

// ── Agent API ─────────────────────────────────────────────────────────────────

export const agentAPI = {
  extract: (file: File, prompt?: string, context?: Record<string, any>) => {
    const formData = new FormData();
    formData.append('file', file);
    if (prompt) formData.append('prompt', prompt);
    if (context) formData.append('context', JSON.stringify(context));
    // Client-side safety net: backend enforces AGENT_STREAM_TIMEOUT_MS (default 120s,
    // often raised to 300s locally). Keep FE above that so the server can return a
    // clean 504 instead of the browser aborting first with "signal is aborted without reason".
    const controller = new AbortController();
    const timeoutMs = 330_000;
    const timer = setTimeout(
      () => controller.abort(new DOMException('Extract request timed out', 'TimeoutError')),
      timeoutMs,
    );
    return uploadAPI('/api/agent/extract', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  },

  /** Reassign attachments from one instance to another (generic). */
  reassignAttachments: (params: {
    fromType: string;
    fromInstanceId: string;
    toType: string;
    toInstanceId: string;
  }) =>
    fetchAPI<{ success: boolean; moved: number }>('/api/attachments/reassign', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  moveAttachmentsToInvoice: (itemId: string, invoiceId: string) =>
    agentAPI.reassignAttachments({
      fromType: 'instance_email_ingest_item',
      fromInstanceId: itemId,
      toType: 'invoice',
      toInstanceId: invoiceId,
    }),

  getAttachmentBlob: async (type: string, id: string): Promise<Blob> => {
    const list = await attachmentAPI.get(type, id);
    const first = (Array.isArray(list) ? list : (list as any)?.data ?? [])[0];
    if (!first?.id) throw new Error('Attachment not found');
    return attachmentAPI.getFile(type, id, first.id);
  },

  getEmailIngestItemPdfBlob: (itemId: string, instanceId?: string | null): Promise<Blob> =>
    agentAPI.getAttachmentBlob(
      instanceId ? 'invoice' : 'instance_email_ingest_item',
      instanceId ?? itemId
    ),

  categorizeTransaction: async (params: {
    posting_id?: string;
    posting_data?: {
      id: string;
      description: string;
      amount: number;
      value_date: string;
      account_id: string;
      account_name?: string;
      account_type?: string[];
      credit_account_id?: string;
      credit_account_type?: string[];
    };
    options?: {
      include_alternatives?: boolean;
      max_alternatives?: number;
      apply?: boolean;
    };
  }) =>
    fetchAPI<{
      success: boolean;
      data?: {
        posting_id: string;
        predicted_account_id: string;
        predicted_account_name: string;
        predicted_account_type: string;
        confidence: 'high' | 'medium' | 'low';
        confidence_score: number;
        reasoning: string;
        alternatives?: Array<{
          account_id: string;
          account_name: string;
          account_type: string;
          confidence_score: number;
          reasoning: string;
        }>;
        transaction_direction: 'money_in' | 'money_out';
        field_to_update: 'account_id' | 'credit_account_id';
        applied: boolean;
      };
      error?: string;
    }>('/api/agent/erp/categorize-transaction', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  categorizeTransactionBatch: async (params: {
    posting_ids?: string[];
    postings?: Array<{
      id: string;
      description: string;
      amount: number;
      value_date: string;
      account_id: string;
      account_name?: string;
      account_type?: string[];
      credit_account_id?: string;
      credit_account_type?: string[];
    }>;
    options?: {
      skip_already_categorized?: boolean;
      min_confidence?: 'high' | 'medium' | 'low';
      dry_run?: boolean;
      use_historical_matching?: boolean;
    };
  }) =>
    fetchAPI<{
      success: boolean;
      data?: {
        results: Array<{
          posting_id: string;
          predicted_account_id: string | null;
          predicted_account_name: string | null;
          confidence: 'high' | 'medium' | 'low' | null;
          confidence_score: number | null;
          reasoning: string | null;
          applied: boolean;
          skipped_reason?: string;
          error?: string;
        }>;
        summary: {
          total_processed: number;
          categorized_count: number;
          historical_match_count: number;
          llm_categorized_count: number;
          applied_count: number;
          skipped_count: number;
          skipped_by_reason: Record<string, number>;
          error_count: number;
        };
      };
      error?: string;
    }>('/api/agent/erp/categorize-transaction-batch', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  reconcileTransaction: async (params: { posting_ids: string[] }) =>
    fetchAPI<{
      success: boolean;
      data?: {
        results: Array<{
          posting: Record<string, any>;
          reconciliation: {
            status: 'SUGGESTED' | 'UNMATCHED' | 'SKIPPED';
            best_match: {
              type: 'payment_receipt' | 'invoice';
              id: string;
              reference: string;
              amount: number;
              date: string;
              customer: string | null;
              confidence: 'high' | 'medium' | 'low';
            } | null;
            alternatives: Array<{
              type: 'payment_receipt' | 'invoice';
              id: string;
              reference: string;
              amount: number;
              date: string;
              customer: string | null;
              confidence: 'high' | 'medium' | 'low';
            }>;
          } | null;
        }>;
      };
      error?: string;
    }>('/api/agent/erp/reconcile-transaction', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  confirmReconciliation: async (params: { posting_id: string }) =>
    fetchAPI<{
      success: boolean;
      data?: { posting: Record<string, any> };
      error?: string;
    }>('/api/agent/erp/confirm-reconciliation', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
};
