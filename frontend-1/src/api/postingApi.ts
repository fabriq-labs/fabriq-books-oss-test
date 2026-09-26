import Cookies from "js-cookie";
import { fetchAPI, uploadAPI, API_URL } from "./apiClient";

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
  parseDocumentWithCategorization: async (
    file: File,
    legalEntityId?: string,
    accountId?: string,
    enableChunking?: boolean,
    onProgress?: (progress: PdfParseProgress) => void
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    if (legalEntityId) formData.append('legalEntityId', legalEntityId);
    if (accountId) formData.append('accountId', accountId);
    if (enableChunking) formData.append('enableChunking', 'true');
    return readParseProgress(
      `/api/parse-document/posting_with_categorization`,
      formData,
      onProgress
    );
  },

  discardImportRun: async (importId: string, reason = 'user_discarded_in_mapper') =>
    fetchAPI(`/api/import_run/${importId}/discard`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // Legacy method — kept for backward compatibility
  uploadPDF: (type: string, view: string, data: any) =>
    fetchAPI(`/api/${type}/view/${view}/extract`, { method: "POST", body: JSON.stringify(data) })
      .then((res: any) => res.data),
};

export interface PdfParseProgress {
  phase: 'preparing' | 'extracting' | 'combining';
  message: string;
  completed?: number;
  total?: number;
  pageCount?: number;
}

/**
 * Same POST as a normal parse, but the server writes SSE progress events
 * and a final `type: result` payload.
 */
async function readParseProgress(
  endpoint: string,
  body: FormData,
  onProgress?: (progress: PdfParseProgress) => void
): Promise<any> {
  const token = Cookies.get("__session");
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body,
  });

  if (!response.ok) {
    let message = "PDF parsing failed";
    try {
      const error = await response.json();
      message = error.message || error.error || message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  if (!response.body) {
    throw new Error("PDF parsing returned an empty response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const payload = JSON.parse(dataLine.slice(5).trim());
      if (payload.type === "result") {
        result = payload;
      } else if (payload.type === "error") {
        throw new Error(payload.message || "PDF parsing failed");
      } else if (payload.type === "progress" && payload.message) {
        onProgress?.({
          phase: payload.phase,
          message: payload.message,
          completed: payload.completed,
          total: payload.total,
          pageCount: payload.pageCount,
        });
      }
    }
  }

  if (!result?.success && result?.type !== "result") {
    throw new Error("PDF parsing ended before a result");
  }
  return {
    success: result.success,
    data: result.data,
    metaData: result.metaData,
    error: result.error,
  };
}

// ── Report API ────────────────────────────────────────────────────────────────

export const reportAPI = {
  getReport: (report_id: string, filters?: any) => {
    const payload = filters ? { filters } : {};
    return fetchAPI(`/api/report/${report_id}`, { method: 'POST', body: JSON.stringify(payload) });
  },
};

// ── Posting custom actions ───────────────────────────────────────────────────

export interface MergePostingsResponse {
  success: boolean;
  data: {
    primary: Record<string, any>;
    duplicate: Record<string, any>;
  };
}

export const postingAPI = {
  /**
   * Manually merge two postings by marking one as a duplicate of the other.
   * Backend: POST /api/posting/custom/merge
   */
  merge: (primaryId: string, duplicateId: string, mergeNotes = false) =>
    fetchAPI<MergePostingsResponse>(`/api/posting/custom/merge`, {
      method: 'POST',
      body: JSON.stringify({
        primary_id: primaryId,
        duplicate_id: duplicateId,
        merge_notes: mergeNotes,
      }),
    }),
};
