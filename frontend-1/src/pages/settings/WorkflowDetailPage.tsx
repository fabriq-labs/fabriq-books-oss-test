import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { workflowManagementAPI } from "@/api/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Settings, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkflowStatesTable from "@/components/workflow/WorkflowStatesTable";

interface WorkflowFlow {
  id: string;
  name: string;
  model_name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  modified_at: string;
  states?: WorkflowState[];
}

interface ApiResponse {
  data?: WorkflowFlow;
}

interface WorkflowState {
  id: string;
  name: string;
  description?: string;
  sequence: number;
  is_initial: boolean;
  is_final: boolean;
  is_active: boolean;
  skip: boolean;
  skip_target_state_id?: string | null;
  assigned_for: string;
  assigned_role_id?: string;
  assigned_user_id?: string;
  assigned_expression?: string;
  entry_conditions?: any;
  exit_conditions?: any;
  source_actions?: WorkflowAction[];
  target_actions?: WorkflowAction[];
  assigned_role?: {
    id: string;
    name: string;
  };
  assigned_user?: {
    id: string;
    name: string;
    email: string;
  };
}

interface WorkflowAction {
  id: string;
  name: string;
  description?: string;
  source_state_id: string;
  target_state_id: string;
  conditions?: Record<string, unknown>;
  side_effects?: Record<string, unknown>;
  target_state: WorkflowState;
}

const WorkflowDetailPage: React.FC = () => {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [workflow, setWorkflow] = useState<WorkflowFlow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (flowId) {
      fetchWorkflow();
    }
  }, [flowId]);

  const fetchWorkflow = async () => {
    if (!flowId) return;

    setIsLoading(true);
    try {
      const response: ApiResponse = await workflowManagementAPI.getFlowById(flowId);
      setWorkflow(response.data || response);
    } catch (error) {
      console.error("Error fetching workflow:", error);
      toast({
        title: "Error",
        description: "Failed to load workflow details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToList = () => {
    navigate("/settings/workflows");
  };

  const handleStateUpdated = () => {
    // Refresh the workflow data after a state is updated
    fetchWorkflow();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading workflow...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Workflow Not Found</h2>
          <Button onClick={handleBackToList}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Workflows
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={handleBackToList}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Workflows
        </Button>
        <span className="text-gray-500">/</span>
        <span className="text-gray-700 font-medium">{workflow.name}</span>
      </div>

      {/* Workflow Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="h-6 w-6 text-primary" />
              <div>
                <CardTitle className="text-2xl">{workflow.name}</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  Model: <code className="bg-gray-100 px-2 py-1 rounded text-xs">{workflow.model_name}</code>
                </p>
              </div>
            </div>
            <Badge variant={workflow.is_active ? "default" : "secondary"}>
              {workflow.is_active ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-1" />
                  Inactive
                </>
              )}
            </Badge>
          </div>
          {workflow.description && (
            <p className="text-gray-700 mt-2">{workflow.description}</p>
          )}
        </CardHeader>
      </Card>

      {/* Workflow States */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow States</CardTitle>
          <p className="text-sm text-gray-600">
            Drag states to reorder. Click edit to configure assignments and skip behavior.
          </p>
        </CardHeader>
        <CardContent>
          <WorkflowStatesTable
            states={workflow.states || []}
            flowId={workflow.id}
            onStateUpdated={handleStateUpdated}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkflowDetailPage;
