"use client";
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Send, ArrowLeft, ArrowRight, CheckCircle, XCircle } from 'lucide-react';
import { addLoaderBasedOnID } from "@/components/utils/helper";
import { workflowAPI, viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from "@/hooks/use-toast";
import { isBuyer, hasRole } from '@/utils/roleUtils';
import { useAuth } from '@/contexts/AuthContext';
interface WorkflowActionsProps {
  actionData: any[];
  setActionData: React.Dispatch<React.SetStateAction<any[]>>;
  data: any;
  setAction: React.Dispatch<React.SetStateAction<any>>;
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  type: string;
  state: string;
  view: string;
  id: string;
  comment?: string;
  setComment?: React.Dispatch<React.SetStateAction<string>>;
  isSubmitLoader: boolean;
  setSubmitLoader: React.Dispatch<React.SetStateAction<boolean>>;
  form: any;
  disabled?: boolean;
  currentStep?: number;
  setCurrentStep?: (step: number) => void;
  stepsLength?: number;
  setData?: any
  reDirect?: any
  readOnly?: boolean;
  workflowContext?: any;
  currentState?: any;
  onBeforeAction?: (action: any, data: any) => boolean | Promise<boolean>; // Validation callback
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
  onBeforeAction
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sortedActionData = Array.isArray(actionData)
    ? [...actionData]
      .filter((action) => {
        const actionName = action.name.toLowerCase();
        return actionName.includes('approve') || actionName.includes('reject') || actionName.includes('submit');
      })
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
    if (action.is_comment || action.is_query) {
      setAction(action);
      setIsModalOpen(true);
    } else {
      // Call validation callback if provided
      if (onBeforeAction) {
        const isValid = await onBeforeAction(action, data);
        if (!isValid) {
          return; // Prevent API call if validation fails
        }
      }

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

          // Special toast message for purchase_requisition when user is a buyer
          if (type === "purchase_requisition" && isBuyer(user)) {
            toast({
              title: `Purchase Order Created Successfully`,
              description: `${formatType(type)} has been send from Buyer Review to PO Creation successfully.`,
            });
          } else {
            toast({
              title: ` ${action.name} Successfully`,
              description: `${formatType(type)} has been sent from ${fromState} to ${toState} successfully.`,
            });
          }
        }

        setActionData(addLoaderBasedOnID(actionData, action.id, false));
        navigate(`/${reDirect}`);
      } catch (err) {
        setActionData(addLoaderBasedOnID(actionData, action.id, false));
        throw err;
      }
    }
  };

  const handleSubmit = async () => {
    setSubmitLoader(true);
    try {
      const response = await viewAPI.update(type, id, view, { status: "2" });
      setSubmitLoader(false);
      navigate(`/${reDirect}`);
    } catch (err) {
      setSubmitLoader(false);
      throw err;
    }
  };

  const handleCancel = () => {
    navigate(`/${reDirect}`);
  };
  const handleSendBack = () => {
    setIsModalOpen(true);
  }
  const handlePrevious = () => {
    if (setCurrentStep && currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (setCurrentStep && currentStep < stepsLength - 1) {
      setCurrentStep(currentStep + 1);
    }
  };
  // For buyers/admins, Review is the first step (index 0)
  // For regular users, Review is the last step (index stepsLength - 1)
  // Exclude review page if state is Draft and user is Buyer with Manager role
  const isDraftWithBuyerManager = currentState === "Draft" && isBuyer(user) && hasRole(user, 'manager');
  const isReviewPage = (currentStep === 0 && (isBuyer(user) || hasRole(user, 'admin')) && type === "purchase_requisition" && currentState !== "Draft" && !isDraftWithBuyerManager) ||
    (currentStep === 0 && currentState === "PO Pending Approval" && type === "purchase_order") ||
    currentStep === stepsLength - 1;
  // Check if user has Employee role
  const isEmployee = hasRole(user, 'employee');
  // Check if user is an approver (buyer or admin)
  const isApprover = isBuyer(user);
  // Check if we're in edit mode for approvers (not on review page but in approval state)
  const isEditModeForApprover = isApprover && currentState === "PO Pending Approval" && type === "purchase_order" && currentStep === stepsLength - 1;

  // Check if "Send Back" action is present in actionData
  const hasSendBackInActionData = Array.isArray(actionData) &&
    actionData.some((action) => action.name.toLowerCase().includes('send back'));
  return (
    <Card>
      <div className="form-footer flex justify-between flex-wrap p-4">
        <div>
          {currentStep > 0 && setCurrentStep && (
            <Button
              onClick={handlePrevious}
              disabled={isSubmitLoader || readOnly}
              variant="outline"
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">

          {!isReviewPage && !isEmployee && (
            <Button
              onClick={handleCancel}
              disabled={isSubmitLoader || readOnly}
              variant="outline"
            >
              Cancel
            </Button>
          )}
          {
            hasSendBackInActionData && <Button
              onClick={handleSendBack}
              disabled={isSubmitLoader || readOnly}
              variant="outline"
            >
              Send Back
            </Button>

          }

          {!isReviewPage && isEmployee && (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitLoader || readOnly}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isSubmitLoader ? 'Saving...' : 'Save Draft'}
            </Button>
          )}
          {currentStep < stepsLength - 1 && setCurrentStep && !isReviewPage && (
            <Button
              onClick={handleNext}
              disabled={isSubmitLoader || readOnly}
              variant="default"
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {/* Edit button for approvers in review page */}
          {isReviewPage && isApprover && type === "purchase_order" && setCurrentStep && currentStep != 3 && !readOnly && (
            <Button
              onClick={() => setCurrentStep(1)} // Navigate to Basic Info tab (index 1)
              disabled={isSubmitLoader || readOnly}
              variant="outline"
              className="flex items-center gap-2"
            >
              Edit
            </Button>
          )}
          {/* Preview button for approvers in edit mode (Line Items tab) */}
          {isEditModeForApprover && currentStep === 3 && setCurrentStep && !readOnly && ( // Line Items is index 2
            <Button
              onClick={() => setCurrentStep(0)} // Navigate back to Review tab (index 0)
              disabled={isSubmitLoader || readOnly}
              variant="default"
              className="flex items-center gap-2"
            >
              Preview
            </Button>
          )}
          {isReviewPage && sortedActionData.length > 0 && sortedActionData.map((item: any) => {
            const isApprove = item.name.toLowerCase().includes('approve');
            const isReject = item.name.toLowerCase().includes('reject');
            // Display simplified button text
            const buttonText = isApprove ? 'Approve' : isReject ? 'Reject' : item?.name;
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