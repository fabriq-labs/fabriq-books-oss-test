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
            po_number?: string;
            need_by_date?: string;
        }>;
        context: {
            currency?: string;
            language?: string;
            documentType?: string;
            pageCount?: number;
            extractedAt?: string;
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
                    context: extractedData.context || {},
                    purchase_order: extractedData.purchase_order || {},
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
        if (file && file.type === 'application/pdf') {
            setSelectedFile(file);
            setOriginalFile(file); // Store original file for attachment
            setError(null);
            setParsedData(null);
            // Automatically start parsing
            handleUpload(file);
        } else {
            setError('Please select a valid PDF file');
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
                'Extract invoice data from this PDF file',
                {
                    modelName: 'invoice',
                    viewName: 'invoice_view',
                    promptTypes: ['invoice_extractor'],
                }
            ) as ExtractResponse;

            // Check if toolResults is empty or missing
            if (!extractResponse?.toolResults || extractResponse.toolResults.length === 0 || !extractResponse.toolResults[0]) {
                setError('Failed to extract data from PDF. Please try again.');
                setIsUploading(false);
                return;
            }

            const response = extractResponse?.toolResults?.[0]?.result as ExtractToolResult | undefined;

            // Check if response is empty or invalid
            if (!response || !response.data) {
                setError('Failed to extract data from PDF. Please try again.');
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
            const errorMessage = err instanceof Error ? err.message : 'Failed to parse PDF. Please try again.';
            setError(errorMessage);
        } finally {
            setIsUploading(false);
        }
    };

    const handleBack = () => {
        navigate('/purchases/bills');
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            setSelectedFile(file);
            setOriginalFile(file); // Store original file for attachment
            setError(null);
            setParsedData(null);
            // Automatically start parsing
            handleUpload(file);
        } else {
            setError('Please select a valid PDF file');
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

            // Prepare invoice payload - exclude PO and supplier related fields from PO data
            const invoicePayload: Record<string, unknown> = {
                invoice_type: 'With PO',
                invoice_number: invoice?.invoice_number,
                invoice_date: formatDateToISO(invoice?.invoice_date),
                invoice_total: invoice?.invoice_total || invoice?.invoice_net_total || 0,
                invoice_net_total: invoice?.invoice_net_total || 0,
                additional_tax: invoice?.additional_tax || 0,
                shipping_cost: invoice?.shipping_cost || 0,
                terms_and_conditions: invoice?.terms_and_conditions,
                status: '9',
            };

            // Only add invoice_type, po_number, and purchase_order_id if creating with PO
            if (withPO) {
                invoicePayload.po_number = invoice?.po_number;
                invoicePayload.purchase_order_id = invoice?.purchase_order_id;
            }

            // Create invoice using the workflow API with status '9'
            const createResponse = await workflowAPI.create("invoice", '9', invoicePayload) as { data?: { id?: string } };

            if (!createResponse?.data?.id) {
                throw new Error('Failed to create invoice');
            }

            const invoiceId = createResponse.data.id;

            // Add invoice line items
            if (lineItems.length > 0) {
                for (const lineItem of lineItems) {
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
                            tax_rate: lineItem?.tax_rate || 0,
                            ordered_quantity: lineItem?.ordered_quantity || 0,
                            ordered_amount: lineItem?.ordered_amount || 0,
                            invoice_qty: lineItem?.quantity || lineItem?.invoice_qty || lineItem?.ordered_quantity || 0,
                            need_by_date: lineItem?.need_by_date,
                        }
                    );
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
                    // Don't fail the whole process if attachment upload fails
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
                        variant="ghost"
                        size="sm"
                        onClick={handleBack}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft size={16} />
                        Back to Invoices
                    </Button>
                    {parsedData && !isUploading && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={handlePreviewPdf}
                                size="sm"
                                className="flex items-center gap-2"
                            >
                                <Eye size={16} />
                                Preview PDF
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
                            Upload Invoice PDF
                        </CardTitle>
                        <CardDescription>
                            Upload a PDF invoice to automatically extract data
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
                                    accept=".pdf"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <Upload size={64} className="mx-auto text-gray-400 mb-6" />
                                <p className="text-xl font-semibold text-gray-700 mb-3">
                                    Upload Invoice PDF
                                </p>
                                <p className="text-base text-gray-500 mb-4">
                                    Click to browse or drag and drop your PDF file here
                                </p>
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-600">
                                    <FileText size={16} />
                                    PDF files only, up to 10MB
                                </div>
                            </div>
                        )}

                        {/* Loading State */}
                        {isUploading && (
                            <div className="text-center py-8">
                                <Loader2 size={48} className="animate-spin mx-auto text-primary mb-4" />
                                <p className="text-lg font-medium text-gray-700">Processing your PDF...</p>
                                <p className="text-sm text-gray-500">This may take a few moments</p>
                            </div>
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
                                        <CardDescription>Extracted invoice information from PDF</CardDescription>
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

                                {/* Line Items Card */}
                                {parsedData.data.line_items && parsedData.data.line_items.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Line Items ({parsedData.data.line_items.length})</CardTitle>
                                            <CardDescription>Invoice line items extracted from PDF</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="overflow-x-auto">
                                                <table className="w-full border-collapse">
                                                    <thead>
                                                        <tr className="border-b bg-gray-50">
                                                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Item Name</th>
                                                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Description</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Quantity</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Rate</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Tax</th>
                                                            <th className="text-right p-3 text-sm font-semibold text-gray-700">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {parsedData.data.line_items.map((item, index) => (
                                                            <tr key={index} className="border-b hover:bg-gray-50">
                                                                <td className="p-3 text-sm text-gray-900">{item.item_name || '-'}</td>
                                                                <td className="p-3 text-sm text-gray-600">{item.item_description || '-'}</td>
                                                                <td className="p-3 text-sm text-gray-900 text-right">{item.quantity || item.invoice_qty || item.ordered_quantity || 0}</td>
                                                                <td className="p-3 text-sm text-gray-900 text-right">
                                                                    {parsedData.data.context?.currency || '$'}{(item.rate || 0).toLocaleString()}
                                                                </td>
                                                                <td className="p-3 text-sm text-gray-900 text-right">
                                                                    {parsedData.data.context?.currency || '$'}{(item.line_tax_amount || 0).toLocaleString()}
                                                                </td>
                                                                <td className="p-3 text-sm font-semibold text-gray-900 text-right">
                                                                    {parsedData.data.context?.currency || '$'}{(item.line_total || item.invoiced_amount || 0).toLocaleString()}
                                                                </td>
                                                            </tr>
                                                        ))}
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

                        {/* Error Display */}
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle size={20} />
                                <AlertDescription className="flex items-center justify-between">
                                    <span>{error}</span>
                                    {originalFile && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleUpload(originalFile)}
                                            className="ml-4"
                                        >
                                            Retry
                                        </Button>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* PDF Preview Dialog */}
            <Dialog open={showPdfPreview} onOpenChange={handleClosePdfPreview}>
                <DialogContent className="max-w-5xl w-full h-[90vh] p-0">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="text-primary" size={20} />
                            PDF Preview
                            {originalFile && (
                                <span className="text-sm font-normal text-gray-500">
                                    - {originalFile.name}
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden px-6 pb-6">
                        {pdfUrl ? (
                            <iframe
                                src={pdfUrl}
                                className="w-full h-full border rounded-lg"
                                title="PDF Preview"
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
