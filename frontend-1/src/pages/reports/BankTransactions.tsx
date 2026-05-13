import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useEntity } from "@/contexts/EntityContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { ReportControls } from "@/components/Reports/ReportControls";
import { FinancialYearSelector, getPreviousFYOption, type FinancialYearOption, type FinancialYearType } from "@/components/Reports/FinancialYearSelector";
import { viewAPI, reportAPI, bulkEditAPI } from "@/api/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DynamicTable from "@/components/masters/DynamicTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { createBankTransactionRowRenderer } from "@/components/masters/posting/BankTransactionRow";
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
import { GitMerge, TrendingUp, TrendingDown, DollarSign, Edit, Trash2 } from "lucide-react";
import { useChat as useChatContext } from "@/contexts/ChatContext";
import { getModelDisplayName, getViewName } from "@/utils/modelDisplayNames";
import { BulkAction } from "@/types/bulkActions";
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

/** Exclude DUPLICATE / OPENING_BALANCE; allow null posting_type (plain NOT IN drops NULL in SQL). */
const postingTypeExcludeClause = {
    OR: [
        { posting_type: null },
        { posting_type: { nin: ["DUPLICATE", "OPENING_BALANCE"] } },
    ],
};

// Chart colors
const EXPENSE_COLORS = ['#E74A3B', '#F6C23E', '#36B9CC', '#4E73DF', '#858796', '#1CC88A', '#6f42c1', '#fd7e14'];
const INCOME_COLORS = ['#1CC88A', '#36B9CC', '#4E73DF', '#F6C23E', '#858796', '#6f42c1'];

/** Single search page size for full FY register + insights aggregates. */
const BANK_TX_FULL_PAGE = 25_000;

function comparePostingLedgerAsc(a: any, b: any): number {
    const ta = dayjs(a.value_date ?? a.posting_date).valueOf();
    const tb = dayjs(b.value_date ?? b.posting_date).valueOf();
    if (ta !== tb) return ta - tb;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

function ledgerOpeningNumeric(opening: number | null): number {
    if (opening == null || Number.isNaN(opening)) return 0;
    return opening;
}

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
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setPageContext } = useChatContext();
    const ledgerTableRef = useRef<any>(null);
    const rawLedgerRef = useRef<any[]>([]);

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
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
    const [openingBalance, setOpeningBalance] = useState<number | null>(null);
    const [openingLoading, setOpeningLoading] = useState(false);

    const [ledgerList, setLedgerList] = useState<{ data?: any[]; metaData?: any; total?: number }>({});
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [selectedLedgerRows, setSelectedLedgerRows] = useState<any[]>([]);
    const [ledgerSearchInput, setLedgerSearchInput] = useState("");
    const [ledgerSearchTerm, setLedgerSearchTerm] = useState<string | undefined>(undefined);

    const masterDefaultFilters = useMemo(() => {
        const base: Record<string, any> = {
            ...(currentEntityId ? { legal_entity_id: currentEntityId } : {}),
        };
        if (account) {
            base.OR = [
                { account_id: { eq: account.id } },
                { credit_account_id: { eq: account.id } },
            ];
        }
        base.AND = [
            postingTypeExcludeClause,
            { value_date: { gte: fyDateRange[0].startOf("day").toISOString() } },
            { value_date: { lte: fyDateRange[1].endOf("day").toISOString() } },
        ];
        return base;
    }, [account, fyDateRange, currentEntityId]);

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
        ...(account && {
            OR: [
                { account_id: { eq: account.id } },
                { credit_account_id: { eq: account.id } },
            ],
        }),
        AND: [
            postingTypeExcludeClause,
            { value_date: { gte: fyDateRange[0].startOf("day").toISOString() } },
            { value_date: { lte: fyDateRange[1].endOf("day").toISOString() } },
        ],
    }), [account, fyDateRange]);

    const displayCurrency = useMemo(() => {
        if (account?.currency?.code) return account.currency.code;
        return transactions[0]?.currency || "INR";
    }, [account, transactions]);

    const fetchOpeningBalance = useCallback(async () => {
        if (!account?.id || !currentEntityId) {
            setOpeningBalance(null);
            setOpeningLoading(false);
            return;
        }
        setOpeningLoading(true);
        try {
            const filters: Record<string, string | string[]> = {
                from_date: dayjs(selectedFY.from_date).format("YYYY-MM-DD"),
                to_date: dayjs(selectedFY.to_date).format("YYYY-MM-DD"),
                account_id: account.id,
                legal_entity_ids: [currentEntityId],
            };
            if (account.currency?.id) {
                filters.currency_id = String(account.currency.id);
            }
            const result = (await reportAPI.getReport("trial_balance", filters)) as {
                data?: { account_id?: string; opening_balance?: unknown }[];
            };
            const rows = Array.isArray(result?.data) ? result.data : [];
            const row = rows.find((r) => r.account_id === account.id);
            const ob = row != null ? Number(row.opening_balance ?? 0) : 0;
            setOpeningBalance(Number.isFinite(ob) ? ob : null);
        } catch {
            setOpeningBalance(null);
        } finally {
            setOpeningLoading(false);
        }
    }, [account, selectedFY.from_date, selectedFY.to_date, currentEntityId]);

    useEffect(() => {
        if (!account?.id) {
            setOpeningBalance(null);
            return;
        }
        void fetchOpeningBalance();
    }, [account?.id, selectedFY.from_date, selectedFY.to_date, currentEntityId, fetchOpeningBalance]);

    const applyRunningBalance = useCallback(
        (rows: any[]) => {
            if (!account?.id) return rows;
            const open = ledgerOpeningNumeric(openingBalance);
            const sorted = [...rows].sort(comparePostingLedgerAsc);
            let running = open;
            return sorted.map((r) => {
                const amt = Number(r.amount) || 0;
                const isDebit = r.account_id === account.id;
                running += isDebit ? amt : -amt;
                return { ...r, _runningBalance: running };
            });
        },
        [account?.id, openingBalance],
    );

    const fetchLedger = useCallback(async () => {
        if (!account?.id) {
            rawLedgerRef.current = [];
            setLedgerList({});
            return;
        }
        setLedgerLoading(true);
        try {
            const sortOption = { value_date: "asc" as const };
            const res: any = await viewAPI.search(
                "posting",
                "posting_simple_view",
                1,
                BANK_TX_FULL_PAGE,
                ledgerSearchTerm,
                masterDefaultFilters,
                sortOption,
            );
            const raw = Array.isArray(res?.data) ? res.data : [];
            rawLedgerRef.current = raw;
            const data = applyRunningBalance(raw);
            setLedgerList({ ...res, data });
        } catch (e) {
            console.error("Error loading bank ledger:", e);
            rawLedgerRef.current = [];
            setLedgerList({});
        } finally {
            setLedgerLoading(false);
        }
    }, [account?.id, ledgerSearchTerm, masterDefaultFilters, applyRunningBalance]);

    useEffect(() => {
        if (!account?.id) {
            rawLedgerRef.current = [];
            setLedgerList({});
            return;
        }
        void fetchLedger();
    }, [account?.id, fetchLedger]);

    useEffect(() => {
        if (rawLedgerRef.current.length === 0) return;
        setLedgerList((prev) => ({
            ...prev,
            data: applyRunningBalance([...rawLedgerRef.current]),
        }));
    }, [openingBalance, applyRunningBalance]);

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
            return;
        }
        setIsLoading(true);
        try {
            const sortOption = { value_date: 'desc' as const };
            const response = await viewAPI.search(
                'posting',
                'posting_simple_view',
                1,
                BANK_TX_FULL_PAGE,
                undefined,
                filter,
                sortOption
            );

            if (response?.data) {
                const transformed = transformPostingData(response.data, account.id);
                setTransactions(transformed);
            }
        } catch (error) {
            console.error("Error fetching transactions:", error);
        } finally {
            setIsLoading(false);
        }
    }, [account, filter]);

    useEffect(() => {
        if (account) {
            fetchTransactions();
        } else {
            setTransactions([]);
        }
    }, [account, fetchTransactions]);

    const handleAccountChange = (value: any) => {
        setAccount(value);
    };

    const handleAccountClear = () => {
        setAccount(null);
    };

    const handleRefresh = useCallback(() => {
        void fetchOpeningBalance();
        fetchTransactions();
        void fetchLedger();
    }, [fetchOpeningBalance, fetchTransactions, fetchLedger]);

    const simpleRowRenderer = useMemo(
        () => createBankTransactionRowRenderer(account?.id, displayCurrency),
        [account?.id, displayCurrency]
    );

    const handleLedgerDelete = useCallback(
        (id: string) => {
            Modal.confirm({
                title: "Are you sure you want to delete this item?",
                content: "This action cannot be undone.",
                okText: "Yes, Delete",
                okType: "danger",
                cancelText: "Cancel",
                onOk: async () => {
                    try {
                        await viewAPI.delete("posting", id, "posting_simple_view");
                        toast({ title: "Success", description: "Item deleted successfully" });
                        setSelectedLedgerRows([]);
                        ledgerTableRef.current?.clearSelection?.();
                        await fetchLedger();
                        fetchTransactions();
                        void fetchOpeningBalance();
                    } catch {
                        toast({
                            title: "Error",
                            description: "Failed to delete item",
                            variant: "destructive",
                        });
                    }
                },
            });
        },
        [fetchLedger, fetchTransactions, fetchOpeningBalance, toast],
    );

    const handleLedgerBulkDelete = useCallback(
        (ids: string[]) => {
            if (!ids?.length) return;
            Modal.confirm({
                title: "Are you sure you want to delete the selected items?",
                content: `This will delete ${ids.length} items.`,
                okText: "Yes, Delete",
                okType: "danger",
                cancelText: "Cancel",
                onOk: async () => {
                    try {
                        await bulkEditAPI.bulkDelete("posting", "posting_simple_view", ids);
                        toast({
                            title: "Success",
                            description: `${ids.length} items deleted successfully`,
                        });
                        setSelectedLedgerRows([]);
                        ledgerTableRef.current?.clearSelection?.();
                        await fetchLedger();
                        fetchTransactions();
                        void fetchOpeningBalance();
                    } catch {
                        toast({
                            title: "Bulk delete",
                            description: "Failed to delete items",
                            variant: "destructive",
                        });
                    }
                },
            });
        },
        [fetchLedger, fetchTransactions, fetchOpeningBalance, toast],
    );

    const renderLedgerActions = useCallback(
        (record: any) => (
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/posting/${record.id}/view/posting_simple_view`)}
                >
                    <Edit size={16} />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => handleLedgerDelete(record.id)}
                >
                    <Trash2 size={16} />
                </Button>
            </div>
        ),
        [navigate, handleLedgerDelete],
    );

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
                            loading={isLoading || ledgerLoading}
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
                                <>
                                    <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                        <span className="font-medium text-foreground">Opening balance</span>
                                        <span className="text-muted-foreground">
                                            at {dayjs(selectedFY.from_date).format("DD MMM YYYY")}
                                        </span>
                                        <span className="font-mono font-medium">
                                            {openingLoading
                                                ? "…"
                                                : formatCurrency(Number(openingBalance ?? 0), displayCurrency)}
                                        </span>
                                        <span className="text-xs text-muted-foreground">(trial balance)</span>
                                    </div>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                        Transactions are sorted oldest first with a running balance. Up to{" "}
                                        {BANK_TX_FULL_PAGE.toLocaleString()} rows for this financial year.
                                    </p>
                                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex max-w-md flex-1 items-center gap-2">
                                            <Input
                                                placeholder="Search…"
                                                value={ledgerSearchInput}
                                                onChange={(e) => setLedgerSearchInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        setLedgerSearchTerm(ledgerSearchInput.trim() || undefined);
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={() =>
                                                    setLedgerSearchTerm(ledgerSearchInput.trim() || undefined)
                                                }
                                            >
                                                Search
                                            </Button>
                                        </div>
                                    </div>
                                    {!ledgerLoading && selectedLedgerRows.length > 1 && (
                                        <div className="mb-4 flex items-center justify-between rounded-md bg-[#F1F0FB] p-3">
                                            <div className="flex items-center gap-3">
                                                {bulkActions.map((action) => {
                                                    if (action.isVisible && !action.isVisible(selectedLedgerRows)) {
                                                        return null;
                                                    }
                                                    return (
                                                        <Button
                                                            key={action.id}
                                                            variant={action.variant || "outline"}
                                                            size="sm"
                                                            className="flex items-center gap-1 text-[#9b87f5] border-[#9b87f5] hover:bg-[#E5DEFF]"
                                                            onClick={() => void action.onClick(selectedLedgerRows)}
                                                        >
                                                            {action.icon}
                                                            <span>{action.label}</span>
                                                        </Button>
                                                    );
                                                })}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex items-center gap-1 border-red-300 text-red-500 hover:bg-red-50 hover:text-red-600"
                                                    onClick={() =>
                                                        handleLedgerBulkDelete(selectedLedgerRows.map((r) => r.id))
                                                    }
                                                >
                                                    <Trash2 size={16} />
                                                    <span>Delete</span>
                                                </Button>
                                            </div>
                                            <div className="text-sm font-medium text-[#403E43]">
                                                {selectedLedgerRows.length} items selected
                                            </div>
                                        </div>
                                    )}
                                    <DynamicTable
                                        ref={ledgerTableRef}
                                        data={ledgerList}
                                        isLoading={ledgerLoading}
                                        renderActions={renderLedgerActions}
                                        enableMultiSelect
                                        onSelectionChange={setSelectedLedgerRows}
                                        customRowRenderer={simpleRowRenderer}
                                    />
                                </>
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
                    onMerged={() => {
                        setMergePair(null);
                        setSelectedLedgerRows([]);
                        ledgerTableRef.current?.clearSelection?.();
                        void fetchOpeningBalance();
                        fetchTransactions();
                        void fetchLedger();
                    }}
                />
            )}
        </div>
    );
}
