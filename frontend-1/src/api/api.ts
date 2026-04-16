import { toast } from "@/hooks/use-toast";
import Cookies from "js-cookie";
const API_URL = import.meta.env.VITE_API_BASE_URL || "";
// Step 5: API Token Injection - All API calls automatically include token
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {},
  headers: HeadersInit = {}
): Promise<T> {
  try {
    const url = `${API_URL}${endpoint}`;
    const token = Cookies.get("__session");

    const response = await fetch(url, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // Token added to all requests
      },
      ...options,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.message || error.error || "API request failed"
      );
    }
    // Check if the response is JSON
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      // For non-JSON responses, return the response as is
      return response as unknown as T;
    }
  } catch (error) {
    console.error("API request error in fetchAPI:", error);
    toast({
      title: "Error",
      description:
        error instanceof Error ? error.message : "An unexpected error occurred",
      variant: "destructive",
    });
    throw error;
  }
}
async function uploadAPI<T>(
  endpoint: string,
  options: RequestInit = {},
  headers: HeadersInit = {}
): Promise<T> {
  try {
    const url = `${API_URL}${endpoint}`;
    const token = Cookies.get("__session");
    const response = await fetch(url, {
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
      ...options,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.message || error.error || "API request failed"
      );
    }
    // Check if the response is JSON
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      // For non-JSON responses, return the response as is
      return response as unknown as T;
    }
  } catch (error) {
    console.error("API request error:", error);
    toast({
      title: "Error",
      description:
        error instanceof Error ? error.message : "An unexpected error occurred",
      variant: "destructive",
    });
    throw error;
  }
}
async function fetchBinaryAPI(
  endpoint: string,
  options: RequestInit = {},
  headers: HeadersInit = {}
): Promise<Blob> {
  try {
    const url = `${API_URL}${endpoint}`;
    const token = Cookies.get("__session");
    const response = await fetch(url, {
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
      ...options,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.message || error.error || "API request failed"
      );
    }
    // Log the content type to verify what we're receiving
    const contentType = response.headers.get("content-type");
    // Get the blob directly without trying to parse as JSON
    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error("API request error in fetchBinaryAPI:", error);
    toast({
      title: "Error",
      description:
        error instanceof Error ? error.message : "An unexpected error occurred",
      variant: "destructive",
    });
    throw error;
  }
}
export const viewAPI = {
  getAll: (
    type: string,
    view: string,
    page: number = 1,
    pageSize: number = 10,
    searchTerm?: String,
    searchParam?: String
  ) => {
    const queryParams = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
      ...(searchTerm && searchParam
        ? {
          searchTerm: searchTerm.toString(),
          searchParam: searchParam.toString(),
        }
        : {}),
    });
    return fetchAPI(`/api/${type}/view/${view}?${queryParams}`)
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  getById: (type: string, id: string, view: any) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}`)
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  create: (type: string, view: any, data: any) => {
    return fetchAPI(`/api/${type}/view/${view}`, {
      method: "POST",
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  update: (type: string, id: string, view: any, data: any) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  delete: (type: string, id: string, view: any) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}`, {
      method: "DELETE",
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  /**
   * Add child(ren) to a parent record
   * 
   * This method can add either a single child or multiple children in one request.
   * The backend automatically detects if the data is an array and handles it accordingly.
   * 
   * @param type - Parent model type (e.g., "supplier", "item_master")
   * @param id - Parent record ID
   * @param view - View name
   * @param childType - Child relation name (e.g., "supplier_items")
   * @param data - Single child object OR array of child objects to add
   * 
   * @example
   * // Add a single child
   * viewAPI.addChild("supplier", "supplier_123", "supplierFullAccess", "supplier_items", {
   *   item_id: "item_123"
   * })
   * 
   * @example
   * // Add multiple children at once (backend handles arrays automatically)
   * viewAPI.addChild("supplier", "supplier_123", "supplierFullAccess", "supplier_items", [
   *   { item_id: "item_1" },
   *   { item_id: "item_2" },
   *   { item_id: "item_3" }
   * ])
   */
  addChild: (
    type: string,
    id: string,
    view: any,
    childType: any,
    data: any
  ) => {

    return fetchAPI(`/api/${type}/${id}/view/${view}/${childType}`, {
      method: "POST",
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  deleteChild: (
    type: string,
    id: string,
    view: any,
    child: any,
    child_id: string
  ) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}/${child}/${child_id}`, {
      method: "DELETE",
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  updateChild: (
    type: string,
    id: string,
    view: string,
    childType: string,
    childId: string,
    data: any
  ) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}/${childType}/${childId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  lookup: (type: string, id: string) => {
    return fetchAPI(`/api/${type}/lookup/${id}`)
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  getByView: (type: string, id: string, view: string) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}`, {
      method: "GET",
    });
  },
  search: (
    type: string,
    view: string,
    page: number = 1,
    pageSize: number = 10,
    searchTerm?: string,
    searchParam: object = {},
    sortOption: object = {}
  ) => {
    return fetchAPI(`/api/${type}/view/${view}/search`, {
      method: "POST",
      body: JSON.stringify({
        filters: searchParam || {},
        page,
        pageSize,
        sortOption,
      }),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
};
export const workflowAPI = {
  getAll: (type: string) => {
    return fetchAPI(`/api/workflow/instances/${type}/state`).then((res) => {
      return res;
    });
  },
  create: (type: string, state: any, data: any) => {
    return fetchAPI(`/api/${type}/state/${state}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getById: (type, id: string, state: string) => {
    return fetchAPI(`/api/${type}/${id}/state/${state}`, {
      method: "GET",
    });
  },
  getByStateID: (type: string, state: string) => {
    return fetchAPI(`/api/${type}/state/${state}`, {
      method: "GET",
    });
  },
  update: (workflowID: string, actionId: string, data: any) => {
    return fetchAPI(`/api/workflow/instances/${workflowID}/actions/${actionId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  createComment: (workflowInstanceId: string, data: { comment: string }) => {
    return fetchAPI(`/api/workflow/instances/${workflowInstanceId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  getComment: (type: string, id: string) => {
    return fetchAPI(`/api/workflow/instances/${type}/${id}/comments`, {
      method: "GET",
    });
  },
  getHistory: (type: string, id: string) => {
    return fetchAPI(`/api/workflow/instances/${type}/${id}/history`, {
      method: "GET",
    })
      .then((res: any) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  getQuery: (type: string, instance_id: string, state: string) => {
    return fetchAPI(`/api/${type}/${instance_id}/state/${state}/query`, {
      method: "GET",
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  createInvoice: (id: String) => {
    return fetchAPI(`/api/purchase_order/${id}/action/generate_invoice`, {
      method: "POST",
    })
      .then((res: any) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  createPayemntReceipt: (id: String, data: any) => {
    return fetchAPI(`/api/payment_receipt/${id}/action/generate_payment_receipt`, {
      method: "POST",
      body: JSON.stringify(data),
    })
      .then((res: any) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
};
export const importAPI = {
  lookup: (type: string, data: any) => {
    return fetchAPI(`/api/${type}/lookup`, {
      method: "POST",
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  uploadData: async (type: string, view: string, data: FormData) => {
    const res = await uploadAPI(`/api/${type}/view/${view}/upload`, {
      method: "POST",
      body: data,
    });
    return res;
  },
  uploadJSON: async (type: string, view: string, data: any) => {
    const res = await fetchAPI(`/api/${type}/view/${view}/upload`, {
      method: "POST",
      body: JSON.stringify(data)
    });
    return res;
  },
  /**
   * Parse PDF document using AI-powered extraction
   * 
   * This API endpoint uses Google's Gemini AI to extract structured data from PDF documents.
   * The backend has specialized extractors (like BankStatementExtractor) that map PDF content
   * to specific database models (e.g., 'posting' for bank statements).
   * 
   * @param modelName - Target model name (e.g., 'posting' for bank statements)
   * @param file - PDF file to process (max 10MB)
   * @returns Promise with extraction result containing structured data
   * 
   * Backend Response Format:
   * {
   *   "success": true,
   *   "data": {
   *     "transactions": [...], // Array of extracted records
   *     "accountContext": {...} // Additional context (ignored in frontend)
   *   },
   *   "metaData": {
   *     "confidence": 100,
   *     "processingTime": 13446,
   *     "extractorType": "BankStatementExtractor"
   *   }
   * }
   * 
   * Processing Time: Typically 6-8 seconds for bank statements
   * Supported Models: 'posting' (bank statements), 'invoice' (planned), 'expense_report' (planned)
   */
  parseDocument: async (modelName: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await uploadAPI(`/api/parse-document/${modelName}`, {
      method: "POST",
      body: formData,
    });
    return res;
  },
  /**
   * Parse PDF document with AI-powered extraction AND categorization
   *
   * This API endpoint combines document extraction with transaction categorization
   * in a single LLM call, providing both extracted data and predicted categories.
   *
   * @param file - PDF file to process (max 10MB)
   * @param legalEntityId - Optional: specific legal entity for Chart of Accounts lookup
   * @returns Promise with extraction + categorization result
   *
   * Backend Response Format:
   * {
   *   "success": true,
   *   "data": {
   *     "transactions": [...],  // Array of extracted transactions
   *     "categorizations": [{   // AI category predictions
   *       "transaction_index": 0,
   *       "predicted_account_id": "acct_xxx",
   *       "predicted_account_name": "Office Supplies",
   *       "confidence_score": 0.85,
   *       "reasoning": "Description contains 'supplies'"
   *     }],
   *     "accountContext": {...}
   *   },
   *   "metaData": {
   *     "confidence": 90,
   *     "processingTime": 8500,
   *     "extractorType": "BankStatementWithCategorizationExtractor"
   *   }
   * }
   */
  parseDocumentWithCategorization: async (file: File, legalEntityId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (legalEntityId) {
      formData.append('legalEntityId', legalEntityId);
    }

    const res = await uploadAPI(`/api/parse-document/posting_with_categorization`, {
      method: "POST",
      body: formData,
    });
    return res;
  },
  // Legacy method - kept for backward compatibility but deprecated
  uploadPDF: (type: string, view: string, data: any) => {
    return fetchAPI(`/api/${type}/view/${view}/extract`, {
      method: "POST",
      body: JSON.stringify(data),
    })
      .then((res: any) => {
        return res.data;
      })
      .catch((err) => {
        throw err;
      });
  },
};
export const reportAPI = {
  getReport: (report_id: string, filters?: any) => {
    const payload = filters ? { filters } : {};
    return fetchAPI(`/api/report/${report_id}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
};
export const bulkEditAPI = {
  updateBulkData: (type: string, view: string, data: any) => {
    return fetchAPI(`/api/${type}/view/${view}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  bulkDelete: (type: string, view: string, ids: any[]) => {
    return fetchAPI(`/api/${type}/view/${view}`, {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    })
      .then((res) => res)
      .catch((err) => {
        throw err;
      });
  },
};
export interface GenerateApiKeyResponse {
  api_key: string;
  email: string;
  message: string;
}

export const userAPI = {
  getCurrentUser: () => {
    return fetchAPI(`/api/metadata/user/me`, {
      method: "GET",
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  /** Creates a new API key (sent as X-API-Key); replaces any existing key. Plaintext returned once. */
  generateApiKey: () =>
    fetchAPI<GenerateApiKeyResponse>(`/api/auth/generate-api-key`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

export const invoiceAPI = {
  parseDocument: (formData: FormData) => {
    return uploadAPI('/api/parse-document/invoice', {
      method: 'POST',
      body: formData,
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
};

// ── Agent Session & Pending Action APIs ───────────────────────
// All endpoints return { data: ... } — unwrap with .then(r => r.data)
export const sessionAPI = {
  create: (data: { goal: string; mode?: string; goal_model?: string; template_id?: string }) =>
    fetchAPI<any>('/api/agent/sessions', { method: 'POST', body: JSON.stringify(data) })
      .then((r: any) => r.data),

  list: () =>
    fetchAPI<any>('/api/agent/sessions')
      .then((r: any) => r.data),

  get: (id: string) =>
    fetchAPI<any>(`/api/agent/sessions/${id}`)
      .then((r: any) => r.data),

  update: (id: string, data: any) =>
    fetchAPI<any>(`/api/agent/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
      .then((r: any) => r.data),

  getMessages: (id: string) =>
    fetchAPI<any>(`/api/agent/sessions/${id}/messages`)
      .then((r: any) => r.data),

  getTrace: (id: string) =>
    fetchAPI<any>(`/api/agent/sessions/${id}/trace`)
      .then((r: any) => r.data),

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
      // Consume the stream so the server keeps running
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

export const agentTemplateAPI = {
  list: () =>
    fetchAPI<any>('/api/agent/templates')
      .then((r: any) => r.data as AgentTemplate[]),
};

export interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  goal_model: string | null;
  default_mode: string;
  user_hint: string | null;
  sort_order: number;
}

export const pendingActionAPI = {
  list: (params?: { session_id?: string; batch_id?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.session_id) query.set('session_id', params.session_id);
    if (params?.batch_id) query.set('batch_id', params.batch_id);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return fetchAPI<any>(`/api/agent/pending-actions${qs ? `?${qs}` : ''}`)
      .then((r: any) => r.data);
  },

  get: (id: string) =>
    fetchAPI<any>(`/api/agent/pending-actions/${id}`)
      .then((r: any) => r.data),

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

export const agentAPI = {
  extract: (file: File, prompt?: string, context?: Record<string, any>) => {
    const formData = new FormData();
    formData.append('file', file);

    if (prompt) {
      formData.append('prompt', prompt);
    }

    if (context) {
      formData.append('context', JSON.stringify(context));
    }

    return uploadAPI('/api/agent/extract', {
      method: 'POST',
      body: formData,
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  /**
   * Reassign attachments from one instance to another (generic).
   * POST /api/attachments/reassign
   */
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

  /**
   * Move attachments from an email ingest item to an invoice (after creating invoice from "Process invoice").
   * Uses reassignAttachments with instance_email_ingest_item → invoice.
   */
  moveAttachmentsToInvoice: (itemId: string, invoiceId: string) =>
    agentAPI.reassignAttachments({
      fromType: 'instance_email_ingest_item',
      fromInstanceId: itemId,
      toType: 'invoice',
      toInstanceId: invoiceId,
    }),

  /**
   * Fetch first PDF attachment as Blob using existing list + download APIs.
   * Uses GET /api/:type/:id/attachment (list) then GET /api/:type/:id/attachment/:attachmentId (download).
   */
  getAttachmentBlob: async (type: string, id: string): Promise<Blob> => {
    const list = await attachmentAPI.get(type, id);
    const first = (Array.isArray(list) ? list : (list as any)?.data ?? [])[0];
    if (!first?.id) throw new Error('Attachment not found');
    return attachmentAPI.getFile(type, id, first.id);
  },

  /**
   * Fetch PDF for an email ingest item as Blob. Uses invoice attachment when item is processed (instance_id set), else item attachment.
   */
  getEmailIngestItemPdfBlob: (itemId: string, instanceId?: string | null): Promise<Blob> =>
    agentAPI.getAttachmentBlob(
      instanceId ? 'invoice' : 'instance_email_ingest_item',
      instanceId ?? itemId
    ),

  /**
   * Categorize a single transaction using AI
   * 
   * @param params - Either posting_id or posting_data required
   * @returns Promise with categorization result
   * 
   * @example
   * // Using posting ID
   * agentAPI.categorizeTransaction({
   *   posting_id: 'post_123',
   *   options: { apply: true, include_alternatives: true }
   * })
   */
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
  }) => {
    return fetchAPI<{
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
    });
  },

  /**
   * Categorize multiple transactions in batch using AI
   * 
   * @param params - Either posting_ids or postings array required
   * @returns Promise with batch categorization results
   * 
   * @example
   * // Using posting IDs
   * agentAPI.categorizeTransactionBatch({
   *   posting_ids: ['post_1', 'post_2', 'post_3'],
   *   options: { 
   *     skip_already_categorized: true,
   *     min_confidence: 'medium',
   *     dry_run: false 
   *   }
   * })
   */
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
  }) => {
    return fetchAPI<{
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
    });
  },

  /**
   * Reconcile one or more transactions (categorize + match invoices/receipts)
   * 
   * Runs the full pipeline: AI categorization → reconciliation matching.
   * Each posting is updated in-place; the response returns an array of results,
   * each containing the updated posting plus reconciliation suggestions.
   * 
   * @param params - posting_ids required (works for single or batch)
   * @returns Promise with array of { posting, reconciliation } results
   * 
   * @example
   * // Single posting
   * agentAPI.reconcileTransaction({ posting_ids: ['post_123'] })
   * // Batch
   * agentAPI.reconcileTransaction({ posting_ids: ['post_1', 'post_2', 'post_3'] })
   */
  reconcileTransaction: async (params: {
    posting_ids: string[];
  }) => {
    return fetchAPI<{
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
    });
  },

  /**
   * Confirm reconciliation: create payment receipt (if match is invoice) or link posting to existing receipt.
   * POST /api/agent/erp/confirm-reconciliation
   *
   * Returns the full posting in data_graph shape (same nested relationships as
   * the list view) so it can be merged into the table without a full reload.
   */
  confirmReconciliation: async (params: { posting_id: string }) => {
    return fetchAPI<{
      success: boolean;
      data?: {
        posting: Record<string, any>;
      };
      error?: string;
    }>('/api/agent/erp/confirm-reconciliation', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

export const workflowManagementAPI = {
  getFlows: () => {
    return fetchAPI('/api/workflow/flows')
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  getFlowById: (flowId: string) => {
    return fetchAPI(`/api/workflow/flows/${flowId}`)
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  updateState: (flowId: string, stateId: string, data: any) => {
    return fetchAPI(`/api/workflow/flows/${flowId}/states/${stateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  toggleStateActive: (flowId: string, stateId: string, is_active: boolean) => {
    return fetchAPI(`/api/workflow/flows/${flowId}/states/${stateId}/toggle-active`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  batchUpdateStates: (flowId: string, states: Array<{ id: string; sequence?: number;[key: string]: any }>) => {
    return fetchAPI(`/api/workflow/flows/${flowId}/states`, {
      method: 'PUT',
      body: JSON.stringify({ states }),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  updateAction: (flowId: string, stateId: string, actionId: string, data: { side_effects?: any; name?: string; description?: string }) => {
    return fetchAPI(`/api/workflow/flows/${flowId}/states/${stateId}/actions/${actionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
};

export const erpConnectionsAPI = {
  getAll: () => {
    return fetchAPI('/api/source_system/view/default')
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  getById: (id: string) => {
    return fetchAPI(`/api/source_system/${id}/view/default`)
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  create: (data: any) => {
    return fetchAPI('/api/source_system/view/default', {
      method: 'POST',
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  update: (id: string, data: any) => {
    return fetchAPI(`/api/source_system/${id}/view/default`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  delete: (id: string) => {
    return fetchAPI(`/api/source_system/${id}/view/default`, {
      method: 'DELETE',
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  testConnection: (systemType: string, credentials: any, connectionId?: string) => {
    return fetchAPI('/api/source_system/test-connection', {
      method: 'POST',
      body: JSON.stringify({
        system_type: systemType,
        oauth: credentials,
        connection_id: connectionId,
      }),
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  fetchExpenseAccounts: (connectionId: string) => {
    if (!connectionId) {
      return Promise.reject(new Error('Connection ID is required'));
    }

    return fetchAPI(`/api/actions/source_system/${connectionId}/fetch-expense-accounts`, {
      method: 'POST',
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },

  /**
   * Triggers integration sync with selectable sync_mode.
   * Supported values:
   * - full_sync
   * - transform_only
   * - extract_only
   */
  triggerSync: (id: string, syncMode: 'full_sync' | 'transform_only' | 'extract_only' = 'full_sync') => {
    return fetchAPI(`/api/source_system/${id}/sync`, {
      method: 'POST',
      body: JSON.stringify({ sync_mode: syncMode }),
    })
      .then((res) => res)
      .catch((err) => {
        throw err;
      });
  },
};

export const attachmentAPI = {
  get: (type: string, id: any) => {
    return fetchAPI
      (`/api/${type}/${id}/attachment`, {
        method: "GET",
      })
      .then((res: any) => {
        return res.data;
      }).catch((err) => {
        throw err;
      });
  },
  getFile: (type: string, instance_id: any, id: any) => {
    console.log("attachmentAPI.getFile called for:", type, instance_id, id);
    return fetchBinaryAPI(`/api/${type}/${instance_id}/attachment/${id}`, {
      method: "GET",
      headers: {
        'Accept': 'application/octet-stream'
      }
    })
      .then((blob) => {
        console.log("File download successful, blob size:", blob.size);
        return blob;
      })
      .catch((err) => {
        console.error('Error downloading file:', err);
        throw err;
      });
  },
  create: (type: string, id: any, formData: any) => {
    return uploadAPI(`/api/${type}/${id}/attachment`, {
      method: "POST",
      body: formData,
    })
      .then((res) => {
        if (res instanceof Response) {
          return res.json();
        }
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  delete: (type: string, id: any, attachment_id: any) => {
    return fetchAPI(`/api/${type}/${id}/attachment/${attachment_id}`, {
      method: "DELETE",
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
  directDownloadFile: async (type: string, instance_id: any, id: any) => {
    console.log("directDownloadFile called for:", type, instance_id, id);
    try {
      const url = `${API_URL}/api/${type}/${instance_id}/attachment/${id}`;
      const token = Cookies.get("__session");
      const response = await fetch(url, {
        method: "GET",
        headers: {
          'Accept': 'application/octet-stream',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const contentType = response.headers.get("content-type");
      console.log("Response content type:", contentType);
      const blob = await response.blob();
      console.log("Blob received, size:", blob.size);
      return blob;
    } catch (error) {
      console.error("Error in directDownloadFile:", error);
      throw error;
    }
  },
};

export const datagraphAPI = {
  getDataGraph: (model: string, view: string) => {
    return fetchAPI(`/api/datagraph/${model}/${view}`, {
      method: 'GET',
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
};

export interface OnboardTenantPayload {
  tenant: { name: string; slug: string; settings?: string | Record<string, unknown> };
  adminUsers: { email: string; name?: string; password: string }[];
}

export interface OnboardTenantResponse {
  success: boolean;
  orgId: string;
  userIds: string[];
}

export type DemoDataOption =
  | 'indian-demo'
  | 'us-ca-demo'
  | 'perfin-demo'
  | 'both'
  | 'nri';

/** Mirrors `setup-db.js` flags. `runTests` defaults false server-side (skip tests unless true). */
export interface DemoDatabaseResetPayload {
  demoData: DemoDataOption;
  demoDataOnly?: boolean;
  runTests?: boolean;
}

export interface DemoDatabaseResetResponse {
  success: boolean;
  message: string;
}

export interface SyncMetadataCounts {
  created: number;
  updated: number;
  errors: number;
}

export interface DevOptionsSyncMetadataResponse {
  success: boolean;
  message: string;
  stats: {
    views: SyncMetadataCounts;
    promptTemplates: SyncMetadataCounts;
    agentTemplatesSeeded: boolean;
  };
  agentTemplatesSeeded: boolean;
}

export const adminAPI = {
  devOptionsSyncMetadata: async (): Promise<DevOptionsSyncMetadataResponse> => {
    const API_URL = import.meta.env.VITE_API_BASE_URL || '';
    const token = Cookies.get('__session');
    const response = await fetch(`${API_URL}/api/admin/dev-options/sync-metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error || data?.message || 'Failed to sync metadata';
      throw new Error(msg);
    }
    return data as DevOptionsSyncMetadataResponse;
  },

  demoDatabaseReset: async (
    payload: DemoDatabaseResetPayload
  ): Promise<DemoDatabaseResetResponse> => {
    const API_URL = import.meta.env.VITE_API_BASE_URL || '';
    const token = Cookies.get('__session');
    const response = await fetch(`${API_URL}/api/admin/demo-database-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error || data?.message || 'Failed to start demo database reset';
      throw new Error(msg);
    }
    return data as DemoDatabaseResetResponse;
  },

  onboardTenant: async (payload: OnboardTenantPayload): Promise<OnboardTenantResponse> => {
    const API_URL = import.meta.env.VITE_API_BASE_URL || '';
    const token = Cookies.get('__session');
    const response = await fetch(`${API_URL}/api/admin/onboard-tenant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error || data?.message || 'Failed to onboard tenant';
      throw new Error(msg);
    }
    return data as OnboardTenantResponse;
  },
};

export const modelSchemaAPI = {
  /**
   * Get model schema (fields and relations) for datagraph builder
   *
   * @param modelName - The Prisma model name (e.g., "supplier", "purchase_order")
   * @returns Promise with model schema containing scalar fields and relations
   *
   * Response format:
   * {
   *   "success": true,
   *   "data": {
   *     "modelName": "supplier",
   *     "scalarFields": [
   *       { "name": "id", "type": "String", "isRequired": true, "isId": true, ... },
   *       { "name": "supplier_name", "type": "String", "isRequired": true, ... }
   *     ],
   *     "relations": [
   *       { "name": "payment_terms", "type": "payment_terms", "relationType": "manyToOne", ... }
   *     ]
   *   }
   * }
   */
  getSchema: (modelName: string) => {
    return fetchAPI(`/api/models/${modelName}/schema`, {
      method: 'GET',
    })
      .then((res) => {
        return res;
      })
      .catch((err) => {
        throw err;
      });
  },
};