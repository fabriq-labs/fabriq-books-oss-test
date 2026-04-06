import React, { useEffect } from 'react';
import RequisitionForm from '@/components/purchase-requisition/RequisitionForm';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';

const PurchaseRequisitionDetailsPage: React.FC = () => {
  const { id, stateId, viewId } = useParams<{ id: string; stateId: string, viewId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { setPageContext } = useChatContext();

  useEffect(() => {
    if (id) {
      const modelName = 'purchase_requisition';
      setPageContext({
        modelName,
        viewName: getViewName(modelName),
        recordId: id,
        promptTypes: ['default', 'line_item']
      });
    }

    return () => {
      setPageContext(null);
    };
  }, [id, stateId, viewId, location.pathname, setPageContext]);

  const handleFormClose = () => {
    return navigate(`/purchases/requisitions`);
  };

  return (

    <RequisitionForm
      selectedRequisitionId={id}
      onBack={handleFormClose}
      onComplete={handleFormClose}
      viewMode={!!viewId}
    />

  );
};

export default PurchaseRequisitionDetailsPage;
