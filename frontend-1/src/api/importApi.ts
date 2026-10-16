import { fetchAPI, uploadAPI } from "./apiClient";

/** CSV and PDF import calls used by the kernel import panel. */
export const importAPI = {
  uploadData: (type: string, view: string, data: FormData) =>
    uploadAPI(`/api/${type}/view/${view}/upload`, { method: "POST", body: data }),

  parseDocument: (modelName: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return uploadAPI(`/api/parse-document/${modelName}`, { method: "POST", body: formData });
  },

  discardImportRun: (importId: string, reason = "user_discarded_in_mapper") =>
    fetchAPI(`/api/import_run/${importId}/discard`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
