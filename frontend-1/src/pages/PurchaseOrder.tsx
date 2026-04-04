import React, { useState, useEffect } from 'react';
import { ListCard } from '@/components/ui/list-card';
import { FileText, Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { log } from 'console';
import { workflowAPI } from '@/api/api';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PurchaseOrderTable from './PurchaseOrder/table';
import TablePagination from '@/components/tables/components/TablePagination';
import { hasRole } from '@/utils/roleUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';


export const PurchaseOrder: React.FC = () => {
  const location = useLocation();
  const { setPageContext } = useChatContext();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Check if user has Employee role
  const isEmployee = hasRole(user, 'employee');

  const [activeTab, setActiveTab] = useState('toDos');
  const [details, setDetails] = useState([]);
  const [activeList, setActiveList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchValue, setSearchValue] = useState<string>('');
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    // Get the tab from query parameters and set it as active
    const tabFromQuery = searchParams.get('tab');
    if (tabFromQuery) {
      // If user is Employee and trying to access toDos tab, redirect to createdByList
      if (isEmployee && tabFromQuery === 'toDos') {
        setActiveTab('createdByList');
      } else {
        setActiveTab(tabFromQuery);
      }
    }
  }, [searchParams, isEmployee]);

  useEffect(() => {
    getList();

  }, []);

  useEffect(() => {
    const modelName = 'purchase_order';
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
    workflowAPI.getAll('purchase_order')
      .then((res: any[]) => {
        setDetails(res);
        setIsLoading(false);
      }).catch((err) => {
        console.log(err);
        setIsLoading(false);
      })
  }
  useEffect(() => {
    if (activeTab === 'toDos') {
      const assigned = details?.['assignedToList'] || [];
      const roleBased = details?.['roleBasedList'] || [];
      const createdBy = details?.['createdByList'] || [];
      // Combine lists and remove duplicates based on id
      const draftFromCreatedBy = createdBy.filter((item: any) => item.current_state === 'Pending PO Issue');
      const combinedList = [...assigned, ...roleBased, ...draftFromCreatedBy];
      const uniqueList = Array.from(new Map(combinedList.map(item => [item.id, item])).values());
      setActiveList(uniqueList);
    } else {
      const createdBy = details['createdByList'] || [];
      const nonDraftFromCreatedBy = createdBy.filter((item: any) => item.current_state !== 'Pending PO Issue');
      setActiveList(nonDraftFromCreatedBy);
    }
  }, [activeTab, details]);


  const handleAction = (id: string, status) => {
    if (activeTab === 'createdByList' && status !== "13") {
      navigate(`/purchases/orders/${id}/view/purchase_order_view`);
    } else {
      navigate(`/purchases/orders/${id}/state/${status}`);
    }
  };

  const handleCreate = () => {
    workflowAPI.create("purchase_order", '13', {
      status: '13',
    })
      .then((res: any) => {
        navigate(`/purchases/orders/${res?.data?.id}/state/13`)
      }).catch((err) => {
        const { response } = err;
        console.log("Error :", err.message);
      });
  };

  // Filter controls for the header
  const filterControls = (
    <>

      <div className="flex items-center gap-2">
        <Button onClick={handleCreate} className="flex items-center gap-2 bg-primary hover:bg-primary/90">
          <Plus size={16} /> Create New
        </Button>
      </div>
    </>
  );
  const onSearch = async (value: any) => {


  };
  const searchableKeys = ['po_number', 'supplier_name', 'current_state', 'po_date', 'total_price'];
  const getSearchValue = (req: any, key: string) => {
    switch (key) {
      case 'po_number':
        return req?.purchase_orders?.[0]?.po_number ?? '';
      case 'supplier_name':
        return req?.purchase_orders?.[0]?.supplier_details?.supplier_name ?? '';

      case 'current_state':
        return req?.current_state ?? '';
      case 'po_date':
        return req?.purchase_orders?.[0]?.po_date
          ? new Date(req.purchase_orders[0].po_date).toLocaleDateString('en-GB')
          : '';
      case 'total_price':
        return req?.purchase_orders?.[0]?.total_price?.toString() ?? '';
      default:
        return req[key] ?? '';
    }
  };
  const filteredPurchaseOrder = activeList.filter((req: any) => {
    if (!searchValue) return true;
    const rowContent = searchableKeys
      .map((key) => getSearchValue(req, key))
      .join(' ')
      .toLowerCase();
    return rowContent.includes(searchValue.toLowerCase());
  });
  // Calculate pagination
  const totalPages = Math.ceil(filteredPurchaseOrder.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPurchaseOrders = filteredPurchaseOrder.slice(startIndex, startIndex + itemsPerPage);

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
        title="Purchase Order"
        icon={<FileText className="text-primary" size={24} />}
        actionButton={filterControls}
        contentClassName="p-0"
        onSearch={onSearch}
        searchValue={searchValue}
        searchPlaceholder="Search Purchase Orders..."
        onSearchValueChange={setSearchValue}
      >

        <Tabs defaultValue="createdByList" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full ${isEmployee ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {!isEmployee && <TabsTrigger value="toDos">To Dos</TabsTrigger>}
            <TabsTrigger value="createdByList">Raised by Me</TabsTrigger>
          </TabsList>
          {isLoading ? (
            <div className="p-4">
              <SkeletonLoader />
            </div>
          ) : (
            <>
              <TabsContent value="toDos" className="mt-0">
                <PurchaseOrderTable data={paginatedPurchaseOrders} handleAction={handleAction} />
              </TabsContent>
              <TabsContent value="createdByList" className="mt-0">
                <PurchaseOrderTable data={paginatedPurchaseOrders} handleAction={handleAction} />
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

