import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Download, Trash2, ChevronDown, ChevronUp, Pencil, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

interface PaymentReceipt {
    id: string;
    notes: string;
    amount: number;
    status: string;
    account: any;
    invoice: {
        id: string;
        invoice_date: string;
        invoice_type: string | null;
        invoice_total: number;
        balance_amount: number;
        invoice_number: string;
        invoice_status: string | null;
        invoice_version: string | null;
        invoice_net_total: number;
        shipping_handling_misc_total: number | null;
    };
    customers: {
        id: string;
        customer_name: string;
    };
    account_id: string | null;
    invoice_id: string;
    base_amount: number | null;
    currency_id: string;
    payment_type: string | null;
    receipt_date: string;
    exchange_rate: number | null;
    payment_method: string;
    receipt_number: string;
    currency: {
        id: string;
        code: string;
    };
    payment_reference: string;
}

interface PaymentReceiptTableProps {
    paymentReceipts: PaymentReceipt[];
    currency?: string;
    remainingBalance?: number;
    onView?: (paymentReceipt: PaymentReceipt) => void;
    onEdit?: (paymentReceipt: PaymentReceipt) => void;
    onDelete?: (paymentReceipt: PaymentReceipt) => void;
    onDownload?: (paymentReceipt: PaymentReceipt) => void;
    onUpdate?: (paymentId: string, field: string, value: any) => void;
    isLoading?: boolean;
    showActions?: boolean;
    updatingPaymentId?: string | null;
}

export const PaymentReceiptTable: React.FC<PaymentReceiptTableProps> = ({
    paymentReceipts = [],
    currency = 'USD',
    remainingBalance,
    onView,
    onEdit,
    onDelete,
    onDownload,
    onUpdate,
    isLoading = false,
    showActions = true,
    updatingPaymentId = null
}) => {
    const [isTableExpanded, setIsTableExpanded] = useState(true);
    const navigate = useNavigate();

    // Format currency
    const formatCurrency = (amount: number, currencyCode: string = currency) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
        }).format(amount);
    };

    // Format date
    const formatDate = (dateString: string) => {
        return dayjs(dateString).format('DD-MM-YYYY');
    };

    // Get status badge variant
    const getStatusBadgeVariant = (status: string | null | undefined) => {
        if (!status) return 'outline';
        switch (status.toLowerCase()) {
            case 'active':
                return 'default';
            case 'inactive':
                return 'secondary';
            default:
                return 'outline';
        }
    };

    // Get payment type badge variant
    const getPaymentTypeBadgeVariant = (paymentType: string | null | undefined) => {
        if (!paymentType) return 'outline';
        switch (paymentType.toLowerCase()) {
            case 'full':
                return 'default';
            case 'partial':
                return 'secondary';
            case 'advance':
                return 'outline';
            default:
                return 'outline';
        }
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Payment Receipts</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(3)].map((_, index) => (
                            <div key={index} className="animate-pulse">
                                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!paymentReceipts || paymentReceipts.length === 0) {
        return (
            <Card>
                <CardContent className="py-5">
                    <div className="text-center text-gray-500">
                        <p className="text-sm font-medium">No payment receipts found</p>
                    </div>
                </CardContent>
            </Card >
        );
    }

    const totalPayments = paymentReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const displayBalance = Number(paymentReceipts[0]?.invoice?.balance_amount ?? remainingBalance ?? 0) || 0;
    const currencyCode = paymentReceipts[0]?.currency?.code || currency;

    return (
        <Card>
            <CardHeader className="py-2 px-4">
                <div
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => setIsTableExpanded((prev) => !prev)}
                >
                    <span className="text-lg font-semibold text-foreground">Payments Received</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={isTableExpanded ? "Collapse table" : "Expand table"}
                    >
                        {isTableExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                    </Button>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4">
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground font-normal">Total Payments</p>
                        <p className="text-lg font-semibold text-foreground mt-0.5">
                            {formatCurrency(totalPayments, currencyCode)}
                        </p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground font-normal">Remaining Balance</p>
                        <p className="text-lg font-semibold text-orange-600 mt-0.5">
                            {formatCurrency(displayBalance, currencyCode)}
                        </p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground font-normal">Payment Count</p>
                        <p className="text-lg font-semibold text-foreground mt-0.5">
                            {paymentReceipts.length}
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isTableExpanded && (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Receipt #</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Payment Method</TableHead>
                                    <TableHead>Payment Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Reference</TableHead>
                                    {showActions && <TableHead className="text-right">Actions</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paymentReceipts.map((paymentReceipt) => (
                                    <TableRow key={paymentReceipt.id}>
                                        <TableCell className="font-medium">
                                            {paymentReceipt?.receipt_number}
                                        </TableCell>
                                        <TableCell>
                                            {formatDate(paymentReceipt?.receipt_date)}
                                        </TableCell>
                                        <TableCell className="font-semibold">
                                            {formatCurrency(
                                                paymentReceipt?.amount,
                                                paymentReceipt?.currency?.code || currency
                                            )}
                                        </TableCell>

                                        <TableCell>
                                            <span className="text-sm text-gray-600">
                                                {paymentReceipt?.payment_method}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getPaymentTypeBadgeVariant(paymentReceipt.payment_type)}>
                                                {paymentReceipt?.payment_type || '-'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusBadgeVariant(paymentReceipt.status)}>
                                                {paymentReceipt?.status || '-'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-gray-600">
                                                {paymentReceipt?.payment_reference || '-'}
                                            </span>
                                        </TableCell>
                                        {showActions && (
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end space-x-2">
                                                    {/* {onView && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onView(paymentReceipt)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                )} */}
                                                    {/* {onDownload && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onDownload(paymentReceipt)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                )} */}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() =>
                                                            navigate(
                                                                `/payment_receipt/${paymentReceipt.id}/view/payment_receipt_view`
                                                            )
                                                        }
                                                        className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                                                        disabled={updatingPaymentId === paymentReceipt.id}
                                                    >
                                                        <Edit size={16} />
                                                    </Button>
                                                    {onDelete && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => onDelete(paymentReceipt)}
                                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                                            disabled={updatingPaymentId === paymentReceipt.id}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};