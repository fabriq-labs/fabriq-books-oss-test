import { useState, useMemo } from "react";
import Master from "@/pages/Master";
import dayjs from "dayjs";
import { ReportControls } from "@/components/Reports/ReportControls";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { useEntity } from "@/contexts/EntityContext";
import {
    FinancialYearSelector,
    FinancialYearOption,
    FinancialYearType,
    MonthOption,
    buildMonthOptions,
    getPreviousFYOption,
} from "@/components/Reports/FinancialYearSelector";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function PostingList() {
    const [account, setAccount]: any = useState(null);
    const [closingBalanceData, setClosingBalanceData] = useState<{
        totalDebit: number;
        totalCredit: number;
        closingBalance: number;
    } | null>(null);

    const { currentEntity } = useEntity();

    const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() =>
        getPreviousFYOption((currentEntity?.financial_year_type as FinancialYearType) ?? "JAN_DEC")
    );
    const [selectedMonth, setSelectedMonth] = useState<MonthOption | null>(null);

    const monthOptions = useMemo(() => buildMonthOptions(selectedFY), [selectedFY]);

    const effectiveDateRange = useMemo((): [dayjs.Dayjs, dayjs.Dayjs] => {
        const from = selectedMonth?.from_date ?? selectedFY.from_date;
        const to = selectedMonth?.to_date ?? selectedFY.to_date;
        return [dayjs(from), dayjs(to)];
    }, [selectedFY, selectedMonth]);

    const additionalFields = [
        { key: "account_name", label: "Account Name" },
        { key: "description", label: "Description" },
        { key: "amount", label: "Amount" },
        { key: "value_date", label: "Value Date" }
    ];

    const renderAmountColumn = (value: any, record: any) => {
        if (!value) return formatCurrency(0);

        const amount = parseFloat(value);
        const selectedAccountId = account?.id;

        if (!selectedAccountId) {
            return formatCurrency(amount);
        }

        if (record.account_id === selectedAccountId) {
            return (
                <span className="text-green-700 font-medium">
                    {formatCurrency(amount)}
                </span>
            );
        } else if (record.credit_account_id === selectedAccountId) {
            return (
                <span className="text-red-700 font-medium">
                    -{formatCurrency(amount)}
                </span>
            );
        }
        return formatCurrency(amount);
    };

    const handleAccountChange = (value: any) => setAccount(value);
    const handleAccountClear = () => setAccount(null);
    const handleRefresh = () => window.location.reload();

    const calculateClosingBalance = (data: any[], accountId: string | null) => {
        if (!data || !accountId) return { totalDebit: 0, totalCredit: 0, closingBalance: 0 };

        let totalDebit = 0;
        let totalCredit = 0;

        data.forEach((record: any) => {
            const amount = parseFloat(record.amount) || 0;
            if (record.account_id === accountId) totalDebit += amount;
            if (record.credit_account_id === accountId) totalCredit += amount;
        });

        return { totalDebit, totalCredit, closingBalance: totalDebit - totalCredit };
    };

    const handleMasterDataChange = (data: any) => {
        if (account?.id && data?.data && Array.isArray(data.data)) {
            setClosingBalanceData(calculateClosingBalance(data.data, account.id));
        } else {
            setClosingBalanceData(null);
        }
    };

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
                        <span className={`text-lg font-bold ${closingBalanceData.closingBalance >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                            {formatCurrency(closingBalanceData.closingBalance)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    const filter = useMemo(() => ({
        "description": { "ncontains": "Closing" },
        ...(account && {
            OR: [
                { account_id: account.id },
                { credit_account_id: account.id },
            ],
        }),
        "AND": [
            { "value_date": { "gte": effectiveDateRange[0].startOf("day").toISOString() } },
            { "value_date": { "lte": effectiveDateRange[1].endOf("day").toISOString() } },
        ],
    }), [account, effectiveDateRange]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="w-full p-4">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight">Posting Transactions</h1>
                    <p className="text-muted-foreground">
                        View and analyze all posting transactions with account filtering.
                    </p>
                </div>

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
                            beforeRefresh={
                                <>
                                    <FinancialYearSelector
                                        fyType={currentEntity?.financial_year_type}
                                        value={selectedFY.value}
                                        onChange={(opt) => { setSelectedFY(opt); setSelectedMonth(null); }}
                                        className="w-[130px] h-9 border-slate-300 text-sm shrink-0"
                                    />
                                    <Select
                                        value={selectedMonth?.value ?? "__all__"}
                                        onValueChange={(v) => {
                                            if (v === "__all__") setSelectedMonth(null);
                                            else setSelectedMonth(monthOptions.find((m) => m.value === v) ?? null);
                                        }}
                                    >
                                        <SelectTrigger className="w-[150px] h-9 border-slate-300 text-sm shrink-0">
                                            <SelectValue placeholder="All Months" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">All Months</SelectItem>
                                            {monthOptions.map((m) => (
                                                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </>
                            }
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
