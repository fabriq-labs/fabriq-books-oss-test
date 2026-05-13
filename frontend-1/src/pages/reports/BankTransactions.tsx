import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useEntity } from "@/contexts/EntityContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { ReportControls } from "@/components/Reports/ReportControls";
import { FinancialYearSelector, getPreviousFYOption, type FinancialYearOption, type FinancialYearType } from "@/components/Reports/FinancialYearSelector";
import { viewAPI } from "@/api/api";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Master, { MasterHandle } from "@/pages/Master";
import { createBankTransactionRowRenderer } from "@/components/masters/posting/BankTransactionRow";
import { formatDate } from "@/lib/formatters";
import dayjs from "dayjs";
import {
    PieChart,
    Pie,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LineChart,
    Line,
    CartesianGrid,
    Legend,
} from "recharts";
import { GitMerge, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat as useChatContext } from "@/contexts/ChatContext";
import { getModelDisplayName, getViewName } from "@/utils/modelDisplayNames";
import { useLocation } from "react-router-dom";
import { BulkAction, MergeRow } from "@/types/bulkActions";
import MergePostingsModal, {
    PostingRowLike,
} from "@/components/forms/Masters/MergePostingsModal";

interface SimpleTransaction {
    id: string;
    value_date: string;
    description: string;
    account_name: string;
    category_name: string;
    amount: number;
    isMoneyIn: boolean;
    currency: string;
}

// Chart colors
const EXPENSE_COLORS = ['#E74A3B', '#F6C23E', '#36B9CC', '#4E73DF', '#858796', '#1CC88A', '#6f42c1', '#fd7e14'];
const INCOME_COLORS = ['#1CC88A', '#36B9CC', '#4E73DF', '#F6C23E', '#858796', '#6f42c1'];

// Check if account is Bank or Credit Card based on type array (case-insensitive)
const isBankOrCreditCard = (account: any): boolean => {
    if (!account?.type || !Array.isArray(account.type)) return false;
    return account.type.some(
        (t: string) =>
            String(t).toLowerCase() === 'bank' || String(t).toLowerCase() === 'credit_card'
    );
};

// Transform posting data to simplified view. Direction (in/out) is always from the selected account's perspective.
const transformPostingData = (
    postings: any[],
    selectedAccountId: string
): SimpleTransaction[] => {
    return postings.map((posting) => {
        const debitAccount = posting.account;
        const creditAccount = posting.credit_account;
        const amount = parseFloat(posting.amount) || 0;

        const selectedIsDebit = posting.account_id === selectedAccountId;
        const selectedIsCredit = posting.credit_account_id === selectedAccountId;

        // Incoming vs outgoing purely from the chosen account's perspective (bank/asset: debit = money in, credit = money out)
        const isMoneyIn = selectedIsDebit;

        const accountName =
            selectedIsDebit
                ? debitAccount?.name
                : selectedIsCredit
                    ? creditAccount?.name
                    : debitAccount?.name || creditAccount?.name || 'N/A';
        const categoryName =
            selectedIsDebit
                ? (creditAccount?.name || posting.category?.name || 'N/A')
                : selectedIsCredit
                    ? (debitAccount?.name || posting.category?.name || 'N/A')
                    : (creditAccount?.name || posting.category?.name || 'N/A');

        const currency =
            selectedIsDebit
                ? (debitAccount?.currency || 'INR')
                : selectedIsCredit
                    ? (creditAccount?.currency || 'INR')
                    : (debitAccount?.currency || creditAccount?.currency || 'INR');

        return {
            id: posting.id,
            value_date: posting.value_date,
            description: posting.description || '',
            account_name: accountName,
            category_name: categoryName,
            amount: amount,
            isMoneyIn,
            currency,
        };
    });
};

function resolveEntityFYType(entities: { id: string; is_it_headquartres?: boolean; financial_year_type?: string }[], currentId: string | null): FinancialYearType {
    const current = entities.find((e) => e.id === currentId);
    if (current?.financial_year_type) return current.financial_year_type as FinancialYearType;
    const hq = entities.find((e) => e.is_it_headquartres);
    if (hq?.financial_year_type) return hq.financial_year_type as FinancialYearType;
    return "JAN_DEC";
}

export default function BankTransactions() {
    const { entities, currentEntityId } = useEntity();
    const location = useLocation();
    const { setPageContext } = useChatContext();
    const masterRef = useRef<MasterHandle>(null);

    const fyType = useMemo(() => resolveEntityFYType(entities, currentEntityId), [entities, currentEntityId]);

    const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() => getPreviousFYOption("JAN_DEC"));

    // Re-default when entity's FY type resolves
    useEffect(() => {
        setSelectedFY(getPreviousFYOption(fyType));
    }, [fyType]);

    const fyDateRange = useMemo(() => [dayjs(selectedFY.from_date), dayjs(selectedFY.to_date)] as const, [selectedFY]);

    const [account, setAccount] = useState<any>(null);
    const [mergePair, setMergePair] = useState<[PostingRowLike, PostingRowLike] | null>(null);
    const [accountDropdownKey, setAccountDropdownKey] = useState(0);
    const [transactions, setTransactions] = useState<SimpleTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [total, setTotal] = useState(0);
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

    useEffect(() => {
        const modelName = 'posting';
        setPageContext({
            modelName,
            viewName: getViewName(modelName),
            recordId: selectedTransactionId ?? null,
            stateId: null,
            viewId: null,
            modelDisplayName: getModelDisplayName(modelName),
            currentPath: location.pathname,
            promptTypes: ['reconciliation', 'analytics', 'default'],
            modelContext: {
                selectedAccountId: account?.id || null,
                selectedAccountName: account?.name || null
            }
        });

        return () => {
            setPageContext(null);
        };
    }, [account?.id, account?.name, location.pathname, setPageContext, selectedTransactionId]);

    // Clear selected transaction when account changes
    useEffect(() => {
        setSelectedTransactionId(null);
    }, [account?.id]);

    // When global entity changes, reset account selection and force dropdown remount
    const isMountedEntity = useRef(false);
    useEffect(() => {
        if (!isMountedEntity.current) { isMountedEntity.current = true; return; }
        setAccount(null);
        setPage(1);
        setAccountDropdownKey(k => k + 1);
    }, [currentEntityId]);


    // Compute chart data from transactions
    const chartData = useMemo(() => {
        const totalIncome = transactions
            .filter((t) => t.isMoneyIn)
            .reduce((sum, t) => sum + t.amount, 0);
        const totalExpenses = transactions
            .filter((t) => !t.isMoneyIn)
            .reduce((sum, t) => sum + t.amount, 0);
        const netAmount = totalIncome - totalExpenses;

        // Fallback; page uses displayCurrency (legal entity base) when rendering
        const primaryCurrency = transactions[0]?.currency || "INR";

        // Group expenses by category
        const expensesByCategory: Record<string, number> = {};
        transactions
            .filter((t) => !t.isMoneyIn && t.category_name)
            .forEach((t) => {
                const cat = t.category_name || 'Uncategorized';
                expensesByCategory[cat] = (expensesByCategory[cat] || 0) + t.amount;
            });
        const expenseCategoryData = Object.entries(expensesByCategory)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8); // Top 8 categories

        // Group income by category
        const incomeByCategory: Record<string, number> = {};
        transactions
            .filter((t) => t.isMoneyIn && t.category_name)
            .forEach((t) => {
                const cat = t.category_name || 'Uncategorized';
                incomeByCategory[cat] = (incomeByCategory[cat] || 0) + t.amount;
            });
        const incomeCategoryData = Object.entries(incomeByCategory)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6); // Top 6 categories

        // Monthly trend data
        const monthlyData: Record<string, { income: number; expenses: number }> = {};
        transactions.forEach((t) => {
            const month = dayjs(t.value_date).format('MMM YYYY');
            if (!monthlyData[month]) {
                monthlyData[month] = { income: 0, expenses: 0 };
            }
            if (t.isMoneyIn) {
                monthlyData[month].income += t.amount;
            } else {
                monthlyData[month].expenses += t.amount;
            }
        });
        const trendData = Object.entries(monthlyData)
            .map(([month, data]) => ({
                month,
                income: data.income,
                expenses: data.expenses,
                net: data.income - data.expenses,
            }))
            .reverse(); // Oldest first

        // Summary bar chart data
        const summaryData = [
            { name: 'Income', value: totalIncome, fill: '#1CC88A' },
            { name: 'Expenses', value: totalExpenses, fill: '#E74A3B' },
        ];

        return {
            totalIncome,
            totalExpenses,
            netAmount,
            primaryCurrency,
            expenseCategoryData,
            incomeCategoryData,
            trendData,
            summaryData,
        };
    }, [transactions]);

    const filter = useMemo(() => ({
        "description": {
            "ncontains": "Closing"
        },
        "posting_type": { "not": "DUPLICATE" },
        ...(account && {
            OR: [
                { account_id: { eq: account.id } },
                { credit_account_id: { eq: account.id } },
            ],
        }),
        "AND": [
            { "value_date": { "gte": fyDateRange[0].startOf('day').toISOString() } },
            { "value_date": { "lte": fyDateRange[1].endOf('day').toISOString() } },
        ]
    }), [account, fyDateRange]);

    const bulkActions: BulkAction[] = useMemo(() => [
        {
            id: 'merge',
            label: 'Merge',
            icon: <GitMerge size={16} />,
            variant: 'outline',
            isVisible: (rows) => rows.length === 2,
            onClick: async (rows) => {
                setMergePair([rows[0] as PostingRowLike, rows[1] as PostingRowLike]);
            },
        },
    ], []);

    const fetchTransactions = useCallback(async () => {
        if (!account) {
            setTransactions([]);
            setTotal(0);
            return;
        }
        setIsLoading(true);
        try {
            const sortOption = { value_date: 'desc' as const };
            const response = await viewAPI.search(
                'posting',
                'posting_simple_view',
                page,
                pageSize,
                undefined,
                filter,
                sortOption
            );

            if (response?.data) {
                const transformed = transformPostingData(response.data, account.id);
                setTransactions(transformed);
                setTotal(response.total || 0);
            }
        } catch (error) {
            console.error("Error fetching transactions:", error);
        } finally {
            setIsLoading(false);
        }
    }, [account, page, pageSize, filter]);

    useEffect(() => {
        if (account) {
            fetchTransactions();
        } else {
            setTransactions([]);
            setTotal(0);
        }
    }, [account, fetchTransactions]);

    const handleAccountChange = (value: any) => {
        setAccount(value);
        setPage(1);
    };

    const handleAccountClear = () => {
        setAccount(null);
        setPage(1);
    };

    const handleRefresh = () => {
        fetchTransactions();
    };

    const displayCurrency = useMemo(() => {
        if (account?.currency?.code) return account.currency.code;
        return transactions[0]?.currency || "INR";
    }, [account, transactions]);

    const simpleRowRenderer = useMemo(
        () => createBankTransactionRowRenderer(account?.id, displayCurrency),
        [account?.id, displayCurrency]
    );

    // defaultFilters for Master — account OR/AND date range + global entity context
    const masterDefaultFilters = useMemo(() => {
        const base: Record<string, any> = {
            description: { ncontains: 'Closing' },
            posting_type: { not: 'DUPLICATE' },
            ...(currentEntityId ? { legal_entity_id: currentEntityId } : {}),
        };
        if (account) {
            base.OR = [
                { account_id: { eq: account.id } },
                { credit_account_id: { eq: account.id } },
            ];
        }
        base.AND = [
            { value_date: { gte: fyDateRange[0].startOf('day').toISOString() } },
            { value_date: { lte: fyDateRange[1].endOf('day').toISOString() } },
        ];
        return base;
    }, [account, fyDateRange, currentEntityId]);

    const accountAdditionalFilters = useMemo(
        () =>
            currentEntityId
                ? { legal_entity_id: { eq: currentEntityId } }
                : undefined,
        [currentEntityId]
    );

    const accountFilterOptions = useCallback((items: any[]) => {
        return items.filter((item: any) => isBankOrCreditCard(item));
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="w-full p-4">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight">Bank Transactions</h1>
                    <p className="text-muted-foreground">
                        A simplified view of your bank and credit card transactions.
                    </p>
                </div>

                <Card className="p-4">
                    <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                        <FinancialYearSelector
                            fyType={fyType}
                            value={selectedFY.value}
                            onChange={setSelectedFY}
                        />
                        <ReportControls
                            selectedAccount={account}
                            onAccountChange={handleAccountChange}
                            onAccountClear={handleAccountClear}
                            onRefresh={handleRefresh}
                            loading={isLoading}
                            showAccountFilter={true}
                            showRefreshButton={true}
                            accountAdditionalFilters={accountAdditionalFilters}
                            accountFilterOptions={accountFilterOptions}
                            skipInitialAccountSearch={true}
                            accountKey={String(accountDropdownKey)}
                        />
                    </div>

                    <Tabs defaultValue="transactions" className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="transactions">Transactions</TabsTrigger>
                            <TabsTrigger value="insights">Insights</TabsTrigger>
                        </TabsList>

                        <TabsContent value="transactions">
                            {!account ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    Select an account to view transactions.
                                </div>
                            ) : (
                                <Master
                                    key={`${currentEntityId ?? 'all'}-${account?.id ?? 'none'}-${selectedFY.value}`}
                                    ref={masterRef}
                                    type="posting"
                                    view="posting_simple_view"
                                    displayName="Transactions"
                                    defaultFilters={masterDefaultFilters}
                                    defaultSortOption={{ field: 'value_date', direction: 'desc' }}
                                    filterConfig={{ enableFilters: false, enableSearch: true }}
                                    bulkActions={bulkActions}
                                    customRowRenderer={simpleRowRenderer}
                                    isCreate={false}
                                    isImport={false}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="insights">
                            {!account ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    Select an account to view insights.
                                </div>
                            ) : isLoading ? (
                                <div className="flex justify-center items-center h-64">
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No transactions found for the selected period.
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <Card className="bg-green-50 border-green-200">
                                            <CardContent className="pt-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-green-600">Total Income</p>
                                                        <p className="text-2xl font-bold text-green-700">
                                                            {formatCurrency(chartData.totalIncome, displayCurrency)}
                                                        </p>
                                                    </div>
                                                    <TrendingUp className="h-8 w-8 text-green-500" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card className="bg-red-50 border-red-200">
                                            <CardContent className="pt-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-red-600">Total Expenses</p>
                                                        <p className="text-2xl font-bold text-red-700">
                                                            {formatCurrency(chartData.totalExpenses, displayCurrency)}
                                                        </p>
                                                    </div>
                                                    <TrendingDown className="h-8 w-8 text-red-500" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card className={chartData.netAmount >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}>
                                            <CardContent className="pt-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className={`text-sm font-medium ${chartData.netAmount >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                                            Net {chartData.netAmount >= 0 ? 'Savings' : 'Deficit'}
                                                        </p>
                                                        <p className={`text-2xl font-bold ${chartData.netAmount >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                                                            {formatCurrency(Math.abs(chartData.netAmount), displayCurrency)}
                                                        </p>
                                                    </div>
                                                    <DollarSign className={`h-8 w-8 ${chartData.netAmount >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    {/* Charts Row 1 */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Income vs Expenses Bar Chart */}
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-lg font-medium">Income vs Expenses</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="h-64">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={chartData.summaryData} layout="vertical">
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis type="number" tickFormatter={(v) => formatCurrency(v, displayCurrency)} />
                                                            <YAxis type="category" dataKey="name" width={80} />
                                                            <Tooltip formatter={(value: number) => formatCurrency(value, displayCurrency)} />
                                                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                                {chartData.summaryData.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                                ))}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Monthly Trend Line Chart */}
                                        {chartData.trendData.length > 1 && (
                                            <Card>
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-lg font-medium">Monthly Trend</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="h-64">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <LineChart data={chartData.trendData}>
                                                                <CartesianGrid strokeDasharray="3 3" />
                                                                <XAxis dataKey="month" />
                                                                <YAxis tickFormatter={(v) => formatCurrency(v, displayCurrency)} />
                                                                <Tooltip formatter={(value: number) => formatCurrency(value, displayCurrency)} />
                                                                <Legend />
                                                                <Line type="monotone" dataKey="income" stroke="#1CC88A" strokeWidth={2} name="Income" />
                                                                <Line type="monotone" dataKey="expenses" stroke="#E74A3B" strokeWidth={2} name="Expenses" />
                                                            </LineChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </div>

                                    {/* Charts Row 2 - Pie Charts */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Expenses by Category Pie Chart */}
                                        {chartData.expenseCategoryData.length > 0 && (
                                            <Card>
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-lg font-medium">Expenses by Category</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="h-80">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <PieChart>
                                                                <Pie
                                                                    data={chartData.expenseCategoryData}
                                                                    cx="50%"
                                                                    cy="50%"
                                                                    labelLine={false}
                                                                    label={({ name, percent }) =>
                                                                        percent > 0.05 ? `${name.substring(0, 15)}${name.length > 15 ? '...' : ''}: ${(percent * 100).toFixed(0)}%` : ''
                                                                    }
                                                                    outerRadius={100}
                                                                    fill="#8884d8"
                                                                    dataKey="value"
                                                                >
                                                                    {chartData.expenseCategoryData.map((_, index) => (
                                                                        <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                                                                    ))}
                                                                </Pie>
                                                                <Tooltip formatter={(value: number) => formatCurrency(value, displayCurrency)} />
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {/* Income by Category Pie Chart */}
                                        {chartData.incomeCategoryData.length > 0 && (
                                            <Card>
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-lg font-medium">Income by Category</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="h-80">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <PieChart>
                                                                <Pie
                                                                    data={chartData.incomeCategoryData}
                                                                    cx="50%"
                                                                    cy="50%"
                                                                    labelLine={false}
                                                                    label={({ name, percent }) =>
                                                                        percent > 0.05 ? `${name.substring(0, 15)}${name.length > 15 ? '...' : ''}: ${(percent * 100).toFixed(0)}%` : ''
                                                                    }
                                                                    outerRadius={100}
                                                                    fill="#8884d8"
                                                                    dataKey="value"
                                                                >
                                                                    {chartData.incomeCategoryData.map((_, index) => (
                                                                        <Cell key={`cell-${index}`} fill={INCOME_COLORS[index % INCOME_COLORS.length]} />
                                                                    ))}
                                                                </Pie>
                                                                <Tooltip formatter={(value: number) => formatCurrency(value, displayCurrency)} />
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </Card>
            </div>

            {mergePair && (
                <MergePostingsModal
                    open={true}
                    rows={mergePair}
                    onClose={() => setMergePair(null)}
                    onMerged={(primary, duplicate) => {
                        masterRef.current?.updateRowsInList([primary as MergeRow]);
                        masterRef.current?.removeRowsFromList([duplicate.id]);
                    }}
                />
            )}
        </div>
    );
}
