import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, Badge } from 'antd';
import type { TabsProps } from 'antd';
import { workflowAPI } from '@/api/api';
import { useNavigate } from 'react-router-dom';

const documentTypes = [
  { key: 'purchase_requisition', label: 'Purchase Requisitions' },
  { key: 'purchase_order', label: 'Purchase Orders' },
  { key: 'invoice', label: 'Invoices' }
];

export const TodoCard = () => {
  const navigate = useNavigate();
  const [documentData, setDocumentData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPromises = documentTypes.map(docType =>
      workflowAPI.getAll(docType.key)
        .then(res => ({ type: docType.key, data: res }))
        .catch(err => {
          console.error(`Error fetching ${docType.key} data:`, err);
          return { type: docType.key, data: { createdByList: [], assignedToList: [], roleBasedList: [] } };
        })
    );

    Promise.all(fetchPromises)
      .then(results => {
        const newData = results.reduce((acc, { type, data }) => {
          acc[type] = data;
          return acc;
        }, {});

        setDocumentData(newData);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Error fetching data:", err);
        setIsLoading(false);
      });
  }, []);

  const handleTodoClick = (docType: string, listType: string) => {
    const data = documentData[docType];
    let items = [];
    let tabName = '';

    if (listType === 'Created By Me') {
      items = data.createdByList || [];
      tabName = 'createdByList';
    } else if (listType === 'Assigned To Me' || listType === 'Role Based') {
      items = data.assignedToList || [];
      tabName = 'toDos';
    }

    let routePath = '';
    if (docType === 'purchase_requisition') {
      routePath = 'purchases/requisitions';
    } else if (docType === 'purchase_order') {
      routePath = 'purchases/orders';
    } else if (docType === 'invoice') {
      routePath = 'purchases/bills';
    }

    if (routePath) {
      navigate(`/${routePath}?tab=${tabName}`);
    } else {
      console.log('Invalid document type');
    }
  };
  const tabItems: TabsProps['items'] = documentTypes.map(docType => {
    const data = documentData[docType.key] || { createdByList: [], assignedToList: [], roleBasedList: [] };

    const items = [
      { type: 'Created By Me', count: data.createdByList?.length || 0 },
      { type: 'Assigned To Me', count: data.assignedToList?.length || 0 },
      { type: 'Role Based', count: data.roleBasedList?.length || 0 }
    ];

    return {
      key: docType.key,
      label: docType.label,
      children: (
        <div className="space-y-2">
          {isLoading ? (
            <div className="py-4 text-center text-gray-500">Loading...</div>
          ) : (
            items.map((item, i) => (
              <div
                key={i}
                className="flex justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-gray-50"
                onClick={() => handleTodoClick(docType.key, item.type)}
              >
                <span className="text-sm font-medium">{item.type}</span>
                <Badge count={item.count} style={{ backgroundColor: '#7028a0' }} />
              </div>
            ))
          )}
        </div>
      ),
    };
  });

  return (
    <Card className="h-full shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">To Dos</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultActiveKey={documentTypes[0].key} items={tabItems} />
      </CardContent>
    </Card>
  );
};