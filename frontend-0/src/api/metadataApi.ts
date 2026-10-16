import Cookies from "js-cookie";
import { fetchAPI, fetchBinaryAPI, uploadAPI, API_URL } from "./apiClient";

// ── View API ──────────────────────────────────────────────────────────────────

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
    return fetchAPI(`/api/${type}/view/${view}?${queryParams}`);
  },
  getById: (type: string, id: string, view: any) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}`);
  },
  create: (type: string, view: any, data: any) => {
    return fetchAPI(`/api/${type}/view/${view}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  update: (type: string, id: string, view: any, data: any) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  delete: (type: string, id: string, view: any) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}`, {
      method: "DELETE",
    });
  },
  /**
   * Add child(ren) to a parent record.
   * The backend auto-detects if data is an array and handles it accordingly.
   */
  addChild: (type: string, id: string, view: any, childType: any, data: any) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}/${childType}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  deleteChild: (type: string, id: string, view: any, child: any, child_id: string) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}/${child}/${child_id}`, {
      method: "DELETE",
    });
  },
  updateChild: (type: string, id: string, view: string, childType: string, childId: string, data: any) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}/${childType}/${childId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  lookup: (type: string, id: string) => {
    return fetchAPI(`/api/${type}/lookup/${id}`);
  },
  getByView: (type: string, id: string, view: string) => {
    return fetchAPI(`/api/${type}/${id}/view/${view}`, { method: "GET" });
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
      body: JSON.stringify({ filters: searchParam || {}, page, pageSize, sortOption }),
    });
  },
};

// ── Workflow API ───────────────────────────────────────────────────────────────

export const workflowAPI = {
  getAll: (type: string) => fetchAPI(`/api/workflow/instances/${type}/state`),
  create: (type: string, state: any, data: any) =>
    fetchAPI(`/api/${type}/state/${state}`, { method: "POST", body: JSON.stringify(data) }),
  getById: (type: any, id: string, state: string) =>
    fetchAPI(`/api/${type}/${id}/state/${state}`, { method: "GET" }),
  getByStateID: (type: string, state: string) =>
    fetchAPI(`/api/${type}/state/${state}`, { method: "GET" }),
  update: (workflowID: string, actionId: string, data: any) =>
    fetchAPI(`/api/workflow/instances/${workflowID}/actions/${actionId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createComment: (workflowInstanceId: string, data: { comment: string }) =>
    fetchAPI(`/api/workflow/instances/${workflowInstanceId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getComment: (type: string, id: string) =>
    fetchAPI(`/api/workflow/instances/${type}/${id}/comments`, { method: "GET" }),
  getHistory: (type: string, id: string) =>
    fetchAPI(`/api/workflow/instances/${type}/${id}/history`, { method: "GET" }),
  getQuery: (type: string, instance_id: string, state: string) =>
    fetchAPI(`/api/${type}/${instance_id}/state/${state}/query`, { method: "GET" }),
  createInvoice: (id: String) =>
    fetchAPI(`/api/purchase_order/${id}/action/generate_invoice`, { method: "POST" }),
  createPayemntReceipt: (id: String, data: any) =>
    fetchAPI(`/api/payment_receipt/${id}/action/generate_payment_receipt`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ── Workflow Management API ────────────────────────────────────────────────────

export const workflowManagementAPI = {
  getFlows: () => fetchAPI('/api/workflow/flows'),
  getFlowById: (flowId: string) => fetchAPI(`/api/workflow/flows/${flowId}`),
  updateState: (flowId: string, stateId: string, data: any) =>
    fetchAPI(`/api/workflow/flows/${flowId}/states/${stateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleStateActive: (flowId: string, stateId: string, is_active: boolean) =>
    fetchAPI(`/api/workflow/flows/${flowId}/states/${stateId}/toggle-active`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    }),
  batchUpdateStates: (flowId: string, states: Array<{ id: string; sequence?: number; [key: string]: any }>) =>
    fetchAPI(`/api/workflow/flows/${flowId}/states`, {
      method: 'PUT',
      body: JSON.stringify({ states }),
    }),
  updateAction: (flowId: string, stateId: string, actionId: string, data: { side_effects?: any; name?: string; description?: string }) =>
    fetchAPI(`/api/workflow/flows/${flowId}/states/${stateId}/actions/${actionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ── Bulk Edit API ─────────────────────────────────────────────────────────────

export const bulkEditAPI = {
  updateBulkData: (type: string, view: string, data: any) =>
    fetchAPI(`/api/${type}/view/${view}`, { method: "PUT", body: JSON.stringify(data) }),
  bulkDelete: (type: string, view: string, ids: any[]) =>
    fetchAPI(`/api/${type}/view/${view}`, { method: "DELETE", body: JSON.stringify({ ids }) }),
};

// ── Model Schema API ──────────────────────────────────────────────────────────

export const modelSchemaAPI = {
  getSchema: (modelName: string) => fetchAPI(`/api/models/${modelName}/schema`, { method: 'GET' }),
};

// ── Datagraph API ─────────────────────────────────────────────────────────────

export const datagraphAPI = {
  getDataGraph: (model: string, view: string) =>
    fetchAPI(`/api/datagraph/${model}/${view}`, { method: 'GET' }),
};

// ── User API ──────────────────────────────────────────────────────────────────

export interface GenerateApiKeyResponse {
  api_key: string;
  email: string;
  message: string;
}

export const userAPI = {
  getCurrentUser: () => fetchAPI(`/api/metadata/user/me`, { method: "GET" }),

  /** Creates a new API key; replaces any existing key. Plaintext returned once. */
  generateApiKey: () =>
    fetchAPI<GenerateApiKeyResponse>(`/api/auth/generate-api-key`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /** Change password (local auth only). Caller handles errors (no global toast). */
  changePassword: async (params: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ success: boolean }> => {
    const token = Cookies.get("__session");
    const response = await fetch(`${API_URL}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      body: JSON.stringify(params),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!response.ok) {
      throw new Error(data.error || data.message || "Failed to change password");
    }
    return data as { success: boolean };
  },
};

// ── ERP Connections API ───────────────────────────────────────────────────────

export const erpConnectionsAPI = {
  getAll: () => fetchAPI('/api/source_system/view/default'),
  getById: (id: string) => fetchAPI(`/api/source_system/${id}/view/default`),
  create: (data: any) =>
    fetchAPI('/api/source_system/view/default', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    fetchAPI(`/api/source_system/${id}/view/default`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    fetchAPI(`/api/source_system/${id}/view/default`, { method: 'DELETE' }),
  testConnection: (systemType: string, credentials: any, connectionId?: string) =>
    fetchAPI('/api/source_system/test-connection', {
      method: 'POST',
      body: JSON.stringify({ system_type: systemType, oauth: credentials, connection_id: connectionId }),
    }),
  fetchExpenseAccounts: (connectionId: string) => {
    if (!connectionId) return Promise.reject(new Error('Connection ID is required'));
    return fetchAPI(`/api/actions/source_system/${connectionId}/fetch-expense-accounts`, { method: 'POST' });
  },
  triggerSync: (id: string, syncMode: 'full_sync' | 'transform_only' | 'extract_only' = 'full_sync') =>
    fetchAPI(`/api/source_system/${id}/sync`, {
      method: 'POST',
      body: JSON.stringify({ sync_mode: syncMode }),
    }),
};

// ── Attachment API ────────────────────────────────────────────────────────────

export const attachmentAPI = {
  get: (type: string, id: any) =>
    fetchAPI(`/api/${type}/${id}/attachment`, { method: "GET" }).then((res: any) => res.data),
  getFile: (type: string, instance_id: any, id: any) =>
    fetchBinaryAPI(`/api/${type}/${instance_id}/attachment/${id}`, {
      method: "GET",
      headers: { 'Accept': 'application/octet-stream' },
    }),
  create: (type: string, id: any, formData: any) =>
    uploadAPI(`/api/${type}/${id}/attachment`, { method: "POST", body: formData }).then((res) => {
      if (res instanceof Response) return (res as Response).json();
      return res;
    }),
  delete: (type: string, id: any, attachment_id: any) =>
    fetchAPI(`/api/${type}/${id}/attachment/${attachment_id}`, { method: "DELETE" }),
  directDownloadFile: async (type: string, instance_id: any, id: any) => {
    const token = Cookies.get("__session");
    const response = await fetch(`${API_URL}/api/${type}/${instance_id}/attachment/${id}`, {
      method: "GET",
      headers: { 'Accept': 'application/octet-stream', 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.blob();
  },
};
