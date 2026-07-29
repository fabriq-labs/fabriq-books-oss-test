import React, { useState, useEffect, useCallback } from "react";
import { Upload, Button, notification, UploadProps, UploadFile } from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PaperClipOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { attachmentAPI } from "@/api/api";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";
import {
  blobForInlineView,
  resolveAttachmentViewer,
  type AttachmentViewerKind,
} from "@/lib/attachments/attachmentViewer";

interface AttachmentProps {
  model: string;
  id: string;
  isViewMode?: any;
  disabled?: boolean;
}

function toUploadFiles(rows: any[]): UploadFile[] {
  return (rows || []).map((item: any) => ({
    uid: String(item.id),
    name: String(item.name || "file"),
    status: "done" as const,
  }));
}

export const Attachment: React.FC<AttachmentProps> = ({
  model,
  id,
  disabled,
}) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [api, contextHolder] = notification.useNotification();

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("Document");
  const [viewerKind, setViewerKind] = useState<AttachmentViewerKind>("pdf");
  const [viewerFileMeta, setViewerFileMeta] = useState<{
    attachmentId: string;
    fileName: string;
  } | null>(null);

  const revokeViewerUrl = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  const refreshList = useCallback(async () => {
    if (!id) return [];
    const res = await attachmentAPI.get(model, id);
    const formatted = toUploadFiles(res);
    setFileList(formatted);
    return formatted;
  }, [model, id]);

  useEffect(() => {
    if (!id) return;
    void refreshList().catch((err: any) => {
      api.error({
        message: err?.message || "Failed to load attachments",
        placement: "bottomRight",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when model/id change
  }, [model, id, refreshList]);

  /** Prefer real DB ids; fall back to name match if antd still has a temp uid. */
  const resolveAttachmentId = async (file: UploadFile): Promise<string | null> => {
    const uid = String(file.uid || "");
    if (uid && !uid.startsWith("rc-upload-") && uid !== "-1") {
      return uid;
    }
    const rows = await attachmentAPI.get(model, id);
    const match =
      (rows || []).find((a: any) => a.name === file.name) ||
      (rows || [])[0];
    return match?.id ? String(match.id) : null;
  };

  const handleUpload: UploadProps["customRequest"] = async (options) => {
    const { file, onSuccess, onError } = options;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file as Blob);
      formData.append("data", JSON.stringify({ name: (file as File).name }));
      const res = await attachmentAPI.create(model, id, formData);
      // Reload from server so uid is the real attachment id (not rc-upload-*).
      await refreshList();
      onSuccess?.(res as any);
      api.success({ message: "File uploaded successfully", placement: "bottomRight" });
    } catch (error: any) {
      onError?.(error instanceof Error ? error : new Error(String(error?.message || error)));
      api.error({ message: error?.message || "Upload failed", placement: "topRight" });
    } finally {
      setUploading(false);
    }
  };

  const getAttachmentFileDownload = async (
    attachment_id: string,
    fileName: string
  ) => {
    try {
      const blob = await attachmentAPI.directDownloadFile(model, id, attachment_id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      api.success({
        message: "File downloaded successfully!",
        placement: "bottomRight",
      });
    } catch (err: any) {
      console.error("Error in getAttachmentFileDownload:", err);
      api.error({
        message: err?.message || "Download failed",
        placement: "bottomRight",
      });
    }
  };

  const handleView = async (file: UploadFile) => {
    const fileName = String(file.name || "Document");
    setViewerOpen(true);
    setViewerLoading(true);
    setViewerTitle(fileName);
    revokeViewerUrl(viewerUrl);
    setViewerUrl(null);

    const { mime, kind } = resolveAttachmentViewer(fileName);
    setViewerKind(kind);

    try {
      const attachmentId = await resolveAttachmentId(file);
      if (!attachmentId) {
        throw new Error("Attachment not found. Try refreshing the page.");
      }
      setViewerFileMeta({ attachmentId, fileName });

      if (kind === "unsupported") {
        setViewerUrl(null);
        return;
      }

      const blob = await attachmentAPI.directDownloadFile(model, id, attachmentId);
      const typed = blobForInlineView(blob, mime);
      setViewerUrl(URL.createObjectURL(typed));
    } catch (err: any) {
      setViewerOpen(false);
      api.error({
        message: err?.message || "Could not open file",
        placement: "bottomRight",
      });
    } finally {
      setViewerLoading(false);
    }
  };

  const handleViewerOpenChange = (open: boolean) => {
    if (!open) {
      revokeViewerUrl(viewerUrl);
      setViewerUrl(null);
      setViewerFileMeta(null);
      setViewerLoading(false);
    }
    setViewerOpen(open);
  };

  const handleViewerDownload = () => {
    if (!viewerFileMeta) return;
    void getAttachmentFileDownload(viewerFileMeta.attachmentId, viewerFileMeta.fileName);
  };

  const handleRemove = async (file: UploadFile) => {
    try {
      const attachmentId = await resolveAttachmentId(file);
      if (!attachmentId) {
        throw new Error("Attachment not found");
      }
      const res: any = await attachmentAPI.delete(model, id, attachmentId);
      await refreshList();
      api.success({
        message: res?.message || res?.deleteRes?.message || "Attachment deleted",
        placement: "bottomRight",
      });
      return true;
    } catch (error: any) {
      api.error({
        message: error?.message || "Delete failed",
        placement: "bottomRight",
      });
      // Keep the row if delete failed
      return false;
    }
  };

  return (
    <div className="upload-div">
      <Upload
        fileList={fileList}
        // Do not let antd replace server ids with rc-upload-* after customRequest.
        // Uploading progress is tracked via the Upload button loading state.
        onChange={() => undefined}
        multiple
        customRequest={handleUpload}
        showUploadList={{
          // Custom itemRender owns the action row (View + Download + Delete together)
          showDownloadIcon: false,
          showRemoveIcon: false,
          showPreviewIcon: false,
        }}
        itemRender={(_originNode, file) => (
          <div className="ant-upload-list-item ant-upload-list-item-done flex items-center justify-between gap-2 w-full py-1">
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <PaperClipOutlined className="text-muted-foreground shrink-0" />
              <span className="ant-upload-list-item-name truncate" title={file.name}>
                {file.name}
              </span>
            </span>
            <span className="ant-upload-list-item-actions flex items-center shrink-0 gap-0.5">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                title="View"
                aria-label={`View ${file.name}`}
                onClick={() => void handleView(file)}
              />
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                title="Download"
                aria-label={`Download ${file.name}`}
                onClick={() => {
                  void (async () => {
                    const attachmentId = await resolveAttachmentId(file);
                    if (!attachmentId) {
                      api.error({
                        message: "Attachment not found",
                        placement: "bottomRight",
                      });
                      return;
                    }
                    await getAttachmentFileDownload(attachmentId, String(file.name));
                  })();
                }}
              />
              {!disabled ? (
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  title="Delete"
                  aria-label={`Delete ${file.name}`}
                  onClick={() => void handleRemove(file)}
                />
              ) : null}
            </span>
          </div>
        )}
      >
        <Button icon={<UploadOutlined />} loading={uploading} disabled={disabled || !id}>
          Upload
        </Button>
      </Upload>
      <PdfViewerModal
        open={viewerOpen}
        onOpenChange={handleViewerOpenChange}
        pdfUrl={viewerUrl}
        title={viewerTitle}
        contentKind={viewerKind}
        isLoading={viewerLoading}
        onDownload={handleViewerDownload}
        downloadDisabled={!viewerFileMeta}
      />
      {contextHolder}
    </div>
  );
};
