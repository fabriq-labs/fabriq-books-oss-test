import React, { useEffect, useState, useRef } from "react";
import { erpConnectionsAPI } from "@/api/api";
import DynamicTable from "@/components/masters/DynamicTable";
import { Button } from "@/components/ui/button";
import { Link, Plus, Eye } from "lucide-react";
import { Pagination } from "antd";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface SourceSystem {
  id: string;
  name: string;
  system_type: string;
  is_active: boolean;
  created_at: string;
  modified_at: string;
  org_id: string;
  connection_config?: any; // Encrypted, not displayed
  last_sync_at?: string | null;
  last_sync_status?: { status?: string; message?: string } | null;
  sync_status?: string;
}

const ConnectionsPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [connections, setConnections] = useState<SourceSystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  interface ApiResponse {
    data?: SourceSystem[];
    total?: number;
  }

  const tableRef = useRef<any>(null);

  useEffect(() => {
    fetchConnections();
  }, [page, pageSize]);

  const fetchConnections = async () => {
    setIsLoading(true);
    try {
      const response: any = await erpConnectionsAPI.getAll();
      // RestService returns { success: true, data: [...], total: number }
      const connectionsData = response?.data || [];

      // Filter out connection_config from display (sensitive data)
      const sanitizedData = connectionsData.map((conn: any) => {
        const { connection_config, ...rest } = conn;
        const ls = rest.last_sync_status;
        const sync_status =
          typeof ls === "object" && ls !== null && "status" in ls
            ? String((ls as { status?: string }).status ?? "—")
            : "—";
        return { ...rest, sync_status };
      });

      setConnections(sanitizedData);
      setTotal(response?.total || sanitizedData.length);
    } catch (error) {
      console.error("Error fetching connections:", error);
      toast({
        title: "Error",
        description: "Failed to load connections",
        variant: "destructive",
      });
      setConnections([]);
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

  const handleViewConnection = (connection: SourceSystem) => {
    navigate(`/settings/connections/${connection.id}`);
  };

  const renderActions = (record: SourceSystem) => {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewConnection(record)}
          className="flex items-center gap-1"
        >
          <Eye size={16} />
          <span>View</span>
        </Button>
      </div>
    );
  };

  // Transform connections data for DynamicTable
  const tableData = {
    metaData: {
      name: {
        displayName: 'Name',
        datatype: 'string',
        isColumnShow: true,
      },
      system_type: {
        displayName: 'System Type',
        datatype: 'string',
        isColumnShow: true,
      },
      is_active: {
        displayName: 'Active',
        datatype: 'boolean',
        isColumnShow: true,
      },
      created_at: {
        displayName: 'Created',
        datatype: 'datetime',
        isColumnShow: true,
      },
      modified_at: {
        displayName: 'Modified',
        datatype: 'datetime',
        isColumnShow: true,
      },
      last_sync_at: {
        displayName: 'Last sync',
        datatype: 'datetime',
        isColumnShow: true,
      },
      sync_status: {
        displayName: 'Sync status',
        datatype: 'string',
        isColumnShow: true,
      },
    },
    data: connections,
    total: total,
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold flex items-center">
          <Link className="mr-2" size={24} />
          ERP Connections
        </h2>
        <Button onClick={() => navigate('/settings/connections/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Create Connection
        </Button>
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

export default ConnectionsPage;

