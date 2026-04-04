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
import { Clock, CheckCircle, XCircle, Package, TrendingUp, Repeat, Plus, ExternalLink, FileText, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { workflowAPI } from '@/api/api';
import { useChat } from '@/contexts/ChatContext';
import { ChatUI } from '@/components/chat/ChatUI';
// Dummy data for charts
const approvalTimeData = {
    sixMonths: [
        { month: 'Jan', avgTime: 3.2 },
        { month: 'Feb', avgTime: 2.8 },
        { month: 'Mar', avgTime: 3.5 },
        { month: 'Apr', avgTime: 2.9 },
        { month: 'May', avgTime: 3.1 },
        { month: 'Jun', avgTime: 2.6 }
    ],
    year: [
        { month: 'Jan', avgTime: 3.2 },
        { month: 'Feb', avgTime: 2.8 },
        { month: 'Mar', avgTime: 3.5 },
        { month: 'Apr', avgTime: 2.9 },
        { month: 'May', avgTime: 3.1 },
        { month: 'Jun', avgTime: 2.6 },
        { month: 'Jul', avgTime: 2.4 },
        { month: 'Aug', avgTime: 2.7 },
        { month: 'Sep', avgTime: 3.0 },
        { month: 'Oct', avgTime: 2.8 },
        { month: 'Nov', avgTime: 3.2 },
        { month: 'Dec', avgTime: 2.9 }
    ]
};

const fulfillmentData = {
    sixMonths: [
        { month: 'Jan', onTime: 85, late: 15 },
        { month: 'Feb', onTime: 92, late: 8 },
        { month: 'Mar', onTime: 78, late: 22 },
        { month: 'Apr', onTime: 89, late: 11 },
        { month: 'May', onTime: 94, late: 6 },
        { month: 'Jun', onTime: 87, late: 13 }
    ],
    year: [
        { month: 'Jan', onTime: 85, late: 15 },
        { month: 'Feb', onTime: 92, late: 8 },
        { month: 'Mar', onTime: 78, late: 22 },
        { month: 'Apr', onTime: 89, late: 11 },
        { month: 'May', onTime: 94, late: 6 },
        { month: 'Jun', onTime: 87, late: 13 },
        { month: 'Jul', onTime: 91, late: 9 },
        { month: 'Aug', onTime: 88, late: 12 },
        { month: 'Sep', onTime: 86, late: 14 },
        { month: 'Oct', onTime: 93, late: 7 },
        { month: 'Nov', onTime: 89, late: 11 },
        { month: 'Dec', onTime: 90, late: 10 }
    ]
};

const requestStatusData = [
    { name: 'Pending', value: 12, color: 'hsl(45 93% 58%)' },
    { name: 'In Progress', value: 8, color: 'hsl(221 83% 53%)' },
    { name: 'Approved', value: 25, color: 'hsl(134 42% 51%)' },
    { name: 'Rejected', value: 3, color: 'hsl(0 84% 60%)' }
];

const rejectionReasons = [
    { reason: 'Budget Exceeded', count: 5, color: 'hsl(0 84% 60%)' },
    { reason: 'Incomplete Info', count: 3, color: 'hsl(25 95% 53%)' },
    { reason: 'Approval Policy', count: 2, color: 'hsl(45 93% 58%)' },
    { reason: 'Duplicate Request', count: 1, color: 'hsl(262 83% 58%)' }
];

const frequentItems = [
    { item: 'Office Supplies - Pens', orderCount: 12, lastOrdered: '2024-01-15', prNumber: 'PR-2024-001', prTotal: 1250.00 },
    { item: 'Laptop Accessories', orderCount: 8, lastOrdered: '2024-01-12', prNumber: 'PR-2024-002', prTotal: 3450.00 },
    { item: 'Printer Paper A4', orderCount: 15, lastOrdered: '2024-01-10', prNumber: 'PR-2024-003', prTotal: 850.00 },
    { item: 'Meeting Room Supplies', orderCount: 6, lastOrdered: '2024-01-08', prNumber: 'PR-2024-004', prTotal: 2100.00 },
    { item: 'Software Licenses', orderCount: 4, lastOrdered: '2024-01-05', prNumber: 'PR-2024-005', prTotal: 5600.00 }
];

const chartConfig = {
    avgTime: {
        label: "Avg Time (days)",
        color: "hsl(221 83% 53%)",
    },
    onTime: {
        label: "On Time",
        color: "hsl(221 83% 53%)",
    },
    late: {
        label: "Late",
        color: "hsl(25 80% 75%)",
    },
};

const RequesterDashboard = () => {
    const [timeFilter, setTimeFilter] = useState<'sixMonths' | 'year'>('sixMonths');
    const { isChatOpen } = useChat();
    const currentApprovalData = approvalTimeData[timeFilter];
    const currentFulfillmentData = fulfillmentData[timeFilter];
    const [details, setDetails] = useState<any>({});
    const [detailsForPurchaseOrder, setDetailsForPurchaseOrder] = useState<any>({});
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    // Helper function to calculate totals from API response
    const calculateTotals = () => {
        const { createdByList = [], assignedToList = [], roleBasedList = [] } = details;
        // Count items in createdByList as "Pending Approval"
        const pendingApproval = createdByList.length;
        // Count items in assignedToList and roleBasedList as "In Progress"
        const inProgress = assignedToList.length + roleBasedList.length;
        // Total open requests
        const totalOpenRequests = pendingApproval + inProgress;
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
    
    useEffect(() => {
        getListForPurchaseRequisition();
        getListForPurchaseOrder();
    }, []);
    
    const handleCreate = () => {
        workflowAPI.create("purchase_requisition", '2', {
            status: '2',
        })
            .then((res: any) => {
                navigate(`/purchases/requisitions/${res?.data?.id}/state/2`);
            }).catch((err) => {
                console.error("Error:", err.message);
            });
    };

    const totals = calculateTotals();
    const totalsForPurchaseOrder = calculateTotalsForPurchaseOrder();

    if (isChatOpen) {
        return <ChatUI />;
    }

    return (

        <div className="space-y-6 pt-6">

            {/* Raise or Track Request Section */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">Raise or Track Request</h2>
                    <p className="text-muted-foreground">Create new requests or monitor existing ones</p>
                </div>

                {/* Key Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Create New Request Card */}
                    {/* <Link to="/requisition/new"> */}
                    <Card className="bg-gradient-to-br from-blue-50/50 to-blue-100/30 border-blue-200/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                        onClick={handleCreate}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-blue-900">Create Request</CardTitle>
                            <Plus className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-800">New</div>
                            <p className="text-xs text-blue-600">
                                Start a new purchase request
                            </p>
                        </CardContent>
                    </Card>
                    {/* </Link> */}

                    {/* Open Requests Card */}
                    {/* <Link to="/requisition"> */}
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
                    {/* </Link> */}

                    {/* Open Orders Card */}
                    {/* <Link to="/purchase-order"> */}
                    <Card className="bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 border-emerald-200/50 hover:shadow-lg transition-all duration-200 cursor-pointer group"
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
                    {/* </Link> */}
                </div>

                {/* Frequently Purchased Items */}
                <Card className="bg-gradient-to-br from-violet-50/50 to-violet-100/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-violet-800">
                            <Repeat className="h-5 w-5" />
                            Frequently Purchased Items
                        </CardTitle>
                        <CardDescription>Quick reorder your most common items</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-4 overflow-x-auto pb-4">
                            {frequentItems.map((item, index) => (
                                <div key={index} className="flex-shrink-0 w-64 p-4 border rounded-lg bg-white/60">
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-sm">{item.item}</h4>
                                        <div className="flex justify-between items-center">
                                            <Badge variant="outline" className="text-xs">
                                                {item.prNumber}
                                            </Badge>
                                            <span className="text-xs font-semibold text-green-600">
                                                ${item.prTotal.toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Ordered {item.orderCount} times
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Last: {item.lastOrdered}
                                        </p>
                                        <Button variant="outline" size="sm" className="w-full">
                                            Reorder
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Status Overview Section */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">Status Overview</h2>
                    <p className="text-muted-foreground">Analytics and insights for your requests and orders</p>
                </div>

                {/* Charts Row 1 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-gradient-to-br from-slate-50/50 to-slate-100/30">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-slate-800">Request-to-Approval Time</CardTitle>
                                    <CardDescription>Average time taken for approval over months</CardDescription>
                                </div>
                                <Select value={timeFilter} onValueChange={(value) => setTimeFilter(value as 'sixMonths' | 'year')}>
                                    <SelectTrigger className="w-36">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sixMonths">Last 6 Months</SelectItem>
                                        <SelectItem value="year">Last Year</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="relative overflow-hidden">
                                <ChartContainer config={chartConfig} className="h-[250px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={currentApprovalData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                                            <XAxis dataKey="month" stroke="hsl(220 13% 91%)" />
                                            <YAxis stroke="hsl(220 13% 91%)" />
                                            <ChartTooltip
                                                content={<ChartTooltipContent />}
                                                wrapperStyle={{ zIndex: 1000, position: 'relative' }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="avgTime"
                                                stroke="hsl(221 83% 53%)"
                                                strokeWidth={3}
                                                dot={{ fill: "hsl(221 83% 53%)", strokeWidth: 2, r: 4 }}
                                                activeDot={{ r: 6, fill: "hsl(221 83% 53%)" }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/30">
                        <CardHeader>
                            <CardTitle className="text-indigo-800">Request Status Distribution</CardTitle>
                            <CardDescription>Current status of all requests</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={chartConfig} className="h-[300px] relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={requestStatusData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                            label={({ name, value }) => `${name}: ${value}`}
                                        >
                                            {requestStatusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <ChartTooltip
                                            content={<ChartTooltipContent />}
                                            wrapperStyle={{ zIndex: 1000 }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts Row 2 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-gradient-to-br from-emerald-50/50 to-emerald-100/30">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-emerald-800">Order Fulfillment Rate</CardTitle>
                                    <CardDescription>On-time vs late deliveries</CardDescription>
                                </div>
                                <Select value={timeFilter} onValueChange={(value) => setTimeFilter(value as 'sixMonths' | 'year')}>
                                    <SelectTrigger className="w-36">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sixMonths">Last 6 Months</SelectItem>
                                        <SelectItem value="year">Last Year</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="relative overflow-hidden">
                                <ChartContainer config={chartConfig} className="h-[200px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={currentFulfillmentData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} barSize={30}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                                            <XAxis dataKey="month" stroke="hsl(220 13% 91%)" />
                                            <YAxis stroke="hsl(220 13% 91%)" />
                                            <ChartTooltip
                                                content={<ChartTooltipContent />}
                                                wrapperStyle={{ zIndex: 1000, position: 'relative' }}
                                            />
                                            <Bar dataKey="onTime" stackId="a" fill="hsl(221 83% 53%)" radius={[0, 0, 4, 4]}
                                                label={{ position: 'top', fill: 'hsl(221 83% 53%)', fontSize: 12 }} />
                                            <Bar dataKey="late" stackId="a" fill="hsl(19 72% 61%)" radius={[4, 4, 0, 0]}
                                                label={{ position: 'top', fill: 'hsl(19 72% 61%)', fontSize: 12 }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-rose-50/50 to-rose-100/30">
                        <CardHeader>
                            <CardTitle className="text-rose-800">Request Rejection Reasons</CardTitle>
                            <CardDescription>Most common reasons for rejection</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {rejectionReasons.map((reason, index) => (
                                    <div key={index} className="flex items-center justify-between">
                                        <span className="text-sm font-medium">{reason.reason}</span>
                                        <div className="flex items-center gap-2">
                                            <Progress
                                                value={(reason.count / 11) * 100}
                                                className="w-24"
                                                style={{ '--progress-background': reason.color } as React.CSSProperties}
                                            />
                                            <Badge variant="secondary" style={{ backgroundColor: `${reason.color}20`, color: reason.color }}>
                                                {reason.count}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>


                {/* SLA Compliance */}
                <Card className="bg-gradient-to-br from-teal-50/50 to-teal-100/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-teal-800">
                            <TrendingUp className="h-5 w-5" />
                            Delivery SLA Compliance
                        </CardTitle>
                        <CardDescription>Percentage of orders delivered on/before promised date</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-3xl font-bold">91.2%</span>
                            <Badge variant="secondary" className="bg-teal-100 text-teal-800 border-teal-200">
                                +3.5% vs target
                            </Badge>
                        </div>
                        <Progress value={91.2} className="h-3 bg-teal-100" />
                        <p className="text-sm text-muted-foreground mt-2">
                            Target: 88% • 342 of 375 orders delivered on time this quarter
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>

    );
};

export default RequesterDashboard;