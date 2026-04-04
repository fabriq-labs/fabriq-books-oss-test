import React, { useState, useEffect } from 'react';
import { ListCard } from '@/components/ui/list-card';
import { FileText, Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { workflowAPI } from '@/api/api';
import RequisitionTable from './RequisitionTable';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import TablePagination from '@/components/tables/components/TablePagination';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';

const PurchaseRequisitionDashboardPage: React.FC = () => {
  const location = useLocation();
  const { setPageContext } = useChatContext();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('toDos');
  const [details, setDetails] = useState<any>({});
  const [activeList, setActiveList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchValue, setSearchValue] = useState<string>('');
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  useEffect(() => {
    // Get the tab from query parameters and set it as active
    const tabFromQuery = searchParams.get('tab');
    if (tabFromQuery) {
      setActiveTab(tabFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    getList();
  }, []);

  useEffect(() => {
    const modelName = 'purchase_requisition';
    setPageContext({
      modelName,
      viewName: getViewName(modelName),
      recordId: null,
      stateId: null,
      viewId: null,
      modelDisplayName: getModelDisplayName(modelName),
      currentPath: location.pathname
    });

    return () => {
      setPageContext(null);
    };
  }, [location.pathname, setPageContext]);

  const getList = () => {
    setIsLoading(true);
    workflowAPI.getAll('purchase_requisition')
      .then((res: any) => {
        setDetails(res);
        setIsLoading(false);
      }).catch((err) => {
        console.log(err);
        setIsLoading(false);
      });
  }

  useEffect(() => {
    if (activeTab === 'toDos') {
      // For toDos: assignedToList + roleBasedList + Draft items from createdByList
      const assigned = details['assignedToList'] || [];
      const roleBased = details['roleBasedList'] || [];
      const createdBy = details['createdByList'] || [];
      const draftFromCreatedBy = createdBy.filter((item: any) => item.current_state === 'Draft');
      setActiveList([...assigned, ...roleBased, ...draftFromCreatedBy]);
    } else {
      // For raisedByMe: only non-Draft items from createdByList
      const createdBy = details['createdByList'] || [];
      const nonDraftFromCreatedBy = createdBy.filter((item: any) => item.current_state !== 'Draft');
      setActiveList(nonDraftFromCreatedBy);
    }
  }, [activeTab, details]);


  const handleAction = (id: string, status: string) => {
    if (activeTab === 'createdByList' && status !== "Draft") {
      navigate(`/purchases/requisitions/${id}/view/view_1`);
    } else {
      navigate(`/purchases/requisitions/${id}/state/${status}`);
    }
  };

  const handleCreate = () => {
    workflowAPI.create("purchase_requisition", '2', {
      status: '2',
    })
      .then((res: any) => {
        navigate(`/purchases/requisitions/${res?.data?.id}/state/2`);
      }).catch((err) => {
        console.error("Error:", err.message);
      });
  };

  const onSearch = () => {

  }
  const filterControls = (
    <>
      <div className="flex items-center gap-2">
        <Button onClick={handleCreate} className="flex items-center gap-2 bg-primary hover:bg-primary/90">
          <Plus size={16} /> Create New
        </Button>
      </div>
    </>
  );
  const searchableKeys = [
    'pr_number',
    'purchase_reason',
    'requester', // special handling
    'current_state',
    'pr_date',
    'total_price'
  ];

  const getSearchValue = (req: any, key: string) => {
    switch (key) {
      case 'pr_number':
        return req?.purchase_requisitions?.[0]?.pr_number ?? '';
      case 'purchase_reason':
        return req?.purchase_requisitions?.[0]?.purchase_reason ?? '';
      case 'requester': {
        // Get latest history entry
        const latestHistory = req.history?.slice().sort(
          (a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
        )[0];
        return latestHistory?.performed_by_name ?? '';
      }
      case 'current_state':
        return req?.current_state ?? '';
      case 'pr_date':
        return req?.purchase_requisitions?.[0]?.pr_date
          ? new Date(req.purchase_requisitions[0].pr_date).toLocaleDateString('en-GB')
          : '';
      case 'total_price':
        return req?.purchase_requisitions?.[0]?.total_price?.toString() ?? '';
      default:
        return req[key] ?? '';
    }
  };

  const filteredRequisitions = activeList.filter((req: any) => {
    if (!searchValue) return true;
    const rowContent = searchableKeys
      .map((key) => getSearchValue(req, key))
      .join(' ')
      .toLowerCase();
    return rowContent.includes(searchValue.toLowerCase());
  });
  // Calculate pagination
  const totalPages = Math.ceil(filteredRequisitions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRequisitions = filteredRequisitions.slice(startIndex, startIndex + itemsPerPage);

  // Debug logs


  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchValue]);
  // Reset to first page when tab or list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, activeList.length]);

  const SkeletonLoader = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="flex items-center space-x-4">
            <Skeleton className="h-12 w-full rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  return (

    <div className="w-full space-y-4 p-4">
      <ListCard
        title="Purchase Requisitions"
        icon={<FileText className="text-primary" size={24} />}
        actionButton={filterControls}
        contentClassName="p-0"
        // icon={<FileText className="text-primary" size={24} />}
        // actionButton={hideHeader ? undefined : addButton}
        // className={hideHeader ? "shadow-none border-0" : ""}
        onSearch={onSearch}
        searchValue={searchValue}
        searchPlaceholder="Search requisitions..."
        onSearchValueChange={setSearchValue}
      >

        <Tabs defaultValue="toDos" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="toDos">To Dos</TabsTrigger>
            <TabsTrigger value="createdByList">Raised by Me</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="p-4">
              <SkeletonLoader />
            </div>
          ) : (
            <>
              <TabsContent value="toDos" className="mt-0">
                <RequisitionTable data={paginatedRequisitions} handleAction={handleAction} />
              </TabsContent>
              <TabsContent value="createdByList" className="mt-0">
                <RequisitionTable data={paginatedRequisitions} handleAction={handleAction} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </ListCard>
      {totalPages > 1 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
    </div>

  );
};

export default PurchaseRequisitionDashboardPage;
