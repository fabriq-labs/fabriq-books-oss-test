import { API_URL, fetchAPI, getAuthToken, uploadAPI } from "./apiClient";

export interface PdfParseProgress {
  phase: "preparing" | "extracting" | "combining";
  message: string;
  completed?: number;
  total?: number;
  pageCount?: number;
}

/** CSV and PDF import calls used by the kernel import panel. */
export const importAPI = {
  uploadData: (type: string, view: string, data: FormData) =>
    uploadAPI(`/api/${type}/view/${view}/upload`, { method: "POST", body: data }),

  parseDocument: (modelName: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return uploadAPI(`/api/parse-document/${modelName}`, { method: "POST", body: formData });
  },

  parseDocumentWithCategorization: (
    file: File,
    legalEntityId?: string,
    accountId?: string,
    enableChunking?: boolean,
    onProgress?: (progress: PdfParseProgress) => void
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (legalEntityId) formData.append("legalEntityId", legalEntityId);
    if (accountId) formData.append("accountId", accountId);
    if (enableChunking) formData.append("enableChunking", "true");
    return readParseProgress("/api/parse-document/posting_with_categorization", formData, onProgress);
  },

  discardImportRun: (importId: string, reason = "user_discarded_in_mapper") =>
    fetchAPI(`/api/import_run/${importId}/discard`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

async function readParseProgress(
  endpoint: string,
  body: FormData,
  onProgress?: (progress: PdfParseProgress) => void
): Promise<any> {
  const token = getAuthToken();
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
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((entry) => entry.startsWith("data:"));
      if (!line) continue;
      const payload = JSON.parse(line.slice(5).trim());
      if (payload.type === "result") result = payload.result ?? payload;
      else if (payload.phase) onProgress?.(payload);
    }
  }

  if (!result) throw new Error("PDF parsing ended without a result");
  return result;
}
