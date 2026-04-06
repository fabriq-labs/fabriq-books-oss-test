import React, { useState, useEffect, useMemo } from 'react';
import RequisitionList from '@/components/purchase-requisition/RequisitionList';
import { ListCard } from '@/components/ui/list-card';
import { FileText, Plus, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { log } from 'console';
import { viewAPI, workflowAPI } from '@/api/api';

import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import RequisitionTable from './PurchaseRequisition/RequisitionTable';
import PurchaseOrderTable from './PurchaseOrder/table';
import InvoiceTable from './Invoice/table';
import EmailIngestList from './Invoice/EmailIngestList';
import TablePagination from '@/components/tables/components/TablePagination';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';

export const Invoice: React.FC = () => {
  const location = useLocation();
  const { setPageContext } = useChatContext();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('toDos');
  const [details, setDetails] = useState([]);
  const [activeList, setActiveList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchValue, setSearchValue] = useState<string>('');
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [sortOption, setSortOption] = useState<{ field?: string; direction?: 'asc' | 'desc' }>({
    field: 'modified_at',
    direction: 'desc'
  });

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
    const modelName = 'invoice';
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
    workflowAPI.getAll('invoice')
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
      const assigned = details['assignedToList'] || [];
      const roleBased = details['roleBasedList'] || [];
      const createdBy = details['createdByList'] || [];
      const draftFromCreatedBy = createdBy.filter((item: any) => item.current_state === 'Draft');
      const combinedList = [...assigned, ...roleBased, ...draftFromCreatedBy];
      const uniqueList = Array.from(new Map(combinedList.map(item => [item.id, item])).values());
      setActiveList(uniqueList);
    } else {
      const createdBy = details['createdByList'] || [];
      const nonDraftFromCreatedBy = createdBy.filter((item: any) => item.current_state !== 'Draft');
      setActiveList(nonDraftFromCreatedBy);
    }
  }, [activeTab, details]);



  const handleAction = (id: string, status) => {
    if (activeTab === 'createdByList' && status !== "9") {
      navigate(`/purchases/bills/${id}/view/invoice_view`);
    } else {
      navigate(`/purchases/bills/${id}/state/${status}`);
    }
  };

  const handleCreate = () => {
    workflowAPI.create("invoice", '9', {
      status: '9',
    })
      .then((res: any) => {
        navigate(`/purchases/bills/${res?.data?.id}/state/9`)
      }).catch((err) => {
        const { response } = err;
        console.log("Error :", err.message);
      });
  };

  const handleUploadPDF = () => {
    navigate('/purchases/bills/upload');
  };

  // Filter controls for the header
  const filterControls = (
    <>
      <div className="flex items-center gap-2">
        <Button
          onClick={handleUploadPDF}
          variant="outline"
          className="flex items-center gap-2 border-primary text-primary hover:bg-primary hover:text-white"
        >
          <Upload size={16} /> Upload PDF
        </Button>
        <Button onClick={handleCreate} className="flex items-center gap-2 bg-primary hover:bg-primary/90">
          <Plus size={16} /> Create New
        </Button>
      </div>
    </>
  );
  const onSearch = async (value: any) => {

  }


  const searchableKeys = ['invoice_number', 'invoice_date', 'current_state', 'invoice_total'];
  const getSearchValue = (req: any, key: string) => {
    switch (key) {
      case 'invoice_number':
        return req?.invoices?.[0]?.invoice_number ?? '';

      case 'current_state':
        return req?.current_state ?? '';
      case 'invoice_date':
        return req?.invoices?.[0]?.po_date
          ? new Date(req.invoices[0].po_date).toLocaleDateString('en-GB')
          : '';
      case 'invoice_total':
        return req?.invoices?.[0]?.invoice_total?.toString() ?? '';
      default:
        return req[key] ?? '';
    }
  };

  const filteredInvoices = activeList.filter((req: any) => {
    if (!searchValue) return true;
    const rowContent = searchableKeys
      .map((key) => getSearchValue(req, key))
      .join(' ')
      .toLowerCase();
    return rowContent.includes(searchValue.toLowerCase());
  });

  // Sort the filtered invoices
  const sortedInvoices = useMemo(() => {
    if (!sortOption.field || !sortOption.direction) {
      return filteredInvoices;
    }

    return [...filteredInvoices].sort((a: any, b: any) => {
      let aValue: any;
      let bValue: any;

      switch (sortOption.field) {
        case 'invoice_number':
          aValue = a?.invoices?.[0]?.invoice_number ?? '';
          bValue = b?.invoices?.[0]?.invoice_number ?? '';
          break;
        case 'invoice_date':
          aValue = a?.invoices?.[0]?.invoice_date ? new Date(a.invoices[0].invoice_date).getTime() : 0;
          bValue = b?.invoices?.[0]?.invoice_date ? new Date(b.invoices[0].invoice_date).getTime() : 0;
          break;
        case 'invoice_total':
          aValue = a?.invoices?.[0]?.invoice_total ?? 0;
          bValue = b?.invoices?.[0]?.invoice_total ?? 0;
          break;
        case 'current_state':
          aValue = a?.current_state ?? '';
          bValue = b?.current_state ?? '';
          break;
        case 'modified_at': {
          // modified_at is at the root level of each invoice workflow instance
          aValue = a?.modified_at ? new Date(a.modified_at).getTime() : 0;
          bValue = b?.modified_at ? new Date(b.modified_at).getTime() : 0;
          break;
        }
        default:
          return 0;
      }

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) return sortOption.direction === 'asc' ? -1 : 1;
      if (bValue === null || bValue === undefined) return sortOption.direction === 'asc' ? 1 : -1;

      // Compare based on type
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOption.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // String comparison
      const aString = String(aValue).toLowerCase();
      const bString = String(bValue).toLowerCase();
      return sortOption.direction === 'asc'
        ? aString.localeCompare(bString)
        : bString.localeCompare(aString);
    });
  }, [filteredInvoices, sortOption]);

  // Calculate pagination
  const totalPages = Math.ceil(sortedInvoices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedInvoices = sortedInvoices.slice(startIndex, startIndex + itemsPerPage);

  // Reset to first page when search or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchValue, sortOption]);
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
        title="Invoice"
        icon={<FileText className="text-primary" size={24} />}
        actionButton={filterControls}
        contentClassName="p-0"
        onSearch={onSearch}
        searchValue={searchValue}
        searchPlaceholder="Search Invoices..."
        onSearchValueChange={setSearchValue}
      >

        <Tabs defaultValue="createdByList" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="toDos">To Dos</TabsTrigger>
            <TabsTrigger value="createdByList">Raised by Me</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>
          {isLoading && activeTab !== 'email' ? (
            <div className="p-4">
              <SkeletonLoader />
            </div>
          ) : (
            <>
              <TabsContent value="toDos" className="mt-0">
                <InvoiceTable data={paginatedInvoices} handleAction={handleAction} sortOption={sortOption} setSortOption={setSortOption} />
              </TabsContent>
              <TabsContent value="createdByList" className="mt-0">
                <InvoiceTable data={paginatedInvoices} handleAction={handleAction} sortOption={sortOption} setSortOption={setSortOption} />
              </TabsContent>
              <TabsContent value="email" className="mt-0">
                <EmailIngestList />
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

