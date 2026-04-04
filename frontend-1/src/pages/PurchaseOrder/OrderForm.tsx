import { Button, Typography } from 'antd';
import React, { useEffect, Suspense } from 'react';
import { FileTextOutlined } from '@ant-design/icons';
import PurchaseOrderForm from '@/components/forms/purchase-requisition/purchase_order/PurchaseOrderForm';
import { useToast } from "@/components/ui/use-toast";
import { lazy as dynamic } from 'react';
import { viewAPI, workflowAPI } from '@/api/api';
const { Title } = Typography;
import { useNavigate, useParams } from 'react-router-dom';
interface RequisitionFormProps {
    selectedRequisitionId?: string | null;
    onComplete: () => void;
    onBack: () => void;
    viewMode: boolean;
}

const GeneratePurchaseOrderPDF = dynamic(() =>
    import("@/components/pdf_generator/GeneratePurchaseOrderPDF")
        .then(module => ({ default: module.GeneratePurchaseOrderPDF }))
);

const OrderForm: React.FC<RequisitionFormProps> = ({
    onComplete,
    onBack,
    selectedRequisitionId,
    viewMode
}) => {
    const [loading, setLoading] = React.useState(false);
    const [currentState, setCurrentState] = React.useState();
    const { stateId, viewId } = useParams<{ stateId: string, viewId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [purchaseOrder, setPurchaseOrder] = React.useState<any>({});
    const getFormTitle = () => {
        if (viewMode) return 'View Purchase Order';
        return selectedRequisitionId ? 'Edit Purchase Order' : 'Create Purchase Order';
    };

    useEffect(() => {
        if (selectedRequisitionId) {
            handleRedirect(selectedRequisitionId);
        }
    }, [selectedRequisitionId]);
    const createInvoiceData = async (id: any) => {
        workflowAPI.createInvoice(id)
            .then((res) => {
                const invoiceId = res?.data?.id;
                toast({
                    title: "Success",
                    description: "Invoice created successfully!",
                });
                navigate(`/purchases/bills/${invoiceId}/state/9`);
            })
            .catch((err) => {
                toast({
                    title: "Error",
                    description: "Failed to create invoice. Please try again.",
                    variant: "destructive"
                });
            });
    };
    const handleRedirect = (id: any) => {
        setLoading(true);
        if (viewId) {
            viewAPI.getById("purchase_order", id, viewId)
                .then((res: any) => {
                    setCurrentState(res?.workflow_context?.current_state_ref?.name)
                }).catch((err) => {
                    console.log(err);
                })
                .finally(() => {
                    setLoading(false);
                });
        } else {
            workflowAPI.getById("purchase_order", id, stateId)
                .then((res: any) => {
                    setCurrentState(res?.workflow_context?.current_state_ref?.name)
                }).catch((err) => {
                    console.log(err);
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    };
    const onCancel = () => {
        navigate('/purchases/orders');
    }
    return (
        <>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <Title level={4}>
                        <FileTextOutlined className="mr-2" />
                        {getFormTitle()}
                    </Title>
                </div>

                <div className="flex items-center gap-2">
                    {
                        currentState === 'PO Issued' && (
                            <Button
                                type="primary"
                                style={{ cursor: 'pointer', minWidth: '120px' }}
                                onClick={() => createInvoiceData(selectedRequisitionId)}
                            >
                                Create Invoice
                            </Button>
                        )
                    }
                    {Object.keys(purchaseOrder).length > 0 && (
                        <Suspense fallback={<div>Loading PDF...</div>}>
                            <GeneratePurchaseOrderPDF purchaseOrder={purchaseOrder} />
                        </Suspense>
                    )}

                    <Button
                        onClick={() =>
                            navigate('/purchases/orders')
                        }
                    >
                        Back to List
                    </Button>
                </div>
            </div>
            <div className="bg-gray-50 p-0 rounded-lg">
                <PurchaseOrderForm
                    onComplete={onComplete}
                    requisitionId={selectedRequisitionId || undefined}
                    readOnly={viewMode}
                    onBack={onCancel}
                    purchaseOrderData={purchaseOrder}
                    setPurchaseOrder={setPurchaseOrder}
                />
            </div>
        </>
    );
};

export default OrderForm;
