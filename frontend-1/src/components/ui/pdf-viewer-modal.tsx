import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface PdfViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL of the PDF to display (e.g. blob URL from URL.createObjectURL(blob)) */
  pdfUrl: string | null;
  /** Optional title shown in the modal header */
  title?: string;
  /** Optional class name for the content container */
  className?: string;
}

/**
 * Reusable modal that displays a PDF in an iframe.
 * Pass pdfUrl (e.g. from URL.createObjectURL(blob)) and call onOpenChange(false) on close.
 * When closing, the parent should revoke the blob URL if applicable.
 */
export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  open,
  onOpenChange,
  pdfUrl,
  title = 'PDF',
  className,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 gap-0',
          className
        )}
      >
        <DialogHeader className="px-6 py-3 border-b shrink-0">
          <DialogTitle className="text-base font-medium truncate pr-8">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 p-4">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={title}
              className="w-full h-[70vh] min-h-[400px] rounded border bg-muted"
            />
          ) : (
            <div className="w-full h-[70vh] min-h-[400px] rounded border bg-muted flex items-center justify-center text-muted-foreground text-sm">
              Loading PDF…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdfViewerModal;
