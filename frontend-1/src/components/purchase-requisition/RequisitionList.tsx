
import React from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, FileText } from 'lucide-react';
import { ActionButtons } from '@/components/ui/action-buttons';
import { PurchaseRequisition } from '@/models/PurchaseRequisition';
import StatusTag from './RequisitionStatus';

import { useEffect } from 'react';
import { Card, Skeleton } from 'antd';
import { ListCard } from '@/components/ui/list-card';
import { CardContent } from '../ui/card';
import { workflowAPI } from '@/api/api';

interface RequisitionListProps {
  onViewRequisition: (id: string) => void;
  onEditRequisition: (id: string) => void;
  stateId: string;
  isLoading?: boolean;
  hideHeader?: boolean;
}

const RequisitionList: React.FC<RequisitionListProps> = ({
  onViewRequisition,
  onEditRequisition,
  stateId,
}) => {

  const [dataSource, setDataSource] = React.useState([]);
  const [error, setError] = React.useState({});
  const [tableLoader, setTableLoader] = React.useState(false);

  useEffect(() => {
    fetchData();
  }, [])
  const fetchData = () => {
    setTableLoader(true);
    workflowAPI.getByStateID("purchase_requisition", stateId)
      .then((res: any) => {
        setDataSource(res.data.data);
        setError({});
        setTableLoader(false);
      })
      .catch((err) => {
        setTableLoader(false);
        const { response } = err;
        setError({ error: true });
        if (response?.status != 400) {
          setError({
            status: response?.status,
            title: response?.statusText,
            subTitle: response?.data?.error,
          });
        }
      });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center">
          <FileText className="mr-2" size={24} />
          Purchase Requisitions
        </h2>
        {/* <Button onClick={onCreateNew} className="flex items-center gap-2 bg-primary hover:bg-primary/90">
          <Plus size={16} /> Create New
        </Button> */}
      </div>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase Requisition </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataSource.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    {tableLoader ? (
                      <Skeleton active />
                    ) : (
                      <p>No requisitions found. Create one to get started.</p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                dataSource.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req?.pr_number}</TableCell>
                    <TableCell>
                      {req?.pr_date
                        ? new Date(req.pr_date).toLocaleDateString('en-GB')  // 'en-GB' gives dd/mm/yyyy
                          .replace(/\//g, '-') // replace slashes with dashes
                        : ''}
                    </TableCell>

                    <TableCell>{req?.purchase_reason}</TableCell>
                    <TableCell>₹{req?.total_price}</TableCell>
                    <TableCell>
                      <StatusTag status={req.status} />
                    </TableCell>
                    <TableCell>
                      <ActionButtons
                        id={req.id}
                        onView={onViewRequisition}
                        onEdit={onEditRequisition}
                      />
                    </TableCell>
                  </TableRow>
                ))

              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default RequisitionList;
