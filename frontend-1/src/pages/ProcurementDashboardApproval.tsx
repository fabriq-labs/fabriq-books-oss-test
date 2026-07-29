import React, { useState, useEffect } from 'react';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Clock, CheckCircle, TrendingUp, Package, DollarSign, AlertTriangle, ShoppingCart, Receipt, Plus, FileText, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/contexts/ChatContext';
import { ChatShell } from '@/components/chat/ChatShell';
import { workflowAPI } from '@/api/api';
import { buildNewBillCreatePayload } from '@/lib/bills/createBillDefaults';
import { useEntity } from '@/contexts/EntityContext';
// Mock data for procurement spend by category
const procurementSpendData = [
    { category: 'IT Equipment', spend: 125000, color: 'hsl(210 100% 56%)' },
    { category: 'Office Supplies', spend: 45000, color: 'hsl(142 76% 36%)' },
    { category: 'Facilities', spend: 78000, color: 'hsl(259 94% 51%)' },
    { category: 'Marketing', spend: 32000, color: 'hsl(24 95% 53%)' },
    { category: 'Travel', spend: 56000, color: 'hsl(200 98% 39%)' },
    { category: 'Professional Services', spend: 89000, color: 'hsl(215 28% 51%)' }
];

// Mock data for preferred suppliers compliance
const preferredSuppliersData = [
    { name: 'Preferred Suppliers', value: 78, color: 'hsl(210 100% 56%)' },
    { name: 'Non-Preferred', value: 22, color: 'hsl(215 28% 51%)' }
];

// Mock data for maverick spend
const maverickSpendData = [
    { department: 'IT', approved: 85, maverick: 15 },
    { department: 'HR', approved: 92, maverick: 8 },
    { department: 'Finance', approved: 95, maverick: 5 },
    { department: 'Marketing', approved: 78, maverick: 22 },
    { department: 'Operations', approved: 88, maverick: 12 }
];

// Mock data for PR-to-PO cycle time
const cycleTimeData = [
    { month: 'Jan', avgDays: 4.2 },
    { month: 'Feb', avgDays: 3.8 },
    { month: 'Mar', avgDays: 4.5 },
    { month: 'Apr', avgDays: 3.9 },
    { month: 'May', avgDays: 4.1 },
    { month: 'Jun', avgDays: 3.6 }
];

const chartConfig = {
    spend: {
        label: "Spend Amount",
        color: "hsl(210 100% 56%)",
    },
    approved: {
        label: "Approved",
        color: "hsl(210 100% 56%)",
    },
    maverick: {
        label: "Maverick",
        color: "hsl(24 95% 53%)",
    },
};

const ProcurementApproverDashboard = () => {
    const [timeRange, setTimeRange] = useState('6months');
    const { isChatOpen } = useChat();
    const navigate = useNavigate();
    const { currentEntityId } = useEntity();
    const [details, setDetails] = useState<any>({});
    const [detailsForPurchaseOrder, setDetailsForPurchaseOrder] = useState<any>({});
    const [detailsForInvoice, setDetailsForInvoice] = useState<any>({});
    const [isLoading, setIsLoading] = useState(true);
    // Calculate total spend
    const calculateTotals = () => {
        const { createdByList = [], assignedToList = [], roleBasedList = [] } = details;
        // Get unique IDs from each list to avoid counting duplicates
        const createdByIds = new Set(createdByList.map((item: any) => item.id));
        const assignedToIds = new Set(assignedToList.map((item: any) => item.id));
        const roleBasedIds = new Set(roleBasedList.map((item: any) => item.id));
        // Count unique items in createdByList as "Pending Approval"
        const pendingApproval = createdByIds.size;
        // Count unique items in assignedToList and roleBasedList as "In Progress"
        // Combine the sets to get unique IDs across both lists
        const inProgressIds = new Set([...assignedToIds, ...roleBasedIds]);
        const inProgress = inProgressIds.size;
        // Total unique open requests across all lists
        const allUniqueIds = new Set([...createdByIds, ...assignedToIds, ...roleBasedIds]);
        const totalOpenRequests = allUniqueIds.size;
        return {
            totalOpenRequests,
            pendingApproval,
            inProgress
        };
    };
    const calculateTotalsForPurchaseOrder = () => {
        const { createdByList = [], assignedToList = [], roleBasedList = [] } = detailsForPurchaseOrder;
        // Get unique IDs from each list to avoid counting duplicates
        const createdByIds = new Set(createdByList.map((item: any) => item.id));
        const assignedToIds = new Set(assignedToList.map((item: any) => item.id));
        const roleBasedIds = new Set(roleBasedList.map((item: any) => item.id));
        // Count unique items in createdByList as "Pending Approval"
        const pendingApproval = createdByIds.size;
        // Count unique items in assignedToList and roleBasedList as "In Progress"
        // Combine the sets to get unique IDs across both lists
        const inProgressIds = new Set([...assignedToIds, ...roleBasedIds]);
        const inProgress = inProgressIds.size;
        // Total unique open orders across all lists
        const allUniqueIds = new Set([...createdByIds, ...assignedToIds, ...roleBasedIds]);
        const totalOpenOrders = allUniqueIds.size;
        return {
            totalOpenOrders,
            pendingApproval,
            inProgress
        };
    };
    const calculateTotalsForInvoice = () => {
        const { createdByList = [], assignedToList = [], roleBasedList = [] } = detailsForInvoice;
        // Get unique IDs from each list to avoid counting duplicates
        const createdByIds = new Set(createdByList.map((item: any) => item.id));
        const assignedToIds = new Set(assignedToList.map((item: any) => item.id));
        const roleBasedIds = new Set(roleBasedList.map((item: any) => item.id));
        // Count unique items in createdByList as "Pending Approval"
        const pendingApproval = createdByIds.size;
        // Count unique items in assignedToList and roleBasedList as "In Progress"
        // Combine the sets to get unique IDs across both lists
        const inProgressIds = new Set([...assignedToIds, ...roleBasedIds]);
        const inProgress = inProgressIds.size;
        // Total unique open invoices across all lists
        const allUniqueIds = new Set([...createdByIds, ...assignedToIds, ...roleBasedIds]);
        const totalOpenInvoices = allUniqueIds.size;
        return {
            totalOpenInvoices,
            pendingApproval,
            inProgress
        };
    };

    const getListForPurchaseRequisition = () => {
        setIsLoading(true);
        workflowAPI.getAll('purchase_requisition')
            .then((res: any) => {
                setDetails(res);
                setIsLoading(false);
            }).catch((err) => {
                console.log(err);
                setIsLoading(false);
            });
    }

    const getListForPurchaseOrder = () => {
        setIsLoading(true);
        workflowAPI.getAll('purchase_order')
            .then((res: any) => {
                setDetailsForPurchaseOrder(res);
                setIsLoading(false);
            });
    }

    const getListForInvoice = () => {
        setIsLoading(true);
        workflowAPI.getAll('invoice')
            .then((res: any) => {
                setDetailsForInvoice(res);
                setIsLoading(false);
            });
    }

    useEffect(() => {
        getListForPurchaseRequisition();
        getListForPurchaseOrder();
        getListForInvoice();
    }, []);

    const handleRequisitionCreate = () => {
        workflowAPI.create("purchase_requisition", '2', {
            status: '2',
        })
            .then((res: any) => {
                navigate(`/purchases/requisitions/${res?.data?.id}/state/2`);
            }).catch((err) => {
                console.error("Error:", err.message);
            });
    };

    const handleOrderCreate = () => {
        workflowAPI.create("purchase_order", '13', {
            status: '13',
        })
            .then((res: any) => {
                navigate(`/purchases/orders/${res?.data?.id}/state/13`)
            }).catch((err) => {
                const { response } = err;
                console.log("Error :", err.message);
            });
    };

    const handleInvoiceCreate = () => {
        void buildNewBillCreatePayload({}, { preferredLegalEntityId: currentEntityId })
            .then((payload) => workflowAPI.create('invoice', '9', payload))
            .then((res: any) => {
                navigate(`/purchases/bills/${res?.data?.id}/state/9`);
            })
            .catch((err) => {
                console.log('Error :', err.message);
            });
    };

    const totals = calculateTotals();
    const totalsForPurchaseOrder = calculateTotalsForPurchaseOrder();
    const totalsForInvoice = calculateTotalsForInvoice();
    const totalSpend = procurementSpendData.reduce((sum, item) => sum + item.spend, 0);

    if (isChatOpen) {
        return <ChatShell className="h-full" fullPage />;
    }
    return (

        <div className="space-y-6">
            {/* Raise or Review Requests Section */}
            <div className="mb-6">
                <h2 className="text-xl font-semibold mb-4">Raise or Review Requests</h2>

                {/* Quick Actions Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Create New Request Card */}

                    <Card className="bg-gradient-to-br from-blue-50/50 to-blue-100/30 border-blue-200/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                        onClick={handleRequisitionCreate}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-blue-900">Create New Request</CardTitle>
                            <Plus className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-800">Request</div>
                            <p className="text-xs text-blue-600">
                                Start a new purchase request
                            </p>
                        </CardContent>
                    </Card>


                    {/* Create New Order Card */}

                    <Card className="bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 border-emerald-200/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                        onClick={handleOrderCreate}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-emerald-900">Create New Order</CardTitle>
                            <Plus className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-emerald-800">Order</div>
                            <p className="text-xs text-emerald-600">
                                Create a purchase order
                            </p>
                        </CardContent>
                    </Card>


                    {/* Create Invoice Card */}

                    <Card className="bg-gradient-to-br from-orange-50/50 to-orange-100/30 border-orange-200/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                        onClick={handleInvoiceCreate}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-orange-900">Create Invoice</CardTitle>
                            <Plus className="h-4 w-4 text-orange-600 group-hover:scale-110 transition-transform" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-orange-800">Invoice</div>
                            <p className="text-xs text-orange-600">
                                Generate new invoice
                            </p>
                        </CardContent>
                    </Card>

                </div>
            </div>

            {/* Open Requests Section */}
            <div className="mt-12">
                {/* Quick Access Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    <Card className="bg-gradient-to-br from-purple-50/50 to-purple-100/30 border-purple-200/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                        onClick={() => navigate("/purchases/requisitions")}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-purple-900 flex items-center gap-2">
                                Open Requests
                                <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </CardTitle>
                            <ShoppingCart className="h-4 w-4 text-purple-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-purple-800">{totals?.totalOpenRequests}</div>
                            <p className="text-xs text-purple-600">
                                {totals?.pendingApproval} Pending Approval, {totals?.inProgress} In Progress
                            </p>
                        </CardContent>
                    </Card>


                    <Card className="bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 border-emerald-200/50"
                        onClick={() => navigate("/purchases/orders")}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-emerald-900 flex items-center gap-2">
                                Open Orders
                                <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </CardTitle>
                            <Package className="h-4 w-4 text-emerald-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-emerald-800">{totalsForPurchaseOrder?.totalOpenOrders}</div>
                            <p className="text-xs text-emerald-600">
                                {totalsForPurchaseOrder?.pendingApproval} Pending Approval, {totalsForPurchaseOrder?.inProgress} In Progress
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-50/50 to-blue-100/30 border-blue-200/50"
                        onClick={() => navigate("/purchases/bills")}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-2">
                                Open Invoices
                                <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </CardTitle>
                            <Receipt className="h-4 w-4 text-blue-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-800">{totalsForInvoice?.totalOpenInvoices}</div>
                            <p className="text-xs text-blue-600">
                                {totalsForInvoice?.pendingApproval} Pending Approval, {totalsForInvoice?.inProgress} In Progress
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Separator Line */}
            <hr className="border-t border-gray-200 my-8" />

            {/* Performance Overview Section */}
            <div className="mb-6">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h2 className="text-2xl font-bold">Procurement Performance Overview</h2>
                        <p className="text-muted-foreground">Policy compliance, supplier performance, and procurement efficiency metrics</p>
                    </div>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select time range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="6months">Last 6 Months</SelectItem>
                            <SelectItem value="year">This Year</SelectItem>
                            <SelectItem value="quarter">This Quarter</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Performance Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-gradient-to-br from-slate-50/50 to-slate-100/30 border-slate-200/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-900">Total Procurement Spend</CardTitle>
                        <DollarSign className="h-4 w-4 text-slate-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-800">${totalSpend.toLocaleString()}</div>
                        <p className="text-xs text-slate-600">
                            <span className="text-green-600">+12%</span> from last period
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50/50 to-green-100/30 border-green-200/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-green-900">PO Confirmation Rate</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-800">94.2%</div>
                        <Progress value={94.2} className="mt-2" />
                        <p className="text-xs text-green-600 mt-1">
                            <span className="text-green-700">+2.1%</span> improvement
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-orange-50/50 to-orange-100/30 border-orange-200/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-orange-900">Supplier On-Time Delivery</CardTitle>
                        <Package className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-800">89.7%</div>
                        <Progress value={89.7} className="mt-2" />
                        <p className="text-xs text-orange-600 mt-1">
                            <span className="text-orange-700">-1.3%</span> vs target
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50/50 to-amber-100/30 border-amber-200/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-amber-900">Avg PR-to-PO Cycle Time</CardTitle>
                        <Clock className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-800">3.8 days</div>
                        <p className="text-xs text-amber-600">
                            <span className="text-green-600">-0.4 days</span> improvement
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Total Procurement Spend by Category */}
                <Card>
                    <CardHeader>
                        <CardTitle>Procurement Spend by Category</CardTitle>
                        <CardDescription>Breakdown of total spend across categories</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig}>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={procurementSpendData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={120}
                                        dataKey="spend"
                                        nameKey="category"
                                    >
                                        {procurementSpendData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-background border rounded-lg p-2 shadow-lg">
                                                        <p className="font-medium">{data.category}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            ${data.spend.toLocaleString()}
                                                        </p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            {procurementSpendData.map((item, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-xs">{item.category}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Preferred Suppliers Compliance */}
                <Card>
                    <CardHeader>
                        <CardTitle>Preferred Suppliers Compliance</CardTitle>
                        <CardDescription>% of spend with preferred suppliers</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center mb-4">
                            <div className="relative">
                                <svg className="w-32 h-32 transform -rotate-90">
                                    <circle
                                        cx="64"
                                        cy="64"
                                        r="56"
                                        stroke="currentColor"
                                        strokeWidth="8"
                                        fill="transparent"
                                        className="text-muted"
                                    />
                                    <circle
                                        cx="64"
                                        cy="64"
                                        r="56"
                                        stroke="hsl(210 100% 56%)"
                                        strokeWidth="8"
                                        fill="transparent"
                                        strokeDasharray={`${78 * 3.51} 351.86`}
                                        className="transition-all duration-300"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-2xl font-bold">78%</span>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-sm">Preferred Suppliers</span>
                                <span className="text-sm font-medium">78%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm">Non-Preferred</span>
                                <span className="text-sm font-medium">22%</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Maverick Spend by Department */}
                <Card>
                    <CardHeader>
                        <CardTitle>Maverick Spend by Department</CardTitle>
                        <CardDescription>Approved vs unapproved/outside-contract purchases</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig}>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={maverickSpendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="department" />
                                    <YAxis />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-background border rounded-lg p-3 shadow-lg">
                                                        <p className="font-medium">{label}</p>
                                                        {payload.map((pld, index) => (
                                                            <div key={index} className="flex justify-between gap-2">
                                                                <span style={{ color: pld.color }}>{pld.dataKey}: </span>
                                                                <span>{pld.value}%</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="approved" stackId="a" fill="hsl(210 100% 56%)" />
                                    <Bar dataKey="maverick" stackId="a" fill="hsl(24 95% 53%)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* PR-to-PO Cycle Time Trend */}
                <Card>
                    <CardHeader>
                        <CardTitle>PR-to-PO Cycle Time Trend</CardTitle>
                        <CardDescription>Average days from requisition to purchase order</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig}>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={cycleTimeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-background border rounded-lg p-3 shadow-lg">
                                                        <p className="font-medium">{label}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            Avg Cycle Time: {payload[0].value} days
                                                        </p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="avgDays"
                                        stroke="hsl(210 100% 56%)"
                                        strokeWidth={2}
                                        dot={{ fill: 'hsl(210 100% 56%)' }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Summary Insights */}
            <Card>
                <CardHeader>
                    <CardTitle>Key Insights & Recommendations</CardTitle>
                    <CardDescription>Performance summary and actionable insights</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                            <div>
                                <h4 className="font-medium text-green-900">Strong Compliance</h4>
                                <p className="text-sm text-green-700">78% spend with preferred suppliers exceeds 70% target</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                            <div>
                                <h4 className="font-medium text-orange-900">Maverick Spend Alert</h4>
                                <p className="text-sm text-orange-700">Marketing dept has 22% maverick spend - needs attention</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                            <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
                            <div>
                                <h4 className="font-medium text-blue-900">Cycle Time Improvement</h4>
                                <p className="text-sm text-blue-700">PR-to-PO time reduced by 0.4 days this period</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>

    );
};

export default ProcurementApproverDashboard;