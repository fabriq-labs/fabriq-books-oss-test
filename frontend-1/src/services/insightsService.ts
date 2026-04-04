
interface InsightResponse {
  message: string;
  chartType?: 'bar' | 'line' | 'pie' | null;
  chartData?: any;
}

const mockSupplierData = [
  { name: 'TechSupply Inc.', orders: 128, value: 245000 },
  { name: 'Global Parts Ltd.', orders: 98, value: 187000 },
  { name: 'Office Solutions', orders: 87, value: 156000 },
  { name: 'Manufacturing Partners', orders: 76, value: 132000 },
  { name: 'Equipment Experts', orders: 65, value: 118000 },
];

const mockDepartmentSpending = [
  { department: 'IT', spending: 320000 },
  { department: 'Operations', spending: 280000 },
  { department: 'Marketing', spending: 190000 },
  { department: 'HR', spending: 110000 },
  { department: 'Finance', spending: 95000 },
];

const mockMonthlyTrends = [
  { month: 'Jan', value: 145000 },
  { month: 'Feb', value: 165000 },
  { month: 'Mar', value: 175000 },
  { month: 'Apr', value: 155000 },
  { month: 'May', value: 180000 },
  { month: 'Jun', value: 195000 },
];

const mockCycleTime = [
  { department: 'IT', days: 12 },
  { department: 'Operations', days: 15 },
  { department: 'Marketing', days: 9 },
  { department: 'HR', days: 7 },
  { department: 'Finance', days: 11 },
];

export async function processInsightQuery(query: string): Promise<InsightResponse> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Convert query to lowercase for easier matching
  const lowerQuery = query.toLowerCase();
  
  // Check for supplier-related queries
  if (lowerQuery.includes('top') && lowerQuery.includes('supplier')) {
    const topCount = lowerQuery.includes('top 3') ? 3 : 
                     lowerQuery.includes('top 5') ? 5 : 3;
    
    const topSuppliers = mockSupplierData.slice(0, topCount);
    
    return {
      message: `Here are the top ${topCount} suppliers based on purchase volume:\n\n` +
               topSuppliers.map((s, i) => 
                 `${i+1}. ${s.name} - ${s.orders} orders, $${s.value.toLocaleString()}`
               ).join('\n'),
      chartType: 'bar',
      chartData: {
        labels: topSuppliers.map(s => s.name),
        values: topSuppliers.map(s => s.value)
      }
    };
  }
  
  // Check for monthly trend queries
  if ((lowerQuery.includes('trend') || lowerQuery.includes('monthly')) && 
      (lowerQuery.includes('purchase') || lowerQuery.includes('procurement'))) {
    
    return {
      message: 'Here are the monthly purchase trends for the first half of the year:\n\n' +
               mockMonthlyTrends.map(m => 
                 `${m.month}: $${m.value.toLocaleString()}`
               ).join('\n'),
      chartType: 'line',
      chartData: {
        labels: mockMonthlyTrends.map(m => m.month),
        values: mockMonthlyTrends.map(m => m.value)
      }
    };
  }
  
  // Check for department spending queries
  if (lowerQuery.includes('department') && 
      (lowerQuery.includes('spend') || lowerQuery.includes('budget'))) {
    
    return {
      message: 'Here are the departments ranked by spending this year:\n\n' +
               mockDepartmentSpending.map((d, i) => 
                 `${i+1}. ${d.department}: $${d.spending.toLocaleString()}`
               ).join('\n'),
      chartType: 'pie',
      chartData: {
        labels: mockDepartmentSpending.map(d => d.department),
        values: mockDepartmentSpending.map(d => d.spending)
      }
    };
  }
  
  // Check for cycle time queries
  if (lowerQuery.includes('cycle') && lowerQuery.includes('time')) {
    
    return {
      message: 'Here are the procurement cycle times by department:\n\n' +
               mockCycleTime.map((d) => 
                 `${d.department}: ${d.days} days average cycle time`
               ).join('\n'),
      chartType: 'bar',
      chartData: {
        labels: mockCycleTime.map(d => d.department),
        values: mockCycleTime.map(d => d.days)
      }
    };
  }
  
  // Default response for unrecognized queries
  return {
    message: "I'm not sure how to answer that specific question yet. Try asking about top suppliers, monthly purchase trends, department spending, or procurement cycle times."
  };
}
