
import React from 'react';
import { Button, Typography } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import PurchaseRequisitionForm from '@/components/forms/purchase-requisition';
import PurchaseOrderForm from '@/components/forms/purchase-requisition/purchase_order/PurchaseOrderForm';
import BillsInvoiceForm from '@/components/forms/invoice/BillsInvoiceForm';

const { Title } = Typography;

interface RequisitionFormProps {
    selectedRequisitionId?: string | null;
    onComplete: () => void;
    onBack: () => void;
    viewMode: boolean;
}

const InvoiceForm: React.FC<RequisitionFormProps> = ({
    onComplete,
    onBack,
    selectedRequisitionId,
    viewMode
}) => {

    const getFormTitle = () => {
        if (viewMode) return 'View Invoice';
        return selectedRequisitionId ? 'Edit Invoice' : 'Create Invoice';
    };

    return (
        <>
            <div className="flex justify-between items-center mb-6">
                <Title level={4}>
                    <FileTextOutlined className="mr-2" />
                    {getFormTitle()}
                </Title>
                <Button onClick={onBack}>
                    Back to List
                </Button>
            </div>
            <div className="bg-gray-50 p-0 rounded-lg">
                <BillsInvoiceForm
                    onComplete={onComplete}
                    requisitionId={selectedRequisitionId || undefined}
                    readOnly={viewMode}
                    onBack={onBack}
                />
            </div>
        </>
    );
};

export default InvoiceForm;
