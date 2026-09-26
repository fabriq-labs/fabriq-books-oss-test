import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Upload, FileText, ArrowLeft, Loader2, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import { agentAPI, viewAPI, workflowAPI, attachmentAPI } from '@/api/api';

const INSTANCE_EMAIL_INGEST_ITEM_VIEW = 'instance_email_ingest_item_view';
const INSTANCE_EMAIL_INGEST_VIEW = 'instance_email_ingest_view';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { billTypeAndPoMode, SALES_INVOICE_TYPE } from '@/lib/bills/poMode';
import {
    BILL_UPLOAD_ACCEPT_ATTR,
    BILL_UPLOAD_HELPER_TEXT,
    resolveBillUploadMime,
} from '@/lib/bills/billUploadMime';
import {
    getExtractedLineDiscountAmount,
    getExtractedLineTaxAmount,
    getExtractedLineTotal,
} from '@/lib/invoices/extractedLineTotal';
import { useEntity } from '@/contexts/EntityContext';

/** Tool result may include created_invoice_id when backend auto-created an invoice from PO match */
interface ExtractToolResult extends ParsedData {
    created_invoice_id?: string;
    invoice_auto_created?: boolean;
}

interface ExtractResponse {
    content: string;
    toolResults?: Array<{
        tool: string;
        result?: ExtractToolResult;
        state?: string;
    }>;
    steps?: Array<unknown>;
    fileInfo?: {
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
    };
}

interface ParsedData {
    success: boolean;
    data: {
        purchase_order?: {
            id?: string;
            po_number?: string;
        };
        invoice: {
            invoice_number?: string;
            invoice_date?: string;
            invoice_version?: string;
            invoice_status?: string;
            invoice_type?: string;
            supplier_name?: string;
            supplier_tax_id?: string;
            supplier_gstin?: string;
            place_of_supply?: string;
            supplier_region?: string;
            reverse_charge?: boolean | string;
            tax_responsibility?: string;
            attach?: string;
            supplier_remarks?: string;
            shipping_terms?: string;
            shipping_method?: string;
            payment_terms?: string;
            remit_to?: string;
            bill_to?: string;
            deliver_to?: string;
            requester_name?: string;
            requester_email?: string;
            ap_comment?: string;
            po_number?: string;
            purchase_order_id?: string;
            coa?: string;
            additional_tax?: number;
            shipping_cost?: number;
            tax_on_shipping?: number;
            handling_cost?: number;
            tax_on_handling?: number;
            misc_cost?: number;
            tax_on_misc?: number;
            invoice_net_total?: number;
            shipping_handling_misc_total?: number;
            invoice_total?: number;
            balance_amount?: number;
            terms_and_conditions?: string;
        };
        line_items: Array<{
            item_name?: string;
            item_number?: string;
            item_description?: string;
            item_type?: string;
            rate?: number;
            ordered_quantity?: number;
            ordered_amount?: number;
            invoice_qty?: number;
            quantity?: number;
            line_total?: number;
            invoiced_amount?: number;
            tax_type?: string;
            tax_rate?: number;
            tax_rate_intra?: number;
            line_tax_amount?: number;
            discount_rate?: number;
            discount_amount?: number;
            classification_code?: string;
            classification_scheme?: string;
            hsn_sac?: string;
            tax_components?: Array<{
                name?: string;
                component_type?: string;
                rate?: number;
                amount?: number;
            }>;
            po_number?: string;
            need_by_date?: string;
        }>;
        charges?: Array<{
            charge_type?: string;
            label?: string;
            amount?: number;
            charge_percent?: number;
            taxable?: boolean;
            tax_rate?: number;
            line_tax_amount?: number;
            tax_components?: Array<{
                name?: string;
                component_type?: string;
                rate?: number;
                amount?: number;
            }>;
        }>;
        context: {
            currency?: string;
            language?: string;
            documentType?: string;
            pageCount?: number;
            extractedAt?: string;
        };
        resolved?: {
            supplier_id?: string | null;
            supplier_name?: string | null;
            currency_id?: string | null;
            currency_code?: string | null;
            exchange_rate?: number | null;
            legal_entity_id?: string | null;
            tax_region_id?: string | null;
            seller_tax_region_id?: string | null;
            tax_responsibility?: string | null;
            supplier_tax_id?: string | null;
            place_of_supply?: string | null;
            payment_terms_id?: string | null;
            lines?: Array<{
                tax_group_id?: string | null;
                tax_group_code?: string | null;
                tax_rate?: number | null;
                line_tax_amount?: number | null;
                classification_code?: string | null;
                classification_scheme?: string | null;
                match?: string;
            }>;
            charges?: Array<{
                tax_group_id?: string | null;
                tax_group_code?: string | null;
                tax_rate?: number | null;
                line_tax_amount?: number | null;
                match?: string;
            }>;
        };
    };
    metaData: {
        confidence?: number;
        modelName?: string;
        processingTime?: number;
        extractorType?: string;
        fileName?: string;
        fileSize?: number;
        uploadedAt?: string;
    };
}

interface PurchaseOrder {
    id: string;
    po_number?: string;
    current_state?: string;
    supplier_name?: string;
    [key: string]: unknown;
}

interface SearchResponse {
    data: PurchaseOrder[];
    [key: string]: unknown;
}

interface ExtractedLineItem {
    item_name?: string;
    item_description?: string;
    rate?: number;
    ordered_quantity?: number;
    line_total?: number;
    [key: string]: unknown;
}

interface ExtractedInvoiceData {
    invoice?: {
        invoice_number?: string;
        invoice_date?: string;
        supplier_name?: string;
        payment_terms?: string;
        po_number?: string;
        invoice_net_total?: number;
        invoice_total?: number;
        [key: string]: unknown;
    };
    line_items?: ExtractedLineItem[];
    [key: string]: unknown;
}

interface LocationState {
    extractedInvoiceData?: ExtractedInvoiceData;
    fromEmailIngestId?: string;
    fromEmailIngestItemId?: string;
    [key: string]: unknown;
}

interface MappedInvoiceData {
    invoice_number?: string;
    po_number?: string;
    supplier_name?: string;
    invoice_date?: string;
    invoice_total?: number;
    [key: string]: unknown;
}

export const InvoiceUpload: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const { currentEntityId } = useEntity();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [originalFile, setOriginalFile] = useState<File | null>(null); // Store original file for attachment
    const [isUploading, setIsUploading] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createWithPO, setCreateWithPO] = useState(false);
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    // Shared component: purchases accept receipt photos; sales stays PDF-only.
    const isPurchaseUpload = location.pathname.includes('/purchases/bills');
    const fileAcceptAttr = isPurchaseUpload ? BILL_UPLOAD_ACCEPT_ATTR : '.pdf,application/pdf';
    const uploadTitle = isPurchaseUpload ? 'Upload bill or receipt' : 'Upload Invoice PDF';
    const uploadHelper = isPurchaseUpload
        ? BILL_UPLOAD_HELPER_TEXT
        : 'PDF files only, up to 10MB';
    const uploadPrompt = isPurchaseUpload
        ? 'Extract invoice data from this bill or receipt'
        : 'Extract invoice data from this PDF file';

    const acceptSelectedFile = (file: File) => {
        if (isPurchaseUpload) {
            const resolved = resolveBillUploadMime({
                originalName: file.name,
                mimetype: file.type,
            });
            if (resolved.ok === false) {
                setError(resolved.error);
                return false;
            }
        } else if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            setError('Please select a valid PDF file');
            return false;
        }
        setSelectedFile(file);
        setOriginalFile(file);
        setError(null);
        setParsedData(null);
        handleUpload(file);
        return true;
    };

    // Handle data passed from chat navigation
    useEffect(() => {
        const extractedData = (location.state as LocationState)?.extractedInvoiceData;
        if (extractedData) {
            // Convert the extracted data to ParsedData format
            const convertedData: ParsedData = {
                success: true,
                data: {
                    invoice: extractedData.invoice || {},
                    line_items: extractedData.line_items || [],
                    charges: (extractedData as { charges?: ParsedData['data']['charges'] }).charges || [],
                    context: extractedData.context || {},
                    purchase_order: extractedData.purchase_order || {},
                    resolved: (extractedData as { resolved?: ParsedData['data']['resolved'] }).resolved,
                },
                metaData: {
                    modelName: 'invoice',
                    extractorType: 'agent',
                    uploadedAt: new Date().toISOString(),
                },
            };
            if (convertedData?.data?.purchase_order?.id) {
                convertedData.data.invoice.purchase_order_id = convertedData.data.purchase_order.id;
            }

            setParsedData(convertedData);

        }
    }, [location.state]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            acceptSelectedFile(file);
        } else {
            setError(isPurchaseUpload ? BILL_UPLOAD_HELPER_TEXT : 'Please select a valid PDF file');
        }
    };


    const handleUpload = async (file?: File) => {
        const fileToUpload = file || selectedFile;
        if (!fileToUpload) return;

        setIsUploading(true);
        setError(null);

        try {
            const extractResponse = await agentAPI.extract(
                fileToUpload,
                uploadPrompt,
                {
                    modelName: 'invoice',
                    viewName: 'invoice_view',
                    promptTypes: ['invoice_extractor'],
                    // Prefer global entity switcher over HQ for resolve/auto-create.
                    preferredLegalEntityId: currentEntityId || undefined,
                }
            ) as ExtractResponse;

            // Check if toolResults is empty or missing
            if (!extractResponse?.toolResults || extractResponse.toolResults.length === 0 || !extractResponse.toolResults[0]) {
                setError(
                    'Could not extract invoice data from this file (no extract result). Check that the LLM is configured and try again.',
                );
                setIsUploading(false);
                return;
            }

            const response = extractResponse?.toolResults?.[0]?.result as ExtractToolResult | undefined;

            // Check if response is empty or invalid
            if (!response || !response.data) {
                const toolError =
                    (response as { error?: string; message?: string } | undefined)?.error ||
                    (response as { error?: string; message?: string } | undefined)?.message;
                setError(
                    toolError ||
                        'Could not extract invoice data from this file. Please try another file or try again.',
                );
                setIsUploading(false);
                return;
            }

            // If backend auto-created an invoice (PO + line match), redirect to bill form
            if (response.created_invoice_id) {
                const invoiceId = response.created_invoice_id;
                toast({
                    title: 'Invoice Created',
                    description: 'Invoice created and matched to PO.',
                });
                if (fileToUpload) {
                    try {
                        const attachmentFormData = new FormData();
                        attachmentFormData.append('file', fileToUpload);
                        attachmentFormData.append('data', JSON.stringify({ name: fileToUpload.name }));
                        await attachmentAPI.create('invoice', invoiceId, attachmentFormData);
                    } catch (attachmentError) {
                        console.error('Error uploading attachment:', attachmentError);
                        toast({
                            title: 'Bill created, but file was not attached',
                            description:
                                attachmentError instanceof Error
                                    ? attachmentError.message
                                    : 'You can upload the file from the bill Attachments section.',
                            variant: 'destructive',
                        });
                    }
                }
                navigate(`/purchases/bills/${invoiceId}/state/Draft`);
                setIsUploading(false);
                return;
            }

            // Map purchase_order.id to invoice.purchase_order_id if available
            if (response?.data?.purchase_order?.id) {
                if (!response.data.invoice) {
                    response.data.invoice = {};
                }
                response.data.invoice.purchase_order_id = response.data.purchase_order.id;
            }

            setParsedData(response);

            // Reset create with PO checkbox when new file is parsed
            setCreateWithPO(false);

            // Clear the selected file display but keep originalFile for attachment
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error && err.message
                    ? err.message
                    : 'Failed to extract data from file. Please try again.';
            console.error('Bill extract failed:', err);
            setError(errorMessage);
            setParsedData(null);
        } finally {
            setIsUploading(false);
        }
    };

    const handleBack = () => {
        navigate(isPurchaseUpload ? '/purchases/bills' : '/sales/invoices');
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            acceptSelectedFile(file);
        } else {
            setError(isPurchaseUpload ? BILL_UPLOAD_HELPER_TEXT : 'Please select a valid PDF file');
        }
    };

    const handleUploadAnother = () => {
        setParsedData(null);
        setSelectedFile(null);
        setOriginalFile(null);
        setError(null);
        setShowPdfPreview(false);
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handlePreviewPdf = () => {
        if (originalFile) {
            const url = URL.createObjectURL(originalFile);
            setPdfUrl(url);
            setShowPdfPreview(true);
        }
    };

    const previewMime = originalFile
        ? resolveBillUploadMime({
              originalName: originalFile.name,
              mimetype: originalFile.type,
          })
        : null;
    const previewKind =
        previewMime && previewMime.ok
            ? previewMime.mime === 'application/pdf'
                ? 'pdf'
                : previewMime.mime === 'image/heic' || previewMime.mime === 'image/heif'
                  ? 'heic'
                  : previewMime.mime.startsWith('image/')
                    ? 'image'
                    : 'other'
            : 'other';
    const previewButtonLabel =
        previewKind === 'pdf' ? 'Preview PDF' : previewKind === 'image' || previewKind === 'heic' ? 'Preview file' : 'Preview file';
    const previewDialogTitle =
        previewKind === 'pdf' ? 'PDF Preview' : 'Receipt Preview';

    const handleClosePdfPreview = () => {
        setShowPdfPreview(false);
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
        }
    };

    const formatDateToISO = (dateString: string | null | undefined): string | null => {
        if (!dateString) return null;
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return null;
            return date.toISOString();
        } catch (error) {
            console.warn('Invalid date format:', dateString);
            return null;
        }
    };

    const handleCreateInvoice = async (withPO: boolean = false) => {
        if (!parsedData) return;

        setIsCreating(true);
        try {
            const invoice = parsedData.data.invoice;
            const lineItems = parsedData.data.line_items || [];
            const charges = parsedData.data.charges || [];
            const resolved = parsedData.data.resolved;

            // Persist tax / party / currency from extract resolve.
            // Sales upload → invoice_type SALES; purchase bill upload → PURCHASE + po_mode.
            const invoicePayload: Record<string, unknown> = {
                ...(isPurchaseUpload
                    ? billTypeAndPoMode(withPO ? 'With PO' : 'Without PO')
                    : { invoice_type: SALES_INVOICE_TYPE }),
                invoice_number: invoice?.invoice_number,
                invoice_date: formatDateToISO(invoice?.invoice_date),
                invoice_total: invoice?.invoice_total || invoice?.invoice_net_total || 0,
                invoice_net_total: invoice?.invoice_net_total || 0,
                additional_tax: invoice?.additional_tax || 0,
                shipping_cost: invoice?.shipping_cost || 0,
                terms_and_conditions: invoice?.terms_and_conditions,
                // payment_terms is a Prisma relation on invoice — never send extracted free text
                // (e.g. "Due on receipt"). Use payment_terms_id when resolve provides one.
                shipping_terms: invoice?.shipping_terms,
                shipping_method: invoice?.shipping_method,
                remit_to: invoice?.remit_to,
                ap_comment: invoice?.ap_comment,
                supplier_name: resolved?.supplier_name || invoice?.supplier_name,
                status: '9',
            };

            if (resolved?.supplier_id) invoicePayload.supplier_id = resolved.supplier_id;
            // Prefer entity selector over extract's HQ default.
            if (currentEntityId) {
                invoicePayload.legal_entity_id = currentEntityId;
            } else if (resolved?.legal_entity_id) {
                invoicePayload.legal_entity_id = resolved.legal_entity_id;
            }
            if (resolved?.currency_id) invoicePayload.currency_id = resolved.currency_id;
            if (resolved?.exchange_rate != null) invoicePayload.exchange_rate = resolved.exchange_rate;
            if (resolved?.tax_region_id) invoicePayload.tax_region_id = resolved.tax_region_id;
            if (resolved?.seller_tax_region_id) {
                invoicePayload.seller_tax_region_id = resolved.seller_tax_region_id;
            }
            if (resolved?.tax_responsibility) {
                invoicePayload.tax_responsibility = resolved.tax_responsibility;
            }
            if (resolved?.payment_terms_id) {
                invoicePayload.payment_terms_id = resolved.payment_terms_id;
            }

            if (withPO) {
                invoicePayload.po_number = invoice?.po_number;
                invoicePayload.purchase_order_id = invoice?.purchase_order_id;
            }

            const createResponse = await workflowAPI.create('invoice', '9', invoicePayload) as {
                data?: { id?: string };
            };

            if (!createResponse?.data?.id) {
                throw new Error('Failed to create invoice');
            }

            const invoiceId = createResponse.data.id;

            const chargeTypeLabel = (chargeType?: string, label?: string) => {
                const printed = String(label || '').trim();
                if (printed) return printed;
                const key = String(chargeType || 'service_charge').trim().toLowerCase();
                if (key === 'convenience_fee') return 'Convenience fee';
                if (key === 'tip') return 'Tip';
                if (key === 'freight') return 'Freight';
                if (key === 'handling') return 'Handling';
                if (key === 'misc' || key === 'other' || key === 'other_charge') return 'Charge';
                if (key === 'fee') return 'Fee';
                return 'Service charge';
            };

            if (lineItems.length > 0 || charges.length > 0) {
                for (let i = 0; i < lineItems.length; i++) {
                    const lineItem = lineItems[i];
                    const lr = resolved?.lines?.[i];
                    await viewAPI.addChild(
                        'invoice',
                        invoiceId,
                        'invoice_view',
                        'invoice_line_item',
                        {
                            item_name: lineItem.item_name,
                            item_description: lineItem?.item_description,
                            item_type: lineItem?.item_type,
                            rate: lineItem?.rate || 0,
                            tax_rate: lr?.tax_rate ?? lineItem?.tax_rate ?? 0,
                            line_tax_amount:
                                lr?.line_tax_amount ?? lineItem?.line_tax_amount ?? undefined,
                            line_total: getExtractedLineTotal(lineItem, lr),
                            tax_group_id: lr?.tax_group_id || undefined,
                            classification_code:
                                lr?.classification_code ||
                                lineItem?.classification_code ||
                                lineItem?.hsn_sac ||
                                undefined,
                            classification_scheme:
                                lr?.classification_scheme ||
                                lineItem?.classification_scheme ||
                                undefined,
                            ordered_quantity: lineItem?.ordered_quantity || 0,
                            ordered_amount: lineItem?.ordered_amount || 0,
                            discount_rate: lineItem?.discount_rate ?? 0,
                            discount_amount: lineItem?.discount_amount ?? 0,
                            invoice_qty:
                                lineItem?.quantity ||
                                lineItem?.invoice_qty ||
                                lineItem?.ordered_quantity ||
                                0,
                            need_by_date: lineItem?.need_by_date,
                        },
                    );
                }

                // Taxable fees (service charge, etc.) — same line table, item_type=charge
                for (let i = 0; i < charges.length; i++) {
                    const charge = charges[i];
                    const cr = resolved?.charges?.[i];
                    const amount = Number(charge?.amount);
                    if (!Number.isFinite(amount)) continue;
                    const name = chargeTypeLabel(charge?.charge_type, charge?.label);
                    await viewAPI.addChild(
                        'invoice',
                        invoiceId,
                        'invoice_view',
                        'invoice_line_item',
                        {
                            item_name: name,
                            item_description: name,
                            item_type: 'charge',
                            rate: amount,
                            ordered_quantity: 1,
                            ordered_amount: amount,
                            invoice_qty: 1,
                            line_total: getExtractedLineTotal(charge, cr, true),
                            tax_rate: cr ? (cr.tax_rate ?? 0) : (charge?.tax_rate ?? 0),
                            line_tax_amount:
                                cr?.line_tax_amount ?? charge?.line_tax_amount ?? undefined,
                            tax_group_id: cr?.tax_group_id || undefined,
                        },
                    );
                }

                // Final totals pass — each addChild already fires calculate_invoice_total via
                // functionMap ADD; nudge header dep so totals are consistent before navigate.
                try {
                    await viewAPI.update('invoice', invoiceId, 'invoice_view', {
                        adjustable_value: 0,
                    });
                } catch (calcErr) {
                    console.warn('Could not refresh invoice totals after line create:', calcErr);
                }
            }

            // Upload the original PDF file as an attachment
            let attachmentUploaded = false;
            if (originalFile) {
                try {
                    const attachmentFormData = new FormData();
                    attachmentFormData.append('file', originalFile);
                    attachmentFormData.append('data', JSON.stringify({ name: originalFile.name }));

                    await attachmentAPI.create('invoice', invoiceId, attachmentFormData);
                    attachmentUploaded = true;
                } catch (attachmentError) {
                    console.error('Error uploading attachment:', attachmentError);
                    toast({
                        title: 'Invoice created, but file was not attached',
                        description:
                            attachmentError instanceof Error
                                ? attachmentError.message
                                : 'You can upload the file from the bill Attachments section.',
                        variant: 'destructive',
                    });
                }
            }

            // If this invoice was created from an email ingest item, update the item, parent ingest, and move attachments
            const state = location.state as LocationState;
            if (state?.fromEmailIngestItemId) {
                try {
                    await viewAPI.update(
                        'instance_email_ingest_item',
                        state.fromEmailIngestItemId,
                        INSTANCE_EMAIL_INGEST_ITEM_VIEW,
                        { instance_id: invoiceId, status: 'processed' }
                    );
                    await agentAPI.moveAttachmentsToInvoice(state.fromEmailIngestItemId, invoiceId);
                    if (state?.fromEmailIngestId) {
                        await viewAPI.update(
                            'instance_email_ingest',
                            state.fromEmailIngestId,
                            INSTANCE_EMAIL_INGEST_VIEW,
                            { status: 'processed', processed_at: new Date().toISOString() }
                        );
                    }
                } catch (updateErr) {
                    console.warn('Could not update email ingest item, parent ingest, or move attachments:', updateErr);
                }
            }

            toast({
                title: "Invoice Created Successfully",
                description: `Invoice ${invoice?.invoice_number || 'has been created'} has been created successfully${attachmentUploaded ? ' with attachment' : ''}.`,
            });

            // Navigate to the invoice form
            navigate(`/purchases/bills/${invoiceId}/state/Draft`);
        } catch (error: unknown) {
            console.error('Error creating invoice:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to create invoice. Please try again.';
            toast({
                title: "Error Creating Invoice",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <Button
                        variant="outline"
                        onClick={handleBack}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft size={16} />
                        {isPurchaseUpload ? 'Back to Bills' : 'Back to Invoices'}
                    </Button>
                    {parsedData && !isUploading && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={handlePreviewPdf}
                                size="sm"
                                className="flex items-center gap-2"
                                disabled={!originalFile}
                            >
                                <Eye size={16} />
                                {previewButtonLabel}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleUploadAnother}
                                size="sm"
                                className="flex items-center gap-2"
                            >
                                <Upload size={16} />
                                Re-upload
                            </Button>
                        </div>
                    )}
                </div>

                {/* Upload Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="text-primary" size={24} />
                            {uploadTitle}
                        </CardTitle>
                        <CardDescription>
                            {isPurchaseUpload
                                ? 'Upload a supplier PDF or a photo of the receipt to extract data'
                                : 'Upload a PDF invoice to automatically extract data'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* File Upload Area */}
                        {!parsedData && !isUploading && (
                            <div
                                className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-primary hover:bg-primary/5 transition-all duration-200 cursor-pointer"
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={fileAcceptAttr}
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <Upload size={64} className="mx-auto text-gray-400 mb-6" />
                                <p className="text-xl font-semibold text-gray-700 mb-3">
                                    {uploadTitle}
                                </p>
                                <p className="text-base text-gray-500 mb-4">
                                    {isPurchaseUpload
                                        ? 'Click to browse or drag and drop a PDF or receipt photo'
                                        : 'Click to browse or drag and drop your PDF file here'}
                                </p>
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-600">
                                    <FileText size={16} />
                                    {uploadHelper}
                                </div>
                            </div>
                        )}

                        {/* Loading State */}
                        {isUploading && (
                            <div className="text-center py-8">
                                <Loader2 size={48} className="animate-spin mx-auto text-primary mb-4" />
                                <p className="text-lg font-medium text-gray-700">
                                    {isPurchaseUpload ? 'Processing your bill...' : 'Processing your PDF...'}
                                </p>
                                <p className="text-sm text-gray-500">This may take a few moments</p>
                            </div>
                        )}

                        {/* Error Display — shown above results so failed extracts are obvious */}
                        {error && !isUploading && (
                            <Alert variant="destructive">
                                <AlertCircle size={20} />
                                <AlertDescription className="flex items-center justify-between gap-4">
                                    <span>{error}</span>
                                    {originalFile && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleUpload(originalFile)}
                                            className="shrink-0"
                                        >
                                            Retry
                                        </Button>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Parsed Invoice Data Display */}
                        {parsedData && !isUploading && (
                            <div className="space-y-6">
                                {/* <div className="flex items-center gap-2 text-green-600">
                                    <CheckCircle size={20} />
                                    <span className="font-medium text-lg">PDF parsed successfully!</span>
                                    <span className="text-sm text-gray-500">
                                        (Confidence: {parsedData.metaData?.confidence || 0}%)
                                    </span>
                                 </div> */}

                                {/* Invoice Details Card */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Invoice Details</CardTitle>
                                        <CardDescription>
                                            Extracted invoice information from uploaded file
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {parsedData.data.invoice.invoice_number && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">Invoice Number</p>
                                                    <p className="text-base font-semibold text-gray-900">{parsedData.data.invoice.invoice_number}</p>
                                                </div>
                                            )}
                                            {parsedData.data.invoice.invoice_date && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">Invoice Date</p>
                                                    <p className="text-base font-semibold text-gray-900">{parsedData.data.invoice.invoice_date}</p>
                                                </div>
                                            )}
                                            {parsedData.data.invoice.supplier_name && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">Supplier</p>
                                                    <p className="text-base font-semibold text-gray-900">{parsedData.data.invoice.supplier_name}</p>
                                                </div>
                                            )}
                                            {(parsedData.data.resolved?.supplier_tax_id ||
                                                parsedData.data.invoice.supplier_tax_id ||
                                                parsedData.data.invoice.supplier_gstin) && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">Supplier tax ID</p>
                                                    <p className="text-base font-semibold text-gray-900">
                                                        {parsedData.data.resolved?.supplier_tax_id ||
                                                            parsedData.data.invoice.supplier_tax_id ||
                                                            parsedData.data.invoice.supplier_gstin}
                                                    </p>
                                                </div>
                                            )}
                                            {(parsedData.data.resolved?.place_of_supply ||
                                                parsedData.data.invoice.place_of_supply) && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">Place of supply</p>
                                                    <p className="text-base font-semibold text-gray-900">
                                                        {parsedData.data.resolved?.place_of_supply ||
                                                            parsedData.data.invoice.place_of_supply}
                                                    </p>
                                                </div>
                                            )}
                                            {(parsedData.data.resolved?.currency_code ||
                                                parsedData.data.context?.currency) && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">Currency</p>
                                                    <p className="text-base font-semibold text-gray-900">
                                                        {parsedData.data.resolved?.currency_code ||
                                                            parsedData.data.context?.currency}
                                                        {parsedData.data.resolved?.exchange_rate != null &&
                                                            parsedData.data.resolved.exchange_rate !== 1 && (
                                                            <span className="text-sm font-normal text-gray-500 ml-2">
                                                                (FX {parsedData.data.resolved.exchange_rate})
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            )}
                                            {parsedData.data.invoice.po_number && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">PO Number</p>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-base font-semibold text-gray-900">{parsedData.data.invoice.po_number}</p>
                                                        {!parsedData.data.invoice.purchase_order_id && (
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <button
                                                                        type="button"
                                                                        className="focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 rounded-full"
                                                                    >
                                                                        <AlertCircle
                                                                            size={18}
                                                                            className="text-amber-500 cursor-pointer flex-shrink-0 hover:text-amber-600 transition-colors"
                                                                        />
                                                                    </button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="max-w-xs" align="start">
                                                                    <p className="font-semibold mb-1">Purchase Order not found</p>
                                                                    <p className="text-sm text-gray-600">
                                                                        The PO number "{parsedData.data.invoice.po_number}" was found in the invoice but could not be matched to an existing purchase order. The invoice will be created without PO mapping.
                                                                    </p>
                                                                </PopoverContent>
                                                            </Popover>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {parsedData.data.invoice.invoice_total && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">Total Amount</p>
                                                    <p className="text-base font-semibold text-gray-900">
                                                        {parsedData.data.context?.currency || '$'}{parsedData.data.invoice.invoice_total.toLocaleString()}
                                                    </p>
                                                </div>
                                            )}
                                            {parsedData.data.invoice.invoice_net_total && (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-500">Net Total</p>
                                                    <p className="text-base font-semibold text-gray-900">
                                                        {parsedData.data.context?.currency || '$'}{parsedData.data.invoice.invoice_net_total.toLocaleString()}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Additional Invoice Fields */}
                                        {(parsedData.data.invoice.payment_terms || parsedData.data.invoice.shipping_terms || parsedData.data.invoice.requester_name) && (
                                            <div className="pt-4 border-t space-y-2">
                                                {parsedData.data.invoice.payment_terms && (
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-500">Payment Terms</p>
                                                        <p className="text-sm text-gray-900">{parsedData.data.invoice.payment_terms}</p>
                                                    </div>
                                                )}
                                                {parsedData.data.invoice.shipping_terms && (
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-500">Shipping Terms</p>
                                                        <p className="text-sm text-gray-900">{parsedData.data.invoice.shipping_terms}</p>
                                                    </div>
                                                )}
                                                {parsedData.data.invoice.requester_name && (
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-500">Requester</p>
                                                        <p className="text-sm text-gray-900">{parsedData.data.invoice.requester_name}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Line Items Card (products + taxable charges) */}
                                {((parsedData.data.line_items && parsedData.data.line_items.length > 0) ||
                                    (parsedData.data.charges && parsedData.data.charges.length > 0)) && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>
                                                Line Items (
                                                {(parsedData.data.line_items?.length || 0) +
                                                    (parsedData.data.charges?.length || 0)}
                                                )
                                            </CardTitle>
                                            <CardDescription>
                                                Goods/services and taxable charges extracted from the uploaded file
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="overflow-x-auto">
                                                <table className="w-full border-collapse">
                                                    <thead>
                                                        <tr className="border-b bg-gray-50">
                                                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Item Name</th>
                                                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Description</th>
                                                            <th className="text-left p-3 text-sm font-semibold text-gray-700">HSN</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Quantity</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Rate</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Discount</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Tax %</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Tax amt</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Line Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {parsedData.data.line_items.map((item, index) => {
                                                            const lr = parsedData.data.resolved?.lines?.[index];
                                                            const currencyLabel =
                                                                parsedData.data.resolved?.currency_code ||
                                                                parsedData.data.context?.currency ||
                                                                '';
                                                            const hsn =
                                                                lr?.classification_code ||
                                                                item.classification_code ||
                                                                item.hsn_sac ||
                                                                '-';
                                                            const taxRate = lr?.tax_rate ?? item.tax_rate;
                                                            const taxGroup = lr?.tax_group_code;
                                                            const discountAmount = getExtractedLineDiscountAmount(item);
                                                            const lineTaxAmount = getExtractedLineTaxAmount(item, lr);
                                                            const lineTotal = getExtractedLineTotal(item, lr);
                                                            return (
                                                            <tr key={`line-${index}`} className="border-b hover:bg-gray-50">
                                                                <td className="p-3 text-sm text-gray-900">{item.item_name || '-'}</td>
                                                                <td className="p-3 text-sm text-gray-600">{item.item_description || '-'}</td>
                                                                <td className="p-3 text-sm text-gray-900">{hsn}</td>
                                                                <td className="p-3 text-sm text-gray-900 text-right">{item.quantity || item.invoice_qty || item.ordered_quantity || 0}</td>
                                                                <td className="p-3 text-sm text-gray-900 text-right">
                                                                    {currencyLabel}{(item.rate || 0).toLocaleString()}
                                                                </td>
                                                                <td className="p-3 text-sm text-gray-900 text-right">
                                                                    {discountAmount > 0
                                                                        ? `${currencyLabel}${discountAmount.toLocaleString()}`
                                                                        : '-'}
                                                                </td>
                                                                <td className="p-3 text-sm text-gray-900 text-right">
                                                                    {taxGroup
                                                                        ? taxGroup
                                                                        : taxRate != null
                                                                          ? `${taxRate}%`
                                                                          : '-'}
                                                                </td>
                                                                <td className="p-3 text-sm text-gray-900 text-right">
                                                                    {currencyLabel}{lineTaxAmount.toLocaleString()}
                                                                </td>
                                                                <td className="p-3 text-sm font-semibold text-gray-900 text-right">
                                                                    {currencyLabel}{lineTotal.toLocaleString()}
                                                                </td>
                                                            </tr>
                                                            );
                                                        })}
                                                        {(parsedData.data.charges || []).map((charge, index) => {
                                                            const cr = parsedData.data.resolved?.charges?.[index];
                                                            const currencyLabel =
                                                                parsedData.data.resolved?.currency_code ||
                                                                parsedData.data.context?.currency ||
                                                                '';
                                                            const name =
                                                                String(charge.label || '').trim() ||
                                                                (String(charge.charge_type || '')
                                                                    .replace(/_/g, ' ')
                                                                    .replace(/\b\w/g, (c) => c.toUpperCase()) ||
                                                                    'Service charge');
                                                            const taxRate = cr ? cr.tax_rate : charge.tax_rate;
                                                            const taxGroup = cr?.tax_group_code;
                                                            const lineTaxAmount = getExtractedLineTaxAmount(charge, cr, true);
                                                            const lineTotal = getExtractedLineTotal(charge, cr, true);
                                                            return (
                                                                <tr key={`charge-${index}`} className="border-b hover:bg-gray-50">
                                                                    <td className="p-3 text-sm text-gray-900">{name}</td>
                                                                    <td className="p-3 text-sm text-gray-600">Charge</td>
                                                                    <td className="p-3 text-sm text-gray-900">-</td>
                                                                    <td className="p-3 text-sm text-gray-900 text-right">1</td>
                                                                    <td className="p-3 text-sm text-gray-900 text-right">
                                                                        {currencyLabel}{(charge.amount || 0).toLocaleString()}
                                                                    </td>
                                                                    <td className="p-3 text-sm text-gray-900 text-right">-</td>
                                                                    <td className="p-3 text-sm text-gray-900 text-right">
                                                                        {taxGroup
                                                                            ? taxGroup
                                                                            : taxRate != null
                                                                              ? `${taxRate}%`
                                                                              : '-'}
                                                                    </td>
                                                                    <td className="p-3 text-sm text-gray-900 text-right">
                                                                        {currencyLabel}{lineTaxAmount.toLocaleString()}
                                                                    </td>
                                                                    <td className="p-3 text-sm font-semibold text-gray-900 text-right">
                                                                        {currencyLabel}{lineTotal.toLocaleString()}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Create Invoice Button */}
                                <div className="flex items-center justify-end gap-4">
                                    {parsedData.data.invoice.purchase_order_id && (
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="create-with-po"
                                                checked={createWithPO}
                                                onCheckedChange={(checked) => setCreateWithPO(checked === true)}
                                                disabled={isCreating}
                                            />
                                            <Label
                                                htmlFor="create-with-po"
                                                className="text-sm font-medium cursor-pointer"
                                            >
                                                Create with PO
                                            </Label>
                                        </div>
                                    )}
                                    <Button
                                        onClick={() => handleCreateInvoice(createWithPO)}
                                        disabled={isCreating}
                                        size="lg"
                                        className="min-w-[180px]"
                                    >
                                        {isCreating ? (
                                            <>
                                                <Loader2 size={20} className="animate-spin mr-2" />
                                                Creating...
                                            </>
                                        ) : 'Create Invoice'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* File Preview Dialog */}
            <Dialog open={showPdfPreview} onOpenChange={handleClosePdfPreview}>
                <DialogContent className="max-w-5xl w-full h-[90vh] p-0">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="text-primary" size={20} />
                            {previewDialogTitle}
                            {originalFile && (
                                <span className="text-sm font-normal text-gray-500">
                                    - {originalFile.name}
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden px-6 pb-6">
                        {pdfUrl && previewKind === 'pdf' ? (
                            <iframe
                                src={pdfUrl}
                                className="w-full h-full border rounded-lg"
                                title="PDF Preview"
                                style={{ minHeight: 'calc(90vh - 120px)' }}
                            />
                        ) : pdfUrl && previewKind === 'image' ? (
                            <div className="flex items-center justify-center h-full overflow-auto" style={{ minHeight: 'calc(90vh - 120px)' }}>
                                <img
                                    src={pdfUrl}
                                    alt={originalFile?.name || 'Receipt preview'}
                                    className="max-w-full max-h-full object-contain"
                                />
                            </div>
                        ) : previewKind === 'heic' ? (
                            <div className="flex flex-col items-center justify-center h-full text-center gap-2 text-gray-600" style={{ minHeight: 'calc(90vh - 120px)' }}>
                                <FileText size={40} className="text-gray-400" />
                                <p className="font-medium">HEIC/HEIF preview is not available in this browser.</p>
                                <p className="text-sm">The file was still uploaded for extraction.</p>
                                {originalFile && (
                                    <p className="text-sm text-gray-500">{originalFile.name}</p>
                                )}
                            </div>
                        ) : pdfUrl ? (
                            <iframe
                                src={pdfUrl}
                                className="w-full h-full border rounded-lg"
                                title="File Preview"
                                style={{ minHeight: 'calc(90vh - 120px)' }}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="animate-spin text-primary" size={32} />
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
