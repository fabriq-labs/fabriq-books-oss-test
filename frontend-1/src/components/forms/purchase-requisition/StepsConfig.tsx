/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import {
  FileDoneOutlined,
  DollarOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { Steps, Typography, Divider, Button, Spin } from 'antd';
import { Separator } from "@/components/ui/separator";
import PurchaseRequisitionDetails from './PurchaseRequisitionDetails';
import FinancialInformation from './FinancialInformation';
import OrderSummary from './OrderSummary';
import ApprovalPanel from './ApprovalPanel';
import { workflowAPI, viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import PurchaseLineItems from './PurchaseLineItems';
import { useTool } from '@/contexts/ToolContext';
import PRReviewDocument from './PRReviewFormat';
import { useAuth } from '@/contexts/AuthContext';
import { useFormToolResponse } from '@/hooks/useFormToolResponse';
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
  setCurrentStep?: React.Dispatch<React.SetStateAction<number>>,
) => {
  const [details, setDetails] = React.useState<any>({});
  const [status, setStatus] = React.useState<any>({});
  const [whorFlow, setWhorFlow] = React.useState<any>({});
  const { type, stateId, viewId } = useParams<{ type: string, stateId: string, viewId: string }>();
  const [view, setView] = useState<any>();
  const [currentState, setCurrentState] = React.useState<string>('');
  const { getToolData, toolData, latestFormToolResponse } = useTool();
  const { user } = useAuth();

  // Update details when createRecord or createChildItem tool response is received
  useFormToolResponse(latestFormToolResponse, setDetails);

  // Helper functions for role-based access control
  const hasRole = (roleName: string): boolean => {
    if (!user || !user.role_users || !Array.isArray(user.role_users)) {
      return false;
    }
    return user.role_users.some(roleUser =>
      roleUser.role && roleUser.role.name &&
      roleUser.role.name.toLowerCase().includes(roleName.toLowerCase())
    );
  };

  const isBuyer = (): boolean => hasRole('buyer');
  const isAdmin = (): boolean => hasRole('admin');

  // Navigation function to go to Line Items step
  const navigateToLineItems = () => {
    if (setCurrentStep) {
      // For buyers/admins, Line Items is step 3, for regular users it's step 2
      const lineItemsStepIndex = (isBuyer() || isAdmin()) ? 3 : 2;
      setCurrentStep(lineItemsStepIndex);
      // Scroll to top of the form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const NavigateToBudgetItems = () => {
    if (setCurrentStep) {
      // For buyers/admins, Financial is step 2, for regular users it's step 1
      const financialStepIndex = (isBuyer() || isAdmin()) ? 2 : 1;
      setCurrentStep(financialStepIndex);
      // Scroll to top of the form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  // Debug logging for role detection // Auto-populate user details when creating new requisition
  useEffect(() => {
    if (user && !requisitionId && !readOnly) {
      // Only populate for new requisitions
      if (details && Object.keys(details).length === 0) {
        setDetails(prevDetails => ({
          ...prevDetails,
          create_user: {
            id: user.id,
            name: user.name,
            email: user.email,
            department: user.department_id ? { id: user.department_id } : null
          },
          organization: user.org ? {
            id: user.org.id,
            name: user.org.name
          } : null
        }));
      }
    }
  }, [user, requisitionId, readOnly, details]);

  useEffect(() => {
    handleRedirect(requisitionId);
  }, [requisitionId])




  const handleRedirect = (id: any) => {
    if (viewId) {
      viewAPI.getByView("purchase_requisition", id, viewId)
        .then((res: any) => {
          setDetails(res.data);
          setCurrentState(res?.workflow_context?.current_state_ref?.name)
          setWhorFlow(res?.workflow_context);
          setStatus(res.data.status);
          setView("view1");
        }).catch((err) => {
          console.log(err);
        })
    } else {
      workflowAPI.getById("purchase_requisition", id, stateId)
        .then((res: any) => {
          setDetails(res.data);
          setCurrentState(res?.workflow_context?.current_state_ref?.name)
          setWhorFlow(res?.workflow_context);
          setStatus(res.data.status);
          setView("view_1");
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
    viewAPI.update("purchase_requisition", requisitionId, "view_1", updatedDetails)
      .then((res: any) => {
        setDetails(res?.data);
      })
      .catch((err) => {
        console.error("Error updating requisition:", err.message);
      });
  };
  {
    if (isBuyer() && currentState !== "Draft" || isAdmin() && currentState !== "Draft") {
      return [
        {
          title: 'Review',
          icon: <CheckCircleOutlined />,
          content: (
            <div className="bg-white rounded-lg">
              <PRReviewDocument
                form={form}
                details={details}
                workflowContext={whorFlow}
                isBuyer={isBuyer()}
                isAdmin={isAdmin()}
                onNavigateToLineItems={navigateToLineItems}
                onNavigateToBudgetItems={NavigateToBudgetItems}
              />
            </div>
          ),
        },
        {
          title: 'Basic Info',
          icon: <FileDoneOutlined />,
          content: (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-3 rounded-lg">
              <div className="lg:col-span-2">
                <PurchaseRequisitionDetails
                  form={form}
                  readOnly={readOnly}
                  requisitionId={requisitionId}
                  details={details}
                  setDetails={setDetails}
                  onSubmit={handleSubmit}

                />
              </div>
              <div className="lg:col-span-1 space-y-4">
                <OrderSummary form={form} workflowContext={whorFlow} details={details} setDetails={setDetails} />
                <ApprovalPanel requisitionId={requisitionId} status={status} type="purchase_requisition" actionId={requisitionId} workflowContext={whorFlow} />
              </div>
            </div>
          ),
        },
        {
          title: 'Financial',
          icon: <DollarOutlined />,
          content: (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-3 rounded-lg">
              <div className="lg:col-span-2">
                <FinancialInformation
                  form={form}
                  readOnly={readOnly}
                  details={details}
                  setDetails={setDetails}
                  onSubmit={handleSubmit}

                />
              </div>
              <div className="lg:col-span-1 space-y-4">
                <OrderSummary form={form} workflowContext={whorFlow} details={details} setDetails={setDetails} />
                <ApprovalPanel requisitionId={requisitionId} status={status} type="purchase_requisition" actionId={requisitionId} workflowContext={whorFlow} />
              </div>
            </div>
          ),
        },
        {
          title: 'Line Items',
          icon: <ShoppingCartOutlined />,
          content: (
            <div className="bg-gray-50 p-6 rounded-lg">
              <PurchaseLineItems
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
            <PurchaseRequisitionDetails
              form={form}
              readOnly={readOnly}
              requisitionId={requisitionId}
              details={details}
              setDetails={setDetails}
              onSubmit={handleSubmit}

            />
          </div>
          <div className="lg:col-span-1 space-y-4">
            <OrderSummary form={form} workflowContext={whorFlow} details={details} setDetails={setDetails} />
            <ApprovalPanel requisitionId={requisitionId} status={status} type="purchase_requisition" actionId={requisitionId} workflowContext={whorFlow} />
          </div>
        </div>
      ),
    },
    {
      title: 'Financial',
      icon: <DollarOutlined />,
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-3 rounded-lg">
          <div className="lg:col-span-2">
            <FinancialInformation
              form={form}
              readOnly={readOnly}
              details={details}
              setDetails={setDetails}
              onSubmit={handleSubmit}

            />
          </div>
          <div className="lg:col-span-1 space-y-4">
            <OrderSummary form={form} workflowContext={whorFlow} details={details} setDetails={setDetails} />
            <ApprovalPanel requisitionId={requisitionId} status={status} type="purchase_requisition" actionId={requisitionId} workflowContext={whorFlow} />
          </div>
        </div>
      ),
    },
    {
      title: 'Line Items',
      icon: <ShoppingCartOutlined />,
      content: (
        <div className="bg-gray-50 p-6 rounded-lg">
          <PurchaseLineItems
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
          />
        </div>
      ),
    },
    {
      title: 'Review',
      icon: <CheckCircleOutlined />,
      content: (
        <div className="bg-white rounded-lg">
          <PRReviewDocument form={form} details={details} workflowContext={whorFlow} />
        </div>
      ),
    },
  ];

};// Navigation component for the form steps
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
