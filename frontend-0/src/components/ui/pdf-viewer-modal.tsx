import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AttachmentViewerKind } from '@/lib/attachments/attachmentViewer';
import { Download } from 'lucide-react';

export interface PdfViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL of the document to display (e.g. blob URL from URL.createObjectURL(blob)) */
  pdfUrl: string | null;
  /** Optional title shown in the modal header */
  title?: string;
  /** Optional class name for the content container */
  className?: string;
  /** How to render the content. Defaults to PDF (sales export / email ingest). */
  contentKind?: AttachmentViewerKind;
  /** Show Download in the header (e.g. bill attachments). */
  onDownload?: () => void;
  downloadDisabled?: boolean;
  /** Loading placeholder while the blob URL is prepared */
  isLoading?: boolean;
}

/**
 * Modal document viewer: PDF (iframe), browser-native images, or unsupported fallback.
 * Pass pdfUrl (e.g. from URL.createObjectURL(blob)) and revoke it in onOpenChange(false) when done.
 */
export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  open,
  onOpenChange,
  pdfUrl,
  title = 'Document',
  className,
  contentKind = 'pdf',
  onDownload,
  downloadDisabled,
  isLoading,
}) => {
  const kind = contentKind || 'pdf';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 gap-0',
          className
        )}
      >
        <DialogHeader className="px-6 py-3 border-b shrink-0 flex flex-row items-center justify-between gap-3 space-y-0">
          <DialogTitle className="text-base font-medium truncate pr-2 flex-1 min-w-0">
            {title}
          </DialogTitle>
          {onDownload ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 mr-6"
              disabled={downloadDisabled || isLoading}
              onClick={onDownload}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download
            </Button>
          ) : null}
        </DialogHeader>
        <div className="flex-1 min-h-0 p-4">
          {isLoading || (!pdfUrl && kind !== 'unsupported') ? (
            <div className="w-full h-[70vh] min-h-[400px] rounded border bg-muted flex items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : kind === 'image' && pdfUrl ? (
            <div className="w-full h-[70vh] min-h-[400px] rounded border bg-muted flex items-center justify-center overflow-auto">
              <img
                src={pdfUrl}
                alt={title}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : kind === 'pdf' && pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={title}
              className="w-full h-[70vh] min-h-[400px] rounded border bg-muted"
            />
          ) : (
            <div className="w-full h-[70vh] min-h-[400px] rounded border bg-muted flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm px-6 text-center">
              <p>This file type can’t be previewed in the browser.</p>
              <p>You can download it instead.</p>
              {onDownload ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={downloadDisabled}
                  onClick={onDownload}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdfViewerModal;
