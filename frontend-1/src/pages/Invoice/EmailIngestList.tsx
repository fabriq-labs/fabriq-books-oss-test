import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { viewAPI, agentAPI } from '@/api/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PdfViewerModal } from '@/components/ui/pdf-viewer-modal';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODEL = 'instance_email_ingest';
const VIEW = 'instance_email_ingest_view';
const PAGE_SIZE = 20;

export const EmailIngestList: React.FC = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<any>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfModalUrl, setPdfModalUrl] = useState<string | null>(null);
  const [pdfModalTitle, setPdfModalTitle] = useState<string>('PDF');
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchList = useCallback(() => {
    setIsLoading(true);
    viewAPI
      .search(MODEL, VIEW, page, PAGE_SIZE, undefined, {}, { modified_at: 'desc' })
      .then((res: any) => {
        setList(Array.isArray(res?.data) ? res.data : res?.data ?? []);
        setTotal(res?.total ?? 0);
      })
      .catch(() => {
        setList([]);
        setTotal(0);
      })
      .finally(() => setIsLoading(false));
  }, [page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleToggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoadingId(id);
    setExpandedDetail(null);
    viewAPI
      .getById(MODEL, id, VIEW)
      .then((res: any) => {
        setExpandedDetail(res?.data ?? res);
      })
      .catch(() => setExpandedDetail(null))
      .finally(() => setDetailLoadingId(null));
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return String(value);
    }
  };

  const formatDateOnly = (value: string | null | undefined) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('en-GB', { dateStyle: 'short' });
    } catch {
      return String(value);
    }
  };

  const handleOpenPdf = useCallback((itemId: string, filename: string, instanceId?: string | null) => {
    setPdfLoading(true);
    setPdfModalOpen(true);
    setPdfModalUrl(null);
    setPdfModalTitle(filename || 'PDF');
    agentAPI
      .getEmailIngestItemPdfBlob(itemId, instanceId)
      .then((blob) => {
        // Force PDF type so the iframe displays inline instead of triggering download/explorer
        const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
        setPdfModalUrl(URL.createObjectURL(pdfBlob));
      })
      .catch(() => {
        setPdfModalOpen(false);
      })
      .finally(() => setPdfLoading(false));
  }, []);

  const handlePdfModalClose = useCallback((open: boolean) => {
    if (!open && pdfModalUrl) {
      URL.revokeObjectURL(pdfModalUrl);
      setPdfModalUrl(null);
    }
    setPdfModalOpen(open);
  }, [pdfModalUrl]);

  return (
    <div className="w-full rounded-md border">
      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : list.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          No email ingests yet. Process emails via the process-email API to see them here.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>From</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((row: any) => (
              <React.Fragment key={row.id}>
                <TableRow
                  className={cn(
                    expandedId === row.id && 'bg-muted/30'
                  )}
                >
                  <TableCell className="w-8 p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleToggleExpand(row.id)}
                    >
                      {expandedId === row.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.from_email ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {row.subject ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(row.received_at)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-xs',
                        row.status === 'processed' &&
                          'bg-green-100 text-green-800',
                        row.status === 'pending' &&
                          'bg-amber-100 text-amber-800',
                        row.status === 'failed' &&
                          'bg-red-100 text-red-800',
                        row.status === 'rejected' &&
                          'bg-gray-100 text-gray-700'
                      )}
                    >
                      {row.status ?? '—'}
                    </span>
                  </TableCell>
                </TableRow>
                {expandedId === row.id && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="bg-muted/20 p-4"
                    >
                      {detailLoadingId === row.id ? (
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-24" />
                          <Skeleton className="h-6 w-32" />
                        </div>
                      ) : expandedDetail?.instance_email_ingest_item?.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-muted-foreground">
                            Items ({expandedDetail.instance_email_ingest_item.length})
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Invoice date</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Rejection reason</TableHead>
                                <TableHead>File</TableHead>
                                <TableHead>Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {expandedDetail.instance_email_ingest_item.map(
                                (item: any) => {
                                  const inv = item.extracted_data?.invoice;
                                  return (
                                  <TableRow key={item.id}>
                                    <TableCell className="font-medium">
                                      {inv?.invoice_number ?? '—'}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                      {inv?.invoice_date
                                        ? formatDateOnly(inv.invoice_date)
                                        : '—'}
                                    </TableCell>
                                    <TableCell className="text-sm tabular-nums">
                                      {inv?.invoice_total != null || inv?.invoice_net_total != null
                                        ? (inv?.invoice_total ?? inv?.invoice_net_total ?? 0).toLocaleString()
                                        : '—'}
                                    </TableCell>
                                    <TableCell>
                                      <span
                                        className={cn(
                                          'px-2 py-0.5 rounded text-xs',
                                          item.status === 'processed' &&
                                            'bg-green-100 text-green-800',
                                          item.status === 'pending' &&
                                            'bg-amber-100 text-amber-800',
                                          item.status === 'rejected' &&
                                            'bg-gray-100 text-gray-700',
                                          item.status === 'failed' &&
                                            'bg-red-100 text-red-800'
                                        )}
                                      >
                                        {item.status ?? '—'}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm max-w-[200px]">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="block truncate cursor-default">
                                            {item.rejection_reason ?? 'N/A'}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-sm whitespace-normal">
                                          {item.rejection_reason ?? 'N/A'}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                      <Button
                                        type="button"
                                        variant="link"
                                        className="h-auto p-0 font-mono text-sm text-primary"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleOpenPdf(
                                            item.id,
                                            item.attachment_filename ?? 'PDF',
                                            item.instance_id
                                          );
                                        }}
                                        disabled={pdfLoading}
                                      >
                                        {item.attachment_filename ?? '—'}
                                      </Button>
                                    </TableCell>
                                    <TableCell>
                                      {item.instance_id ? (
                                        <Button
                                          variant="link"
                                          className="h-auto p-0 font-mono text-xs text-primary"
                                          onClick={() =>
                                            navigate(
                                              `/purchases/bills/${item.instance_id}/state/Draft`
                                            )
                                          }
                                        >
                                          View invoice
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="link"
                                          className="h-auto p-0 font-mono text-xs text-primary"
                                          onClick={() =>
                                            navigate('/purchases/bills/upload', {
                                              state: {
                                                extractedInvoiceData: item.extracted_data,
                                                fromEmailIngestId: expandedDetail?.id,
                                                fromEmailIngestItemId: item.id,
                                              },
                                            })
                                          }
                                        >
                                          Process invoice
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                  );
                                }
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No items for this ingest.
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      )}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t px-4 py-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <PdfViewerModal
        open={pdfModalOpen}
        onOpenChange={handlePdfModalClose}
        pdfUrl={pdfModalUrl}
        title={pdfModalTitle}
      />
    </div>
  );
};

export default EmailIngestList;
