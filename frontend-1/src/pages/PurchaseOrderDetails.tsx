import React, { useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import OrderForm from './PurchaseOrder/OrderForm';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';

const PurchaseOrderDetailsPage: React.FC = () => {
    const { id, stateId, viewId } = useParams<{ id: string; stateId: string, viewId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { setPageContext } = useChatContext();

    useEffect(() => {
        if (id) {
            const modelName = 'purchase_order';
            setPageContext({
                modelName,
                viewName: getViewName(modelName),
                recordId: id,
                stateId: stateId || null,
                viewId: viewId || null,
                modelDisplayName: getModelDisplayName(modelName),
                currentPath: location.pathname
            });
        }

        return () => {
            setPageContext(null);
        };
    }, [id, stateId, viewId, location.pathname, setPageContext]);

    const handleFormClose = () => {
        return navigate(`/purchases/orders`);
    };

    return (
        
            <OrderForm
                selectedRequisitionId={id}
                onBack={handleFormClose}
                onComplete={handleFormClose}
                viewMode={!!viewId}
            />
        
    );
};

export default PurchaseOrderDetailsPage;
