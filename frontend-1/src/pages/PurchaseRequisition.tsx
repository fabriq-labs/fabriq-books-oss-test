import React, { useState, useEffect } from 'react';
import RequisitionList from '@/components/purchase-requisition/RequisitionList';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

import { useNavigate, useParams } from 'react-router-dom';
import { PurchaseRequisition } from '@/models/PurchaseRequisition';
import { workflowAPI } from '@/api/api';

const PurchaseRequisitionPage: React.FC = () => {
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { stateId, viewId } = useParams<{ stateId: string, viewId: string }>();

  const handleCreate = () => {
    workflowAPI.create("purchase_requisition", stateId, {
      status: stateId,
    })
      .then((res: any) => {
        console.log(res?.data, 'res');
        navigate(`/purchases/requisitions/${res?.data?.id}/state/${stateId}`)
      }).catch((err) => {
        const { response } = err;
        console.log("Error :", err.message);
      });
  };

  const handleViewRequisition = (id: string) => {
    navigate(`/purchases/requisitions/${id}/view/view_1`)
  };

  const handleEditRequisition = (id: string) => {
    navigate(`/purchases/requisitions/${id}/state/${stateId}`)
  };

  const filteredRequisitions = requisitions.filter(req =>
    !searchTerm ||
    req.pr_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.purchase_reason?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Purchase Requisitions</h2>
        <Button onClick={handleCreate} className="flex items-center gap-2">
          <Plus size={16} />
          <span>Create New</span>
        </Button>
      </div>
      <RequisitionList
        onViewRequisition={handleViewRequisition}
        onEditRequisition={handleEditRequisition}
        stateId={stateId}
      />
    </>
  );
};

export default PurchaseRequisitionPage;
