import React, { useEffect, useState, useRef } from "react";
import { workflowManagementAPI } from "@/api/api";
import DynamicTable from "@/components/masters/DynamicTable";
import { Button } from "@/components/ui/button";
import { Settings, Eye } from "lucide-react";
import { Pagination } from "antd";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface WorkflowFlow {
  id: string;
  name: string;
  model_name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  modified_at: string;
}

const WorkflowManagementPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [workflows, setWorkflows] = useState<WorkflowFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  interface ApiResponse {
    data?: WorkflowFlow[];
    total?: number;
  }

  const tableRef = useRef<any>(null);

  useEffect(() => {
    fetchWorkflows();
  }, [page, pageSize]);

  const fetchWorkflows = async () => {
    setIsLoading(true);
    try {
      const response: ApiResponse = await workflowManagementAPI.getFlows();
      const workflowsData = Array.isArray(response) ? response : (response?.data || []);
      setWorkflows(workflowsData);
      setTotal(response?.total || workflowsData.length);
    } catch (error) {
      console.error("Error fetching workflows:", error);
      toast({
        title: "Error",
        description: "Failed to load workflows",
        variant: "destructive",
      });
      setWorkflows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (current: number, size: number) => {
    setPageSize(size);
    setPage(current);
  };

  const handleViewWorkflow = (workflow: WorkflowFlow) => {
    navigate(`/settings/workflows/${workflow.id}`);
  };

  const renderActions = (record: WorkflowFlow) => {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewWorkflow(record)}
          className="flex items-center gap-1"
        >
          <Eye size={16} />
          <span>View</span>
        </Button>
      </div>
    );
  };

  // Transform workflows data for DynamicTable
  // generateColumns expects metadata in format: { fieldName: { displayName, datatype, isColumnShow } }
  const tableData = {
    metaData: {
      name: {
        displayName: 'Name',
        datatype: 'string',
        isColumnShow: true,
      },
      model_name: {
        displayName: 'Model Name',
        datatype: 'string',
        isColumnShow: true,
      },
      description: {
        displayName: 'Description',
        datatype: 'string',
        isColumnShow: true,
      },
      is_active: {
        displayName: 'Active',
        datatype: 'boolean',
        isColumnShow: true,
      },
    },
    data: workflows,
    total: total,
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold flex items-center">
          <Settings className="mr-2" size={24} />
          Workflow Management
        </h2>
      </div>

      <div className="w-full space-y-4">
        <DynamicTable
          ref={tableRef}
          data={tableData}
          isLoading={isLoading}
          renderActions={renderActions}
          enableMultiSelect={false}
        />

        <div className="mt-4 mb-10 flex float-right">
          <Pagination
            current={page}
            total={total}
            onChange={handlePageChange}
            onShowSizeChange={handlePageSizeChange}
            showSizeChanger={true}
            pageSizeOptions={["10", "20", "50", "100"]}
            showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} items`}
          />
        </div>
      </div>
    </div>
  );
};

export default WorkflowManagementPage;
