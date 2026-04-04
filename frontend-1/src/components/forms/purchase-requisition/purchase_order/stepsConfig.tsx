import React, { useEffect, useState } from 'react';
import {
    FileDoneOutlined,
    DollarOutlined,
    ShoppingCartOutlined,
    CheckCircleOutlined
} from '@ant-design/icons';
import { Steps, Typography, Divider, Button, Spin } from 'antd';
import { Separator } from "@/components/ui/separator";
import { useNavigate, useParams } from 'react-router-dom';
import PurchaseOrderDetails from './PurchaseOrderDetails';
import SupplierDetails from './SupplierDetails';
import PurchaseOrderLineItemsTable from './purchaseOrderLineItem';
import PurchaseOrderSummary from './PurchaseorderSummary';
import { workflowAPI, viewAPI } from '@/api/api';
import POReviewDocument from './POReviewDocument';
import PurchaseOrderApprovalPanel from './PurchaseOrderApprovalPanel';
const { Title } = Typography;
export const GetFormSteps = (
    form: any,
    lineItems: any[],
    setLineItems: React.Dispatch<React.SetStateAction<any[]>>,
    editingRowId: string | null,
    setEditingRowId: React.Dispatch<React.SetStateAction<string | null>>,
    currentLineItem: any,
    setCurrentLineItem: React.Dispatch<React.SetStateAction<any>>,
    updateTotalAmount: (items: any[]) => void,
    readOnly: boolean = false,
    requisitionId: string,
) => {
    const [details, setDetails] = React.useState<any>({});
    const [whorFlow, setWhorFlow] = React.useState<any>({});
    const [status, setStatus] = React.useState<any>({});
    const [actionId, setActionID] = useState();
    const [currentState, setCurrentState] = useState();
    const { stateId, viewId } = useParams<{ stateId: string, viewId: string }>();
    useEffect(() => {
        handleRedirect(requisitionId);
    }, [requisitionId])

    const handleRedirect = (id: any) => {
        if (viewId) {
            viewAPI.getByView("purchase_order", id, viewId)
                .then((res: any) => {

                    setDetails(res.data);
                    setWhorFlow(res?.workflow_context);
                    setStatus(res.data.status);
                    setCurrentState(res?.workflow_context?.current_state_ref?.name)

                }).catch((err) => {
                    console.log(err);
                })
        } else {
            workflowAPI.getById("purchase_order", id, stateId)
                .then((res: any) => {
                    setDetails(res.data);
                    setActionID(res?.data?.purchase_id);
                    setStatus(res.data.status);
                    setWhorFlow(res?.workflow_context);
                    setCurrentState(res?.workflow_context?.current_state_ref?.name)

                }).catch((err) => {
                    console.log(err);
                })
        }

    }
    function calculateTotalPRAmount(purchaseOrder): number {
        if (!purchaseOrder?.purchase_order_item?.length) {
            return 0;
        }

        return purchaseOrder.purchase_order_item.reduce((total, item) => {
            return total + (item.item_total || 0);
        }, 0);
    }
    const totalPOAmount = calculateTotalPRAmount(details);



    const handleSubmit = async (purchaseRequisitionDetails: any) => {
        if (!requisitionId) return;

        const updatedDetails = {
            ...purchaseRequisitionDetails,
            ...(purchaseRequisitionDetails?.total_price || details?.total_price
                ? {
                    total_price: parseFloat(
                        purchaseRequisitionDetails?.total_price ?? details.total_price
                    ),
                }
                : {}),
        };
        viewAPI.update("purchase_order", requisitionId, viewId, updatedDetails)
            .then((res: any) => {
                setDetails(res?.data);
            })
            .catch((err) => {
                console.error("Error updating requisition:", err.message);
            });
    };
    {
        if (currentState === "PO Pending Approval") {
            return [
                {
                    title: 'Review',
                    icon: <CheckCircleOutlined />,
                    content: (
                        <div className="bg-white p-6 rounded-lg">
                            <POReviewDocument form={form} details={details} totalPOAmount={totalPOAmount} />
                        </div>
                    ),
                },
                {
                    title: 'Basic Info',
                    icon: <FileDoneOutlined />,
                    content: (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-3 rounded-lg">
                            <div className="lg:col-span-2">
                                <PurchaseOrderDetails form={form} readOnly={readOnly} requisitionId={requisitionId} details={details} setDetails={setDetails} onSubmit={handleSubmit} totalPOAmount={totalPOAmount} />
                            </div>
                            <div className="lg:col-span-1 space-y-4">
                                <PurchaseOrderSummary whorFlow={whorFlow} form={form} details={details} setDetails={setDetails} totalPOAmount={totalPOAmount} />
                                <PurchaseOrderApprovalPanel workflowContext={whorFlow} requisitionId={requisitionId} status={status} type="purchase_order" actionId={actionId} />
                            </div>
                        </div>
                    ),
                },
                {
                    title: 'Supplier Info',
                    icon: <DollarOutlined />,
                    content: (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-3 rounded-lg">
                            <div className="lg:col-span-2">
                                <SupplierDetails form={form} readOnly={readOnly} details={details} setDetails={setDetails} onSubmit={handleSubmit} />
                            </div>
                            <div className="lg:col-span-1 space-y-4">
                                <PurchaseOrderSummary whorFlow={whorFlow} form={form} details={details} setDetails={setDetails} totalPOAmount={totalPOAmount} />
                                <PurchaseOrderApprovalPanel workflowContext={whorFlow} requisitionId={requisitionId} status={status} type="purchase_order" actionId={actionId} />
                            </div>
                        </div>
                    ),
                },
                {
                    title: 'Line Items',
                    icon: <ShoppingCartOutlined />,
                    content: (
                        <div className="bg-gray-50 p-6 rounded-lg">
                            <PurchaseOrderLineItemsTable
                                lineItems={lineItems}
                                setLineItems={setLineItems}
                                editingRowId={editingRowId}
                                setEditingRowId={setEditingRowId}
                                currentLineItem={currentLineItem}
                                setCurrentLineItem={setCurrentLineItem}
                                updateTotalAmount={updateTotalAmount}
                                budgetLevel={details?.budget_level}
                                details={details}
                                setDetails={setDetails}
                                readOnly={readOnly}
                                requisitionId={requisitionId}
                                totalPOAmount={totalPOAmount}
                            />
                        </div>
                    ),
                },

            ];
        }
    }
    return [
        {
            title: 'Basic Info',
            icon: <FileDoneOutlined />,
            content: (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-3 rounded-lg">
                    <div className="lg:col-span-2">
                        <PurchaseOrderDetails form={form} readOnly={readOnly} requisitionId={requisitionId} details={details} setDetails={setDetails} onSubmit={handleSubmit} totalPOAmount={totalPOAmount} />
                    </div>
                    <div className="lg:col-span-1 space-y-4">
                        <PurchaseOrderSummary whorFlow={whorFlow} form={form} details={details} setDetails={setDetails} totalPOAmount={totalPOAmount} />
                        <PurchaseOrderApprovalPanel workflowContext={whorFlow} requisitionId={requisitionId} status={status} type="purchase_order" actionId={actionId} />
                    </div>
                </div>
            ),
        },
        {
            title: 'Supplier Info',
            icon: <DollarOutlined />,
            content: (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-3 rounded-lg">
                    <div className="lg:col-span-2">
                        <SupplierDetails form={form} readOnly={readOnly} details={details} setDetails={setDetails} onSubmit={handleSubmit} />
                    </div>
                    <div className="lg:col-span-1 space-y-4">
                        <PurchaseOrderSummary whorFlow={whorFlow} form={form} details={details} setDetails={setDetails} totalPOAmount={totalPOAmount} />
                        <PurchaseOrderApprovalPanel workflowContext={whorFlow} requisitionId={requisitionId} status={status} type="purchase_order" actionId={actionId} />
                    </div>
                </div>
            ),
        },
        {
            title: 'Line Items',
            icon: <ShoppingCartOutlined />,
            content: (
                <div className="bg-gray-50 p-6 rounded-lg">
                    <PurchaseOrderLineItemsTable
                        lineItems={lineItems}
                        setLineItems={setLineItems}
                        editingRowId={editingRowId}
                        setEditingRowId={setEditingRowId}
                        currentLineItem={currentLineItem}
                        setCurrentLineItem={setCurrentLineItem}
                        updateTotalAmount={updateTotalAmount}
                        budgetLevel={details?.budget_level}
                        details={details}
                        setDetails={setDetails}
                        readOnly={readOnly}
                        requisitionId={requisitionId}
                        totalPOAmount={totalPOAmount}
                    />
                </div>
            ),
        },
        {
            title: 'Review',
            icon: <CheckCircleOutlined />,
            content: (
                <div className="bg-white p-6 rounded-lg">
                    <POReviewDocument form={form} details={details} totalPOAmount={totalPOAmount} />
                </div>
            ),
        },
    ];
};
// Navigation component for the form steps
export const StepsNavigation = ({
    currentStep,
    setCurrentStep,
    stepsLength,
    handleSubmit,
    isSubmitting = false
}: {
    currentStep: number,
    setCurrentStep: (step: number) => void,
    stepsLength: number,
    handleSubmit: () => void,
    isSubmitting?: boolean
}) => {
    return (
        <div className="flex justify-between mt-6">
            {currentStep > 0 && (
                <Button
                    onClick={() => setCurrentStep(currentStep - 1)}
                    disabled={isSubmitting}
                >
                    Previous
                </Button>
            )}
            {currentStep === 0 && <div></div>}
            {currentStep < stepsLength - 1 && (
                <Button
                    type="primary"
                    onClick={() => setCurrentStep(currentStep + 1)}
                    disabled={isSubmitting}
                >
                    Next
                </Button>
            )}
            {currentStep === stepsLength - 1 && (
                <Button
                    type="primary"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex items-center gap-2"
                >
                    {isSubmitting ? <Spin size="small" /> : null}
                    {isSubmitting ? 'Submitting...' : 'Submit Requisition'}
                </Button>
            )}
        </div>
    );
};

interface StepsDisplayProps {
    currentStep: number;
    onChange: (current: number) => void;
    steps: any[];
    readOnly?: boolean;
}

export default function StepsDisplay({
    currentStep,
    onChange,
    steps,
    readOnly = false
}: StepsDisplayProps) {
    return (
        <Steps
            current={currentStep}
            onChange={false ? undefined : onChange}
            items={steps.map(step => ({
                title: step.title,
                icon: step.icon,
            }))}
            className="mb-6"
        />
    );
}
