import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, FileText, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ComparisonData {
    po: {
        rate: number;
        taxRate: number;
        lineTotal: number;
        lineTaxAmount: number;
        lineTotalWithTax: number;
        itemName: string;
    };
    invoice: {
        rate: number;
        taxRate: number;
        lineTotal: number;
        lineTaxAmount: number;
        lineTotalWithTax: number;
    };
    differences: {
        rate: number;
        taxRate: number;
        lineTotal: number;
        lineTaxAmount: number;
        lineTotalWithTax: number;
    };
}

interface InvoiceLineItemComparisonDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    comparisonData: ComparisonData | null;
    invoiceItemName: string;
    onApprove: (useInvoiceValues: boolean) => void;
    onReject: () => void;
    isDeleting?: boolean;
    readOnly?: boolean;
}

export const InvoiceLineItemComparisonDialog: React.FC<InvoiceLineItemComparisonDialogProps> = ({
    open,
    onOpenChange,
    comparisonData,
    invoiceItemName,
    onApprove,
    onReject,
    isDeleting = false,
    readOnly = false
}) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Validate Mapping</DialogTitle>
                    <DialogDescription>
                        Compare invoice line item values with the selected PO line item before approving the mapping.
                    </DialogDescription>
                </DialogHeader>

                {comparisonData && (
                    <div className="space-y-4 py-4">
                        {/* Item Names */}
                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-1">Invoice Item</p>
                                <p className="text-sm font-semibold text-gray-900">{invoiceItemName}</p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-1">PO Line Item</p>
                                <p className="text-sm font-semibold text-gray-900">{comparisonData.po.itemName}</p>
                            </div>
                        </div>

                        {/* Comparison Table */}
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Field</th>
                                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">Invoice</th>
                                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">PO Line Item</th>
                                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">Difference</th>
                                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {/* Rate */}
                                    <tr>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">Rate</td>
                                        <td className="px-4 py-3 text-sm text-right">₹{comparisonData.invoice.rate.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-sm text-right">₹{comparisonData.po.rate.toFixed(2)}</td>
                                        <td className={cn(
                                            "px-4 py-3 text-sm text-right font-medium",
                                            Math.abs(comparisonData.differences.rate) < 0.01 ? "text-green-600" : "text-orange-600"
                                        )}>
                                            {comparisonData.differences.rate >= 0 ? '+' : ''}₹{comparisonData.differences.rate.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {Math.abs(comparisonData.differences.rate) < 0.01 ? (
                                                <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                                            ) : (
                                                <AlertTriangle className="h-4 w-4 text-orange-600 mx-auto" />
                                            )}
                                        </td>
                                    </tr>

                                    {/* Tax Rate */}
                                    <tr>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">Tax Rate (%)</td>
                                        <td className="px-4 py-3 text-sm text-right">{comparisonData.invoice.taxRate.toFixed(2)}%</td>
                                        <td className="px-4 py-3 text-sm text-right">{comparisonData.po.taxRate.toFixed(2)}%</td>
                                        <td className={cn(
                                            "px-4 py-3 text-sm text-right font-medium",
                                            Math.abs(comparisonData.differences.taxRate) < 0.01 ? "text-green-600" : "text-orange-600"
                                        )}>
                                            {comparisonData.differences.taxRate >= 0 ? '+' : ''}{comparisonData.differences.taxRate.toFixed(2)}%
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {Math.abs(comparisonData.differences.taxRate) < 0.01 ? (
                                                <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                                            ) : (
                                                <AlertTriangle className="h-4 w-4 text-orange-600 mx-auto" />
                                            )}
                                        </td>
                                    </tr>

                                    {/* Line Tax Amount */}
                                    <tr>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">Line Tax Amount</td>
                                        <td className="px-4 py-3 text-sm text-right">₹{comparisonData.invoice.lineTaxAmount.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-sm text-right">₹{comparisonData.po.lineTaxAmount.toFixed(2)}</td>
                                        <td className={cn(
                                            "px-4 py-3 text-sm text-right font-medium",
                                            Math.abs(comparisonData.differences.lineTaxAmount) < 0.01 ? "text-green-600" : "text-orange-600"
                                        )}>
                                            {comparisonData.differences.lineTaxAmount >= 0 ? '+' : ''}₹{comparisonData.differences.lineTaxAmount.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {Math.abs(comparisonData.differences.lineTaxAmount) < 0.01 ? (
                                                <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                                            ) : (
                                                <AlertTriangle className="h-4 w-4 text-orange-600 mx-auto" />
                                            )}
                                        </td>
                                    </tr>

                                    {/* Line Total */}
                                    <tr className="bg-gray-50">
                                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">Line Total</td>
                                        <td className="px-4 py-3 text-sm text-right font-semibold">₹{comparisonData.invoice.lineTotal.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-sm text-right font-semibold">₹{comparisonData.po.lineTotal.toFixed(2)}</td>
                                        <td className={cn(
                                            "px-4 py-3 text-sm text-right font-semibold",
                                            Math.abs(comparisonData.differences.lineTotal) < 0.01 ? "text-green-600" : "text-orange-600"
                                        )}>
                                            {comparisonData.differences.lineTotal >= 0 ? '+' : ''}₹{comparisonData.differences.lineTotal.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {Math.abs(comparisonData.differences.lineTotal) < 0.01 ? (
                                                <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                                            ) : (
                                                <AlertTriangle className="h-4 w-4 text-orange-600 mx-auto" />
                                            )}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={onReject}
                        disabled={isDeleting || readOnly}
                        className="w-full sm:w-auto"
                    >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel
                    </Button>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button
                            onClick={() => onApprove(true)}
                            disabled={isDeleting || readOnly}
                            variant="outline"
                            className="flex-1 sm:flex-none bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                        >
                            <FileText className="h-4 w-4 mr-2" />
                            Use Invoice Values
                        </Button>
                        <Button
                            onClick={() => onApprove(false)}
                            disabled={isDeleting || readOnly}
                            className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
                        >
                            <Package className="h-4 w-4 mr-2" />
                            Use PO Item Values
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

