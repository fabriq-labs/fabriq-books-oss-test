import React, { useEffect } from 'react';
import { Skeleton } from 'antd';
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    Save,
    Send
} from 'lucide-react';


import { useNavigate, useParams, useLocation } from 'react-router-dom';

import { useRequisitionForm } from '../purchase-requisition/useRequisitionForm';
import WorkflowActions from '../purchase-requisition/WorkflowActions';
import StepsDisplay, { GetFormSteps } from './stepConfig';
import { workflowAPI, viewAPI } from '@/api/api';
import { useToast } from "@/components/ui/use-toast";

interface PurchaseRequisitionFormProps {
    onComplete?: () => void;
    requisitionId?: string; // ID for viewing an existing requisition
    readOnly?: boolean; // Flag for read-only mode
    onBack?: () => void; // Callback for back button
}

const InvoiceOrderForm: React.FC<PurchaseRequisitionFormProps> = ({
    onComplete,
    requisitionId,
    readOnly = false,
    onBack
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
    const [actionData, setActionData] = React.useState<any>([]);
    const [data, setData] = React.useState<any>({});
    const [state, setState] = React.useState<string>('');
    const [view, setView] = React.useState<string>('');
    const [type, setType] = React.useState<string>('');
    const [action, setAction] = React.useState<any>(null);
    const [isModalOpen, setIsModalOpen] = React.useState<boolean>(false);
    const [isSubmitLoader, setSubmitLoader] = React.useState<boolean>(false);
    const [workflowContext, setWorkflowContext] = React.useState<any>(null);
    const { stateId, viewId } = useParams<{ stateId: string, viewId: string }>();
    const location = useLocation();
    const { toast } = useToast();
    const redirectPath = location.pathname.includes('/sales/') ? 'sales/invoices' : 'purchases/bills';
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
        requisitionId,
        setData
    );
    const [loading, setLoading] = React.useState(false);
    useEffect(() => {
        if (requisitionId) {
            handleRedirect(requisitionId);
        }
    }, [requisitionId]);

    const handleRedirect = (id: any) => {
        setLoading(true);
        if (viewId) {
            viewAPI.getById("invoice", id, viewId)
                .then((res: any) => {
                    setActionData(res?.workflow_context?.current_state_ref?.source_actions);
                    setData(res?.data);
                    setState(res?.data?.status)
                    setView(res?.stateDetails?.meta_view?.view_name)
                    setType(res?.workflow_context?.flow?.model_name)
                    setWorkflowContext(res?.workflow_context)
                }).catch((err) => {
                    console.log(err);
                })
                .finally(() => {
                    setLoading(false);
                });
        } else {
            workflowAPI.getById("invoice", id, stateId)
                .then((res: any) => {
                    setActionData(res?.workflow_context?.current_state_ref?.source_actions);
                    setData(res?.data);
                    setState(res?.data?.status)
                    setView(res?.stateDetails?.meta_view?.view_name)
                    setType(res?.workflow_context?.flow?.model_name)
                    setWorkflowContext(res?.workflow_context)
                }).catch((err) => {
                    console.log(err);
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    };

    // Validation callback for invoice quantity validation
    const validateInvoiceQuantities = React.useCallback(async (action: any, invoiceData: any): Promise<boolean> => {
        // Check if action is exactly "Draft" - if so, allow submission without validation
        const isDraftAction = action.name?.toLowerCase() === 'draft';
        const isRejectAction = action.name?.toLowerCase() === 'reject';
        if (isRejectAction) {
            return true; // Allow reject actions without validation
        }

        if (isDraftAction) {
            return true; // Allow draft actions without validation
        }

        // Validate invoice quantities if not draft
        if (invoiceData?.invoice_line_item) {
            const invalidItems: any[] = [];

            invoiceData.invoice_line_item.forEach((item: any) => {
                console.log("item", item);
                const poQuantity = item?.purchase_order_line_item?.quantity || 0;
                const alreadyInvoicedQty = item?.purchase_order_line_item?.invoice_qty || 0;
                const remainingQuantity = poQuantity - alreadyInvoicedQty;
                const invoiceQty = item?.invoice_qty || 0;

                console.log("invoiceQty", invoiceQty);
                console.log("remainingQuantity", remainingQuantity);
                console.log("poQuantity", poQuantity);
                console.log("alreadyInvoicedQty", alreadyInvoicedQty);
                if (invoiceQty > remainingQuantity) {
                    invalidItems.push({
                        itemName: item?.item_name || item?.item_master?.item_name || 'Unknown Item',
                        invoiceQty,
                        remainingQuantity,
                        poQuantity,
                        alreadyInvoicedQty
                    });
                }
            });

            if (invalidItems.length > 0) {
                const firstInvalidItem = invalidItems[0];

                toast({
                    title: "Invoice Quantity Validation Failed",
                    description: `Cannot submit invoice. ${invalidItems.length} item(s) have invoice quantities exceeding available quantities. Example: "${firstInvalidItem.itemName}" - Invoice Qty (${firstInvalidItem.invoiceQty}) exceeds available (${firstInvalidItem.remainingQuantity}). Please correct the quantities and try again.`,
                    variant: "destructive",
                });

                return false; // Prevent API call
            }
        }

        return true; // Validation passed
    }, [toast]);

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
                    reDirect={redirectPath}
                    readOnly={readOnly}
                    workflowContext={workflowContext}
                    onBeforeAction={validateInvoiceQuantities}
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
                                reDirect={redirectPath}
                                readOnly={readOnly}
                                workflowContext={workflowContext}
                                onBeforeAction={validateInvoiceQuantities}
                            />
                        </div>

                    </>
                )}
            </div>
        </div>
    );
};

export default InvoiceOrderForm;