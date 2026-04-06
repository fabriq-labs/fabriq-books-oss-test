import React from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';

// Mock data for spend by category
const spendByCategoryData = [
  { name: 'Office Supplies', value: 48000 },
  { name: 'IT Equipment', value: 120000 },
  { name: 'Professional Services', value: 85000 },
  { name: 'Facilities', value: 63000 },
  { name: 'Travel', value: 25000 }
];

// Mock data for cycle time
const cycleTimeData = [
  { name: 'PR to PO', value: 3.2 },
  { name: 'PO to Receipt', value: 5.8 },
  { name: 'Receipt to Invoice', value: 2.1 },
  { name: 'Invoice to Payment', value: 4.5 }
];

// Mock data for cost savings
const costSavingsData = [
  { month: 'Jan', savings: 12500 },
  { month: 'Feb', savings: 18700 },
  { month: 'Mar', savings: 15200 },
  { month: 'Apr', savings: 21800 },
  { month: 'May', savings: 19500 },
  { month: 'Jun', savings: 25000 }
];

// Mock data for recent purchases
const recentPurchasesData = [
  { id: 'PO-2023-0089', supplier: 'Office Depot', amount: 4850 },
  { id: 'PO-2023-0088', supplier: 'Dell Computers', amount: 12350 },
  { id: 'PO-2023-0087', supplier: 'Acme Services', amount: 8500 }
];

// Update with more vibrant, visually appealing colors
const COLORS = ['#36B9CC', '#4E73DF', '#1CC88A', '#F6C23E', '#E74A3B'];

// Bar chart colors - subtle but elegant
const BAR_COLOR = '#4E73DF';

// Line chart colors
const LINE_COLOR = '#1CC88A';

export const CategorySpendChart = () => {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Spend by Category</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={spendByCategoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {spendByCategoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const CycleTimeChart = () => {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Process Cycle Time (Days)</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={cycleTimeData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill={BAR_COLOR} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const CostSavingsChart = () => {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Cost Savings (Last 6 Months)</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={costSavingsData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="savings" 
                stroke={LINE_COLOR} 
                activeDot={{ r: 8 }} 
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const RecentPurchasesCard = () => {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Top 3 Recent Purchases</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentPurchasesData.map((purchase, i) => (
            <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
              <div>
                <p className="font-medium text-sm">{purchase.id}</p>
                <p className="text-sm text-gray-600">{purchase.supplier}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-primary-700">${purchase.amount.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
