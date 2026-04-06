import React, { useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import InvoiceForm from '@/pages/Invoice/InvoiceForm';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';

const InvoiceDetailsPage: React.FC = () => {
    const { id, stateId, viewId } = useParams<{ id: string; stateId: string, viewId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { setPageContext } = useChatContext();

    useEffect(() => {
        if (id) {
            const modelName = 'invoice';
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
        // Redirect to correct list based on how user arrived (sales vs purchases)
        const isFromSales = location.pathname.includes('/sales/');
        return navigate(isFromSales ? '/sales/invoices' : '/purchases/bills');
    };

    return (

        <InvoiceForm
            selectedRequisitionId={id}
            onBack={handleFormClose}
            onComplete={handleFormClose}
            viewMode={!!viewId}
        />

    );
};

export default InvoiceDetailsPage;
