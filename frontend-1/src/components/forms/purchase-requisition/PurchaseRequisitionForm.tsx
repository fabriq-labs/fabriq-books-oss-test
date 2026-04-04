import React, { useEffect } from 'react';
import StepsDisplay, { GetFormSteps } from './StepsConfig';
import { useRequisitionForm } from './useRequisitionForm';
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Save,
  Send
} from 'lucide-react';
import WorkflowActions from './WorkflowActions';
import { ActionModal } from './ActionModal';
import { useNavigate, useParams } from 'react-router-dom';
import { workflowAPI, viewAPI } from '@/api/api';
import { Skeleton } from 'antd';
import { addLoaderBasedOnID } from "@/components/utils/helper";
import { toast } from "@/hooks/use-toast";
interface PurchaseRequisitionFormProps {
  onComplete?: () => void;
  requisitionId?: string; // ID for viewing an existing requisition
  readOnly?: boolean; // Flag for read-only mode
  onBack?: () => void; // Callback for back button
}
const PurchaseRequisitionForm: React.FC<PurchaseRequisitionFormProps> = ({
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
  const [comment, setComment] = React.useState<any>({ content: '' });
  const [currentState, setCurrentState] = React.useState<string>('');
  const { stateId, viewId } = useParams<{ stateId: string, viewId: string }>();
  const navigate = useNavigate();
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
    setCurrentStep
  );
  const [loading, setLoading] = React.useState(false);
  useEffect(() => {
    if (requisitionId) {
      handleRedirect(requisitionId);
    }
  }, [requisitionId]);
  const handleActions = async () => {
    if (!action) return;
    try {
      const actionLoader = addLoaderBasedOnID(actionData, action.id, true);
      setActionData(actionLoader);
      const response = await workflowAPI.update(workflowContext.id, action.id, {
        data,
        comment: comment?.content,
        target_state_id: action.target_state_id
      });
      if (response) {
        const responseData = response as any;
        const fromState = responseData?.fromState?.name;
        const toState = responseData?.toState?.name;
        toast({
          title: `${action.name} Successfully`,
          description: `Purchase Requisition has been sent from ${fromState} to ${toState} successfully.`,
        });
      }
      setActionData(addLoaderBasedOnID(actionData, action.id, false));
      setIsModalOpen(false);
      setAction(null);
      setComment({ content: '' });
      navigate('/purchases/requisitions');
    } catch (err) {
      setActionData(addLoaderBasedOnID(actionData, action.id, false));
      throw err;
    }
  };
  const handleModalCancel = () => {
    setIsModalOpen(false);
    setAction(null);
    setComment({ content: '' });
  };
  const handleRedirect = (id: any) => {
    setLoading(true);
    if (viewId) {
      viewAPI.getById("purchase_requisition", id, viewId)
        .then((res: any) => {
          setActionData(res?.workflow_context?.current_state_ref?.source_actions);
          setCurrentState(res?.workflow_context?.current_state_ref?.name)
          setData(res?.data);
          setState(res?.data?.status)
          setView(res?.stateDetails?.meta_view?.view_name)
          setType(res?.workflow_context?.flow?.model_name)
          setWorkflowContext(res?.workflow_context)
          console.log(res?.workflow_context)
        }).catch((err) => {
          console.log(err);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      workflowAPI.getById("purchase_requisition", id, stateId)
        .then((res: any) => {
          setActionData(res?.workflow_context?.current_state_ref?.source_actions);
          setCurrentState(res?.workflow_context?.current_state_ref?.name)
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
          reDirect='purchases/requisitions'
          readOnly={readOnly}
          workflowContext={workflowContext}
          currentState={currentState}
        />
      </div>
      {/* {readOnly && (
        <div className="flex justify-between items-center px-6 pt-6 flex-row-reverse">
          <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-md font-medium text-sm">
            View Mode
          </div>
        </div>
      )} */}
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
                reDirect='purchases/requisitions'
                readOnly={readOnly}
                workflowContext={workflowContext}
              />
            </div>
            {/* {readOnly && (
              <div className="flex justify-end mt-6">
                <Button
                  onClick={onBack}
                  variant="outline"
                >
                  Close
                </Button>
              </div>
            )} */}
          </>
        )}
      </div>
      {/* Action Modal */}
      <ActionModal
        isOpen={isModalOpen}
        onOk={handleActions}
        onCancel={handleModalCancel}
        comment={comment}
        setComment={setComment}
        action={action}
        setAction={setAction}
        handleActions={handleActions}
        id={requisitionId || ''}
        state={state}
        workflowContext={workflowContext}
        actionData={actionData}
      />
    </div>
  );
};
export default PurchaseRequisitionForm;