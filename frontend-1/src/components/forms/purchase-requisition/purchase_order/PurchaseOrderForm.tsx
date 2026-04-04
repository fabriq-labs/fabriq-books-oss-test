import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Skeleton } from 'antd';
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    Save,
    Send
} from 'lucide-react';

import { useNavigate, useParams } from 'react-router-dom';
import { useRequisitionForm } from '../useRequisitionForm';

import WorkflowActions from '../WorkflowActions';
import StepsDisplay, { GetFormSteps } from './stepsConfig';
import { workflowAPI, viewAPI } from '@/api/api';
interface PurchaseRequisitionFormProps {
    onComplete?: () => void;
    requisitionId?: string; // ID for viewing an existing requisition
    readOnly?: boolean; // Flag for read-only mode
    onBack?: () => void; // Callback for back button
    purchaseOrderData?: any; // Purchase order data passed from parent
    setPurchaseOrder?: any; // Purchase order data passed from parent
}

const PurchaseOrderForm: React.FC<PurchaseRequisitionFormProps> = ({
    onComplete,
    requisitionId,
    readOnly = false,
    onBack,
    purchaseOrderData,
    setPurchaseOrder
}) => {
    const {
        form,
        lineItems,
        setLineItems,
        editingRowId,
        setEditingRowId,
        currentLineItem,
        setCurrentLineItem,
        currentStep,
        setCurrentStep,
        updateTotalAmount,
        onSubmit,
        saveAsDraft,
        isSubmitting,
        refreshRequisition
    } = useRequisitionForm(onComplete, requisitionId, readOnly);
    const [actionData, setActionData] = useState<any>([]);
    const [data, setData] = useState<any>({});
    const [state, setState] = useState<string>('');
    const [view, setView] = useState<string>('');
    const [type, setType] = useState<string>('');
    const [action, setAction] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [isSubmitLoader, setSubmitLoader] = useState<boolean>(false);
    const [workflowContext, setWorkflowContext] = useState<any>(null);
    const [currentState, setCurrentState] = useState();
    const { stateId, viewId } = useParams<{ stateId: string, viewId: string }>();
    const steps = GetFormSteps(
        form,
        lineItems,
        setLineItems,
        editingRowId,
        setEditingRowId,
        currentLineItem,
        setCurrentLineItem,
        updateTotalAmount,
        readOnly,
        requisitionId
    );
    const [loading, setLoading] = React.useState(false);

    // Use a ref to track the last data we sent to prevent infinite loops
    const lastSentData = React.useRef<string>('');
    useEffect(() => {
        if (requisitionId) {
            // Reset the last sent data when requisitionId changes
            lastSentData.current = '';
            handleRedirect(requisitionId);
        }
    }, [requisitionId]);

    // Update parent component when form data changes (for new purchase orders)

    useEffect(() => {
        if (setPurchaseOrder && data && Object.keys(data).length > 0) {
            const dataString = JSON.stringify(data);
            if (dataString !== lastSentData.current) {
                setPurchaseOrder(data);
                lastSentData.current = dataString;
            }
        }
    }, [data]);

    const handleRedirect = (id: any) => {
        setLoading(true);
        if (viewId) {
            viewAPI.getById("purchase_order", id, viewId)
                .then((res: any) => {
                    setActionData(res?.workflow_context?.current_state_ref?.source_actions);
                    setData(res?.data);
                    setState(res?.data?.status)
                    setView(res?.stateDetails?.meta_view?.view_name)
                    setType(res?.workflow_context?.flow?.model_name)
                    setWorkflowContext(res?.workflow_context)
                    setCurrentState(res?.workflow_context?.current_state_ref?.name)
                    // Update parent component's purchase order state for PDF generation
                    if (setPurchaseOrder && res?.data) {
                        setPurchaseOrder(res.data);
                    }
                }).catch((err) => {
                    console.log(err);
                })
                .finally(() => {
                    setLoading(false);
                });
        } else {
            workflowAPI.getById("purchase_order", id, stateId)
                .then((res: any) => {
                    setActionData(res?.workflow_context?.current_state_ref?.source_actions);
                    setData(res?.data);
                    setState(res?.data?.status)
                    setView(res?.stateDetails?.meta_view?.view_name)
                    setType(res?.workflow_context?.flow?.model_name)
                    setWorkflowContext(res?.workflow_context)
                    setCurrentState(res?.workflow_context?.current_state_ref?.name)
                    // Update parent component's purchase order state for PDF generation
                    if (setPurchaseOrder && res?.data) {
                        setPurchaseOrder(res.data);
                    }
                }).catch((err) => {
                    console.log(err);
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    };



    const currentStatus = form.watch('prStatus');

    return (
        <div className="space-y-6 max-w-screen-xl mx-auto">
            <div className="px-6 pt-6">
                <WorkflowActions
                    actionData={actionData}
                    setActionData={setActionData}
                    data={data}
                    setData={setData}
                    setAction={setAction}
                    setIsModalOpen={setIsModalOpen}
                    type={type}
                    state={state}
                    view={view}
                    id={requisitionId}
                    isSubmitLoader={isSubmitLoader}
                    setSubmitLoader={setSubmitLoader}
                    form={form}
                    currentStep={currentStep}
                    setCurrentStep={setCurrentStep}
                    stepsLength={steps.length}
                    reDirect='purchases/orders'
                    readOnly={readOnly}
                    workflowContext={workflowContext}
                    currentState={currentState}
                />
            </div>
            {readOnly && (
                <div className="flex justify-between items-center px-6 pt-6 ">

                    <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-md font-medium text-sm ">
                        View Mode
                    </div>
                    {readOnly && (
                        <div className="flex-row-reverse">
                            <Button
                                onClick={onBack}
                                variant="outline"
                            >
                                Close
                            </Button>
                        </div>
                    )}
                </div>
            )}
            <div className="p-6">
                {loading ? (
                    <div className="space-y-6">
                        <div className="p-6">
                            <Skeleton active paragraph={{ rows: 4 }} />
                            <br />
                            <Skeleton active paragraph={{ rows: 4 }} />
                            <br />
                            <Skeleton active paragraph={{ rows: 4 }} />
                            <br />
                            <div className="flex justify-end gap-2 mt-4">
                                <Skeleton.Button active style={{ width: 100 }} />
                                <Skeleton.Button active style={{ width: 100 }} />
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <StepsDisplay
                            currentStep={currentStep}
                            onChange={(current) => setCurrentStep(current)}
                            steps={steps}
                            readOnly={readOnly}
                        />
                        <div className="py-2">
                            {steps[currentStep].content}
                        </div>
                        <div className="px-6 pt-6">
                            <WorkflowActions
                                actionData={actionData}
                                setActionData={setActionData}
                                data={data}
                                setData={setData}
                                setAction={setAction}
                                setIsModalOpen={setIsModalOpen}
                                type={type}
                                state={state}
                                view={view}
                                id={requisitionId}
                                isSubmitLoader={isSubmitLoader}
                                setSubmitLoader={setSubmitLoader}
                                form={form}
                                currentStep={currentStep}
                                setCurrentStep={setCurrentStep}
                                stepsLength={steps.length}
                                reDirect='purchases/orders'
                                readOnly={readOnly}
                                workflowContext={workflowContext}
                                currentState={currentState}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PurchaseOrderForm;