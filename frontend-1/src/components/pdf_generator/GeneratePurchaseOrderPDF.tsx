'use client';
import React, { useState, Component, ReactNode } from 'react';
import { Button } from 'antd';
import { FilePdfOutlined, DownloadOutlined } from '@ant-design/icons';
import { pdf } from '@react-pdf/renderer';
import { PurchaseOrderPDFDocument, PurchaseOrderPDFViewer, extractPDFData } from './PurchaseOrderPdf';
import { useUserData } from '@/hooks/useUserData';
import { useCurrencyFormatting } from '@/utils/currencyUtils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

// Error Boundary Component
class PDFErrorBoundary extends Component<
    { children: ReactNode; fallback?: ReactNode },
    { hasError: boolean; error?: Error }
> {
    constructor(props: { children: ReactNode; fallback?: ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        console.error('PDF Error Boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                        <div className="text-red-500 mb-2">PDF rendering error occurred</div>
                        <Button onClick={() => this.setState({ hasError: false })}>Try Again</Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export const GeneratePurchaseOrderPDF = ({ purchaseOrder }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { getBaseCurrencyDetails } = useUserData();
    const { getPDFCurrencySymbol } = useCurrencyFormatting();

    // Get PDF-compatible currency symbol
    const currencySymbol = getPDFCurrencySymbol();
    const currencyDetails = getBaseCurrencyDetails();


    const handleGeneratePDF = async () => {
        setIsLoading(true);
        setError(null);

        try {
            if (!purchaseOrder) {
                throw new Error('No purchase order data available');
            }

            // Extract and sanitize data before creating PDF for download
            const extractedData = extractPDFData(purchaseOrder);

            if (!extractedData || !extractedData.po_number) {
                throw new Error('Invalid purchase order data');
            }


            const blob = await pdf(
                <PurchaseOrderPDFDocument purchaseOrder={extractedData} currencySymbol={currencySymbol} />
            ).toBlob();

            const fileName = `PO_${purchaseOrder?.po_number || 'document'}.pdf`;
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error generating PDF:', error);
            setError(error instanceof Error ? error.message : 'Failed to generate PDF');
        } finally {
            setIsLoading(false);
        }
    };

    // Don't render if no purchase order data
    if (!purchaseOrder || Object.keys(purchaseOrder).length === 0) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    type="primary"
                    icon={<FilePdfOutlined />}
                    onClick={() => setIsOpen(true)}
                    style={{ marginRight: '10px' }}
                >
                    Download PO
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>
                        Purchase Order PDF - {purchaseOrder?.po_number}
                    </DialogTitle>
                </DialogHeader>
                <div className="mt-4 h-[70vh] overflow-hidden relative">
                    {error ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <div className="text-red-500 mb-2">Error: {error}</div>
                                <Button onClick={() => setError(null)}>Try Again</Button>
                            </div>
                        </div>
                    ) : (
                        <PDFErrorBoundary>
                            <PurchaseOrderPDFViewer purchaseOrder={purchaseOrder} currencySymbol={currencySymbol} />
                        </PDFErrorBoundary>
                    )}
                    <div className="absolute bottom-4 right-4 z-10">
                        <Button
                            type="primary"
                            icon={<DownloadOutlined />}
                            onClick={handleGeneratePDF}
                            loading={isLoading}
                            size="large"
                            className="shadow-lg"
                            disabled={!!error}
                        >
                            Download PDF
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
