import { getExtractedLineTotal } from '@/lib/invoices/extractedLineTotal';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, ArrowRight, CheckCircle } from 'lucide-react';

interface InvoiceMapPreviewProps {
    data: {
        invoice: {
            invoice_number?: string;
            invoice_date?: string;
            supplier_name?: string;
            payment_terms?: string;
            po_number?: string;
            invoice_net_total?: number;
            invoice_total?: number;
        };
        line_items: Array<{
            item_name?: string;
            item_description?: string;
            rate?: number;
            ordered_quantity?: number;
            quantity?: number;
            invoice_qty?: number;
            discount_rate?: number;
            discount_amount?: number;
            tax_rate?: number;
            line_tax_amount?: number;
            line_total?: number;
        }>;
    };
    message?: string;
    sidebarMode?: boolean;
}

export const InvoiceMapPreview: React.FC<InvoiceMapPreviewProps> = ({ data, message, sidebarMode }) => {
    const navigate = useNavigate();

    const handleRedirect = () => {
        // Navigate to invoice upload page with the extracted data
        navigate('/purchases/bills/upload', {
            state: {
                extractedInvoiceData: data
            }
        });
    };

    const { invoice, line_items } = data;

    return (
        <Card className={`border-2 border-blue-200 bg-white w-full`}>
            <CardHeader className={sidebarMode ? 'pb-2 px-3 pt-3' : 'pb-3'}>
                <div className={`flex items-center ${sidebarMode ? 'flex-col gap-2' : 'justify-between'}`}>
                    <div className="flex items-center gap-2">
                        <FileText className="text-blue-600" size={sidebarMode ? 16 : 20} />
                        <CardTitle className={sidebarMode ? 'text-sm' : 'text-lg'}>Invoice Extracted</CardTitle>
                    </div>
                    <div className={`flex items-center gap-2 text-green-600 ${sidebarMode ? 'text-xs' : 'text-sm'}`}>
                        <CheckCircle size={sidebarMode ? 14 : 16} />
                        <span className={`font-medium ${sidebarMode ? 'text-xs' : 'text-sm'}`}>Ready to Map</span>
                    </div>
                </div>
                {message && (
                    <CardDescription className={`mt-2 ${sidebarMode ? 'text-xs' : 'text-sm'} text-gray-600`}>
                        {message}
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent className={sidebarMode ? 'space-y-3 px-3 pb-3' : 'space-y-4'}>
                {/* Invoice Summary */}
                <div className={`bg-blue-50 border border-blue-200 rounded-lg ${sidebarMode ? 'p-2' : 'p-4'}`}>
                    <h4 className={`font-semibold text-blue-900 mb-2 ${sidebarMode ? 'text-xs' : 'text-sm'}`}>Invoice Details</h4>
                    <div className={`grid ${sidebarMode ? 'grid-cols-1' : 'grid-cols-2'} gap-2 ${sidebarMode ? 'text-xs' : 'text-sm'}`}>
                        {invoice.invoice_number && (
                            <div>
                                <span className="text-blue-700 font-medium">Invoice #:</span>
                                <span className="ml-2 text-blue-900">{invoice.invoice_number}</span>
                            </div>
                        )}
                        {invoice.invoice_date && (
                            <div>
                                <span className="text-blue-700 font-medium">Date:</span>
                                <span className="ml-2 text-blue-900">{invoice.invoice_date}</span>
                            </div>
                        )}
                        {invoice.supplier_name && (
                            <div>
                                <span className="text-blue-700 font-medium">Supplier:</span>
                                <span className="ml-2 text-blue-900">{invoice.supplier_name}</span>
                            </div>
                        )}
                        {invoice.po_number && (
                            <div>
                                <span className="text-blue-700 font-medium">PO Number:</span>
                                <span className="ml-2 text-blue-900">{invoice.po_number}</span>
                            </div>
                        )}
                        {invoice.payment_terms && (
                            <div>
                                <span className="text-blue-700 font-medium">Payment Terms:</span>
                                <span className="ml-2 text-blue-900">{invoice.payment_terms}</span>
                            </div>
                        )}
                        {invoice.invoice_total && (
                            <div>
                                <span className="text-blue-700 font-medium">Total:</span>
                                <span className="ml-2 text-blue-900 font-semibold">
                                    ${invoice.invoice_total.toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Line Items Summary */}
                {line_items && line_items.length > 0 && (
                    <div className={`bg-gray-50 border border-gray-200 rounded-lg ${sidebarMode ? 'p-2' : 'p-4'}`}>
                        <h4 className={`font-semibold text-gray-900 mb-2 ${sidebarMode ? 'text-xs' : 'text-sm'}`}>
                            Line Items ({line_items.length})
                        </h4>
                        <div className="space-y-2">
                            {line_items.slice(0, sidebarMode ? 2 : 3).map((item, index) => (
                                <div key={index} className={`flex ${sidebarMode ? 'flex-col items-start' : 'justify-between items-center'} ${sidebarMode ? 'text-xs' : 'text-sm'}`}>
                                    <div className="flex-1 min-w-0">
                                        <span className="font-medium text-gray-700 truncate block">
                                            {item.item_name || 'Unnamed Item'}
                                        </span>
                                        {item.item_description && !sidebarMode && (
                                            <span className="ml-2 text-gray-500 text-xs">
                                                - {item.item_description}
                                            </span>
                                        )}
                                    </div>
                                    <div className={`${sidebarMode ? 'mt-1' : 'text-right'}`}>
                                        <span className="text-gray-600">
                                            Qty: {item.ordered_quantity || 0}
                                        </span>
                                        {(() => {
                                            const lineTotal = getExtractedLineTotal(item);
                                            return lineTotal > 0 ? (
                                                <span className={`${sidebarMode ? 'ml-2' : 'ml-3'} font-medium text-gray-900`}>
                                                    ${lineTotal.toLocaleString()}
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>
                            ))}
                            {line_items.length > (sidebarMode ? 2 : 3) && (
                                <p className={`text-gray-500 mt-2 ${sidebarMode ? 'text-xs' : 'text-xs'}`}>
                                    +{line_items.length - (sidebarMode ? 2 : 3)} more item(s)
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Redirect Button */}
                <Button
                    onClick={handleRedirect}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    size={sidebarMode ? "default" : "lg"}
                >
                    Redirect to Invoice Upload
                    <ArrowRight className="ml-2" size={sidebarMode ? 16 : 18} />
                </Button>
            </CardContent>
        </Card>
    );
};

