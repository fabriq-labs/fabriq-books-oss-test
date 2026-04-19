import { fetchAPI, uploadAPI } from "./apiClient";

// ── Invoice API ───────────────────────────────────────────────────────────────

export const invoiceAPI = {
  parseDocument: (formData: FormData) =>
    uploadAPI('/api/parse-document/invoice', { method: 'POST', body: formData }),
};

// ── Import API ────────────────────────────────────────────────────────────────

export const importAPI = {
  lookup: (type: string, data: any) =>
    fetchAPI(`/api/${type}/lookup`, { method: "POST", body: JSON.stringify(data) }),

  uploadData: async (type: string, view: string, data: FormData) =>
    uploadAPI(`/api/${type}/view/${view}/upload`, { method: "POST", body: data }),

  uploadJSON: async (type: string, view: string, data: any) =>
    fetchAPI(`/api/${type}/view/${view}/upload`, { method: "POST", body: JSON.stringify(data) }),

  /**
   * Parse PDF document using AI-powered extraction (e.g. bank statements → posting).
   */
  parseDocument: async (modelName: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return uploadAPI(`/api/parse-document/${modelName}`, { method: "POST", body: formData });
  },

  /**
   * Parse PDF document with AI-powered extraction AND categorization in a single LLM call.
   */
  parseDocumentWithCategorization: async (file: File, legalEntityId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (legalEntityId) formData.append('legalEntityId', legalEntityId);
    return uploadAPI(`/api/parse-document/posting_with_categorization`, { method: "POST", body: formData });
  },

  // Legacy method — kept for backward compatibility
  uploadPDF: (type: string, view: string, data: any) =>
    fetchAPI(`/api/${type}/view/${view}/extract`, { method: "POST", body: JSON.stringify(data) })
      .then((res: any) => res.data),
};

// ── Report API ────────────────────────────────────────────────────────────────

export const reportAPI = {
  getReport: (report_id: string, filters?: any) => {
    const payload = filters ? { filters } : {};
    return fetchAPI(`/api/report/${report_id}`, { method: 'POST', body: JSON.stringify(payload) });
  },
};
