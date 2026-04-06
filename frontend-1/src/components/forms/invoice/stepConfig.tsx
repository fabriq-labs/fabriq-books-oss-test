/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import {
    FileDoneOutlined,
    DollarOutlined,
    ShoppingCartOutlined,
    CheckCircleOutlined
} from '@ant-design/icons';
import { Steps, Typography, Divider, Button, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import InvoiceFormDetails from './InvoiceFormDetails';
import InvoiceOrderSummary from './InvoiceOrderSummary';
import InvoiceFinancialInformation from './InvoiceFinancial';
import { workflowAPI, viewAPI } from '@/api/api';
import InvoiceLineItems from './InvoiceLineItems';
import InvoiceApprovalPanel from './InvoiceApprovalPanel';
import { LucideQrCode } from 'lucide-react';
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
    setData?: React.Dispatch<React.SetStateAction<any>>,
) => {
    const [details, setDetails] = React.useState<any>({});
    const [whorFlow, setWhorFlow] = React.useState<any>({});
    const [status, setStatus] = React.useState<any>({});
    const { stateId, viewId } = useParams<{ stateId: string, viewId: string }>();
    const [actionId, setActionID] = useState();
    useEffect(() => {
        handleRedirect(requisitionId);
    }, [requisitionId])

    useEffect(() => {
        if (setData) {
            setData(details);
        }
    }, [details, setData]);

    const handleRedirect = (id: any) => {
        if (viewId) {
            viewAPI.getByView("invoice", id, viewId)
                .then((res: any) => {
                    setDetails(res.data);
                    setStatus(res.data.status);
                    setActionID(res?.data?.purchase_order?.purchase_id);
                    setWhorFlow(res?.workflow_context);
                }).catch((err) => {
                    console.log(err);
                })
        } else {
            workflowAPI.getById("invoice", id, stateId)
                .then((res: any) => {
                    setDetails(res.data);
                    setWhorFlow(res?.workflow_context);
                    setActionID(res?.data?.purchase_order?.purchase_id);
                    setStatus(res.data.status);
                }).catch((err) => {
                    console.log(err);
                })
        }

    }

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
        viewAPI.update("invoice", requisitionId, "invoice_view", updatedDetails)
            .then((res: any) => {
                setDetails(res?.data);
            })
            .catch((err) => {
                console.error("Error updating requisition:", err.message);
            });
    };

    return [
        {
            title: 'Basic Info',
            icon: <FileDoneOutlined />,
            content: (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-3 rounded-lg">
                    <div className="lg:col-span-2">
                        <InvoiceFormDetails form={form} readOnly={readOnly} requisitionId={requisitionId} details={details} setDetails={setDetails} onSubmit={handleSubmit} />
                    </div>
                    <div className="lg:col-span-1 space-y-4">
                        <InvoiceOrderSummary whorFlow={whorFlow} form={form} details={details} setDetails={setDetails} />
                        <InvoiceApprovalPanel workflowContext={whorFlow} requisitionId={requisitionId} status={status} type="invoice" actionId={actionId} />
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
                        <InvoiceFinancialInformation form={form} readOnly={readOnly} details={details} setDetails={setDetails} onSubmit={handleSubmit} />
                    </div>
                    <div className="lg:col-span-1 space-y-4">
                        <InvoiceOrderSummary whorFlow={whorFlow} form={form} details={details} setDetails={setDetails} />
                        <InvoiceApprovalPanel workflowContext={whorFlow} requisitionId={requisitionId} status={status} type="invoice" actionId={actionId} />
                    </div>
                </div>
            ),
        },
        {
            title: 'Line Items',
            icon: <ShoppingCartOutlined />,
            content: (
                <div className="bg-gray-50 p-6 rounded-lg">
                    <InvoiceLineItems
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
                        whorFlow={whorFlow}
                    />
                </div>
            ),
        }

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
