import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { useReportController } from "@/contexts/ReportControllerContext";
import { ReportControls } from "@/components/Reports/ReportControls";
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
import { TrendingUp, TrendingDown, DollarSign, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useChat as useChatContext } from "@/contexts/ChatContext";
import { getModelDisplayName, getViewName } from "@/utils/modelDisplayNames";
import { useLocation } from "react-router-dom";

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

interface LegalEntity {
    id: string;
    organization_name?: string;
    legal_name?: string;
    basecurrency_id?: string | null;
    currency_master?: { base_currency?: string } | null;
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

export default function SimpleTransactionList() {
    const { user } = useAuth();
    const { dateRange } = useReportController();
    const location = useLocation();
    const { setPageContext } = useChatContext();

    const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);
    const [selectedLegalEntity, setSelectedLegalEntity] = useState<LegalEntity | null>(null);
    const [legalEntitiesLoading, setLegalEntitiesLoading] = useState(true);
    const [account, setAccount] = useState<any>(null);
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

    // Load legal entities and default to HQ on mount
    useEffect(() => {
        if (!user?.org_id) {
            setLegalEntitiesLoading(false);
            return;
        }
        const loadLegalEntities = async () => {
            setLegalEntitiesLoading(true);
            try {
                const [allRes, hqRes] = await Promise.all([
                    viewAPI.search(
                        "entity",
                        "entity_view",
                        1,
                        500,
                        undefined,
                        { org_id: { eq: user.org_id } }
                    ),
                    viewAPI.search(
                        "entity",
                        "entity_view",
                        1,
                        10,
                        undefined,
                        { org_id: { eq: user.org_id }, is_it_headquartres: { eq: "Yes" } }
                    ),
                ]);
                const list: LegalEntity[] = allRes?.data || [];
                setLegalEntities(list);
                const hq = hqRes?.data?.[0];
                setSelectedLegalEntity(hq || list[0] || null);
            } catch (e) {
                console.error("Error loading legal entities:", e);
            } finally {
                setLegalEntitiesLoading(false);
            }
        };
        loadLegalEntities();
    }, [user?.org_id]);

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
        ...(account && {
            OR: [
                { account_id: { eq: account.id } },
                { credit_account_id: { eq: account.id } },
            ],
        }),
        "AND": [
            {
                "value_date": {
                    "gte": dateRange[0].startOf('day').toISOString()
                }
            },
            {
                "value_date": {
                    "lte": dateRange[1].startOf('day').add(1, 'day').subtract(1, 'millisecond').toISOString()
                }
            }
        ]
    }), [account, dateRange]);

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

    const handleLegalEntitySelect = (entity: LegalEntity) => {
        setSelectedLegalEntity(entity);
        setAccount(null);
        setPage(1);
    };

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
        const code = selectedLegalEntity?.currency_master?.base_currency;
        if (code) return code;
        return transactions[0]?.currency || "INR";
    }, [selectedLegalEntity, transactions]);

    const accountAdditionalFilters = useMemo(
        () =>
            selectedLegalEntity?.id
                ? { legal_entity_id: { eq: selectedLegalEntity.id } }
                : undefined,
        [selectedLegalEntity?.id]
    );

    const accountFilterOptions = useCallback((items: any[]) => {
        return items.filter((item: any) => isBankOrCreditCard(item));
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="w-full p-4">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight">Simple Transactions</h1>
                    <p className="text-muted-foreground">
                        A simplified view of your transactions showing Account and Category instead of Debit/Credit.
                    </p>
                </div>

                <Card className="p-4">
                    <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                        {/* Legal entity: subtle clickable name + popover to switch */}
                        <div className="flex items-center gap-1">
                            {legalEntitiesLoading ? (
                                <span className="text-muted-foreground text-sm">Loading...</span>
                            ) : selectedLegalEntity ? (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className={cn(
                                                "flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                            )}
                                        >
                                            <span>
                                                {selectedLegalEntity.organization_name ||
                                                    selectedLegalEntity.legal_name ||
                                                    "Legal entity"}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-70" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-2" align="start">
                                        <div className="grid gap-0.5">
                                            {legalEntities.map((entity) => (
                                                <button
                                                    key={entity.id}
                                                    type="button"
                                                    onClick={() => handleLegalEntitySelect(entity)}
                                                    className={cn(
                                                        "px-3 py-2 text-left text-sm rounded-md hover:bg-accent",
                                                        entity.id === selectedLegalEntity?.id &&
                                                        "bg-accent font-medium"
                                                    )}
                                                >
                                                    {entity.organization_name ||
                                                        entity.legal_name ||
                                                        entity.id}
                                                </button>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            ) : (
                                <span className="text-sm text-muted-foreground">No legal entity</span>
                            )}
                        </div>
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
                            ) : isLoading ? (
                                <div className="flex justify-center items-center h-64">
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No transactions found for the selected period.
                                </div>
                            ) : (
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[120px]">Date</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Account</TableHead>
                                                <TableHead>Category</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {transactions.map((transaction) => (
                                                <TableRow
                                                    key={transaction.id}
                                                    className={selectedTransactionId === transaction.id ? 'bg-muted/60' : 'cursor-pointer hover:bg-muted/40'}
                                                    onClick={() => setSelectedTransactionId((prev) => (prev === transaction.id ? null : transaction.id))}
                                                >
                                                    <TableCell>
                                                        {transaction.value_date
                                                            ? formatDate(typeof transaction.value_date === 'string'
                                                                ? transaction.value_date
                                                                : new Date(transaction.value_date).toISOString())
                                                            : 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="max-w-md">
                                                        {transaction.description || 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="font-medium">
                                                        {transaction.account_name || 'N/A'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {transaction.category_name || 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span
                                                            className={`font-medium ${transaction.isMoneyIn
                                                                ? 'text-green-700'
                                                                : 'text-red-700'
                                                                }`}
                                                        >
                                                            {transaction.isMoneyIn ? '+' : '-'}
                                                            {formatCurrency(Math.abs(transaction.amount), displayCurrency)}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {total > pageSize && (
                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Previous
                                    </button>
                                    <span className="px-4 py-2">
                                        Page {page} of {Math.ceil(total / pageSize)}
                                    </span>
                                    <button
                                        onClick={() => setPage((p) => p + 1)}
                                        disabled={page >= Math.ceil(total / pageSize)}
                                        className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next
                                    </button>
                                </div>
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
        </div>
    );
}
