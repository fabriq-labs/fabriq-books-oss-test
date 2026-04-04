import { useState, useRef, useMemo } from "react";
import Master from "@/pages/Master";
import dayjs from "dayjs";
import { ReportControls } from "@/components/Reports/ReportControls";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { useReportController } from "@/contexts/ReportControllerContext";

export default function PostingList() {
    const [account, setAccount]: any = useState(null);
    const [closingBalanceData, setClosingBalanceData] = useState<{
        totalDebit: number;
        totalCredit: number;
        closingBalance: number;
    } | null>(null);

    // Use report controller context
    const { dateRange } = useReportController();

    const additionalFields = [
        { key: "account_name", label: "Account Name" },
        { key: "description", label: "Description" },
        { key: "amount", label: "Amount" },
        { key: "value_date", label: "Value Date" }
    ];

    // Custom render function for amount column based on account type
    const renderAmountColumn = (value: any, record: any) => {
        if (!value) return formatCurrency(0);

        const amount = parseFloat(value);
        const selectedAccountId = account?.id;

        // If no account is selected, show the amount as is
        if (!selectedAccountId) {
            return formatCurrency(amount);
        }

        // If this account is the debit account (account_id), show positive amount
        if (record.account_id === selectedAccountId) {
            return (
                <span className="text-green-700 font-medium">
                    {formatCurrency(amount)}
                </span>
            );
        }
        // If this account is the credit account (credit_account_id), show negative amount
        else if (record.credit_account_id === selectedAccountId) {
            return (
                <span className="text-red-700 font-medium">
                    -{formatCurrency(amount)}
                </span>
            );
        }
        // If the account is neither debit nor credit for this transaction, show as is
        return formatCurrency(amount);
    };

    const handleAccountChange = (value: any) => {
        setAccount(value);
    };

    const handleAccountClear = () => {
        setAccount(null);
    };

    const handleRefresh = () => {
        // Refresh will be handled by Master component
        window.location.reload();
    };

    // Calculate closing balance for selected account
    const calculateClosingBalance = (data: any[], accountId: string | null) => {
        if (!data || !accountId) return { totalDebit: 0, totalCredit: 0, closingBalance: 0 };

        let totalDebit = 0;
        let totalCredit = 0;

        data.forEach((record: any) => {
            const amount = parseFloat(record.amount) || 0;

            // If this account is the debit account (account_id), it's a debit
            if (record.account_id === accountId) {
                totalDebit += amount;
            }
            // If this account is the credit account (credit_account_id), it's a credit
            if (record.credit_account_id === accountId) {
                totalCredit += amount;
            }
        });

        const closingBalance = totalDebit - totalCredit;
        return { totalDebit, totalCredit, closingBalance };
    };

    // Handle data from Master component
    const handleMasterDataChange = (data: any) => {
        if (account?.id && data?.data && Array.isArray(data.data)) {
            const balanceData = calculateClosingBalance(data.data, account.id);
            setClosingBalanceData(balanceData);
        } else {
            setClosingBalanceData(null);
        }
    };

    // Create summary content for Master component
    const summaryContent = closingBalanceData && account ? (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex justify-end items-center">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Total Debit:</span>
                        <span className="text-lg font-bold text-red-700">
                            {formatCurrency(closingBalanceData.totalDebit)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Total Credit:</span>
                        <span className="text-lg font-bold text-green-700">
                            {formatCurrency(closingBalanceData.totalCredit)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Closing Balance:</span>
                        <span className={`text-lg font-bold ${closingBalanceData.closingBalance >= 0
                            ? 'text-blue-700'
                            : 'text-orange-700'
                            }`}>
                            {formatCurrency(closingBalanceData.closingBalance)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    const filter = useMemo(() => ({
        "description": {
            "ncontains": "Closing"
        },
        ...(account && {
            OR: [
                { account_id: account.id },
                { credit_account_id: account.id },
            ],
        }),
        // Add date range filter
        "AND": [
            {
                "value_date": {
                    "gte": dateRange[0].startOf('day').toISOString()
                }
            }
            , {
                "value_date": {
                    "lte": dateRange[1].startOf('day').add(1, 'day').subtract(1, 'millisecond').toISOString()
                }
            }
        ]

    }), [account, dateRange]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="w-full p-4">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight">Posting Transactions</h1>
                    <p className="text-muted-foreground">
                        View and analyze all posting transactions with account filtering.
                    </p>
                </div>

                {/* Posting List */}
                <Card className="p-4">
                    <div className="mb-4">
                        <ReportControls
                            selectedAccount={account}
                            onAccountChange={handleAccountChange}
                            onAccountClear={handleAccountClear}
                            onRefresh={handleRefresh}
                            loading={false}
                            showAccountFilter={true}
                            showRefreshButton={true}
                        />
                    </div>
                    {summaryContent}
                    <Master
                        type="posting"
                        view="posting_view"
                        displayName="Posting"
                        filterConfig={{
                            enableFilters: true,
                            enableSearch: false,
                        }}
                        listConfig={{
                            enableBulkEdit: false,
                            enableImport: false,
                            enableFilters: true,
                            enableSearch: false,
                            enableCreate: false,
                        }}
                        defaultFilters={filter}
                    />
                </Card>
            </div>
        </div>
    );
}



