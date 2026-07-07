
import React from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';

// Reports migrated from finance-sage-mvp
const sampleReports = [
  {
    id: 'balance-sheet',
    name: 'Balance Sheet',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '/reports/balance-sheet'
  },
  {
    id: 'income-statement',
    name: 'Income Statement',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '/reports/income-statement'
  },
  {
    id: 'personal-income',
    name: 'Personal Income Report',
    category: 'Personal Finance',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '/reports/personal-income'
  },
  {
    id: 'options-income',
    name: 'Options Income Report',
    category: 'Personal Finance',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '/investments/options-income'
  },
  {
    id: 'cash-flow',
    name: 'Cash Flow Statement',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '/reports/cash-flow'
  },
  {
    id: 'posting-list',
    name: 'Posting List',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '/reports/posting-list'
  },
  {
    id: '1',
    name: 'Profit and Loss',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '05/11/2025 10:25 PM',
    path: '#'
  },
  {
    id: '2',
    name: 'Profit and Loss (Schedule III)',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '03/03/2022 11:06 AM',
    path: '#'
  },
  {
    id: '3',
    name: 'Horizontal Profit and Loss',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '#'
  },
  {
    id: '4',
    name: 'Cash Flow Statement',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '08/10/2021 02:38 PM',
    path: '#'
  },
  {
    id: '6',
    name: 'Horizontal Balance Sheet',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '08/03/2024 09:24 AM',
    path: '#'
  },
  {
    id: '7',
    name: 'Balance Sheet (Schedule III)',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '#'
  },
  {
    id: '8',
    name: 'Business Performance Ratios',
    category: 'Business Overview',
    createdBy: 'System Generated',
    lastVisited: '12/01/2024 03:15 PM',
    path: '#'
  },
  {
    id: '9',
    name: 'Sales by Customer',
    category: 'Sales',
    createdBy: 'System Generated',
    lastVisited: '15/02/2024 11:30 AM',
    path: '#'
  },
  {
    id: '10',
    name: 'Sales by Item',
    category: 'Sales',
    createdBy: 'System Generated',
    lastVisited: '-',
    path: '#'
  }
];

interface DataItem {
  id: string;
  name: string;
  category: string;
  createdBy: string;
  lastVisited: string;
  path?: string;
}

const Reports: React.FC = () => {
  const handleReportClick = (id: string, name: string, path?: string) => {
    console.log('Viewing report:', id, name);
    // Navigation is handled by Link component
  };

  const columns: ColumnsType<DataItem> = [
    {
      title: 'REPORT NAME',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div className="flex items-center gap-2">
          <Link
            to={record.path || '#'}
            onClick={(e) => {
              if (record.path === '#') {
                e.preventDefault();
              }
              handleReportClick(record.id, text, record.path);
            }}
            className="text-blue-600 hover:text-blue-800 underline"
          >
            {text}
          </Link>
        </div>
      ),
    },
    {
      title: 'REPORT CATEGORY',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: 'CREATED BY',
      dataIndex: 'createdBy',
      key: 'createdBy',
    },
    {
      title: 'LAST VISITED',
      dataIndex: 'lastVisited',
      key: 'lastVisited',
      render: (text) => text === '-' ? <span className="text-gray-400">-</span> : text,
    },
  ];

  return (
    <div className="w-full space-y-4 p-4">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-sm font-medium">
          {sampleReports.length}
        </span>
      </div>

      <Table
        columns={columns}
        dataSource={sampleReports}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};

export default Reports;
