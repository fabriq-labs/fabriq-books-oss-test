"use client";
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Send, ArrowLeft, ArrowRight, CheckCircle, XCircle } from 'lucide-react';
import { addLoaderBasedOnID } from "@/components/utils/helper";
import { workflowAPI, viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';

interface WorkflowActionsProps {
    actionData: any[];
    setActionData: React.Dispatch<React.SetStateAction<any[]>>;
    data: any;
    setAction: React.Dispatch<React.SetStateAction<any>>;
    setIsModalOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    type: string;
    state?: string;
    view: string;
    id: string;
    comment?: string;
    setComment?: React.Dispatch<React.SetStateAction<string>>;
    isSubmitLoader?: boolean;
    setSubmitLoader?: React.Dispatch<React.SetStateAction<boolean>>;
    form?: any;
    disabled?: boolean;
    currentStep?: number;
    setCurrentStep?: (step: number) => void;
    stepsLength?: number;
    setData?: any
    reDirect?: any
    readOnly?: boolean;
    workflowContext?: any;
    currentState?: any
    onCancel?: () => void;
}

const WorkflowActions: React.FC<WorkflowActionsProps> = ({
    actionData,
    setActionData,
    data,
    setAction,
    setIsModalOpen,
    type,
    state,
    view,
    id,
    comment,
    setComment,
    isSubmitLoader,
    setSubmitLoader,
    form,
    disabled = false,
    currentStep = 0,
    setCurrentStep,
    stepsLength = 1,
    reDirect,
    readOnly,
    workflowContext,
    currentState,
    onCancel
}) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const sortedActionData = Array.isArray(actionData)
        ? [...actionData]
            .sort((a, b) => {
                const aIsApprove = a.name.toLowerCase().includes('approve');
                const bIsApprove = b.name.toLowerCase().includes('approve');
                // If one is approve and the other isn't, approve comes last
                if (aIsApprove && !bIsApprove) return 1;
                if (!aIsApprove && bIsApprove) return -1;
                // If both are approve or both are not approve, sort alphabetically
                return a.name.localeCompare(b.name);
            })
        : [];

    const validateForm = async () => {
        try {
            await form.validateFields();
            return true;
        } catch (errorInfo) {
            console.log('Validation failed:', errorInfo);
            return false;
        }
    };
    function formatType(type: string): string {
        return type
            .split("_") // split by underscore
            .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // capitalize each word
            .join(" "); // join with spaces
    }
    const onAction = async (action: any) => {
        const actionLoader = addLoaderBasedOnID(actionData, action.id, true);
        setActionData(actionLoader);
        try {
            const response = await workflowAPI.update(workflowContext.id, action.id, {
                data
            });
            // Show success toast message
            if (response) {
                const responseData = response as any;
                const fromState = responseData?.fromState?.name;
                const toState = responseData?.toState?.name;

                toast({
                    title: ` ${action.name} Successfully`,
                    description: `${formatType(type)} has been sent from ${fromState} to ${toState} successfully.`,
                });
            }
            setActionData(addLoaderBasedOnID(actionData, action.id, false));

            onCancel?.();
        } catch (err) {
            setActionData(addLoaderBasedOnID(actionData, action.id, false));
            throw err;
        }
    };
    const handleSubmit = async () => {
        if (setSubmitLoader) setSubmitLoader(true);
        try {
            const response = await viewAPI.update(type, id, view, { status: "2" });
            if (setSubmitLoader) setSubmitLoader(false);
            onCancel?.();
        } catch (err) {
            if (setSubmitLoader) setSubmitLoader(false);
            throw err;
        }
    };
    const handleCancel = () => {
        navigate(`/sales/sales-orders`);
    };
    return (
        <Card>
            <div className="form-footer flex justify-end flex-wrap p-4">
                <div className="flex flex-wrap gap-2">

                    <Button
                        onClick={() => { if (onCancel) { onCancel(); } else { handleCancel(); } }}
                        disabled={isSubmitLoader || readOnly}
                        variant="outline"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitLoader || readOnly}
                        variant="outline"
                        className="flex items-center gap-2"
                    >
                        {isSubmitLoader ? 'Saving...' : 'Save Draft'}
                    </Button>
                    {sortedActionData.length > 0 && sortedActionData.map((item: any) => {
                        const isApprove = item.name.toLowerCase().includes('approve');
                        const isReject = item.name.toLowerCase().includes('reject');
                        const isSubmit = item.name.toLowerCase().includes('submit');
                        // Display simplified button text
                        const buttonText = isApprove
                            ? 'Approve'
                            : isReject
                                ? 'Reject'
                                : isSubmit
                                    ? 'Submit'
                                    : item?.name;
                        return (

                            <Button
                                key={item?.id}
                                onClick={() => onAction(item)}
                                disabled={isSubmitLoader || item?.loader || readOnly}
                                variant={isReject ? "outline" : "default"}
                                className="flex items-center gap-2"
                            >
                                {buttonText}
                                {item?.loader && <span className="loading loading-spinner loading-xs"></span>}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
};

export default WorkflowActions;

