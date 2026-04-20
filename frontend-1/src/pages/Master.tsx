import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback } from "react";

import { viewAPI, bulkEditAPI, workflowAPI } from "@/api/api";
import DynamicTable from "@/components/masters/DynamicTable";
import { Button } from "@/components/ui/button";
import { Building, Import, Plus, Search, Edit, Trash2 } from "lucide-react";
import { Pagination, Modal } from "antd";
import { ActionButtons } from "@/components/ui/action-buttons";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import ImportPage from "./Import";
import { FilterButton } from "@/components/filter/FilterButton";
import { FilterBadges } from "@/components/filter/FilterBadges";
import { FilterModal } from "@/components/filter/FilterModal";
import { BulkEdit } from "@/components/masters/BulkEdit";
import { EnhancedFilterBadges } from "@/components/filter/EnhancedFilterBadges";
import { useChat as useChatContext } from "@/contexts/ChatContext";
import { getModelDisplayName, getViewName } from "@/utils/modelDisplayNames";
import { BulkAction, MergeRow } from "@/types/bulkActions";
import type { CellHighlightMap } from "@/components/masters/DynamicTable";
import type { CustomRowRenderer, FilterEnhancements } from "@/types/customRowRenderer";

/**
 * Handle exposed to parent components via ref.
 * Allows parents to merge individual rows without triggering a full list reload.
 */
export interface MasterHandle {
  /** Merge one or more rows into the current list by `id`. Does NOT refetch. */
  updateRowsInList: (rows: MergeRow[]) => void;
  /** Remove rows from the current list by `id`. Does NOT refetch. */
  removeRowsFromList: (ids: string[]) => void;
}

interface MasterProps {
  type: string;
  view: string;
  displayName: string;
  sampleFileUrl?: string;
  supportPath?: string;
  CreateModal?: React.ComponentType<any>;
  customActions?: React.ReactNode;
  bulkActions?: BulkAction[];
  listConfig?: {
    enableBulkEdit?: boolean;
    enableImport?: boolean;
    enableFilters?: boolean;
    enableSearch?: boolean;
    enableCreate?: boolean;
    importConfig?: {
      updateCSVData?:
      | (() => void)
      | ((formattedData: any, relationId: any) => any)
      | { formattedData: any; relationId: (arg: any) => any };
      additionalFileds?: any;
      relationFieldId?: string;
      relationField?: string;
      relationView?: string;
      relation?: string;
    };
  };
  actionConfig?: {
    create: "redirect" | "modal";
    edit: "redirect" | "modal";
  };
  filterConfig?: {
    enableFilters?: boolean;
    enableSearch?: boolean;
    dateRangeFilter?: {
      key: string;
      label: string;
    };
  };
  defaultSortOption?: {
    field: string;
    direction: "asc" | "desc";
  };
  defaultFilters?: Record<string, any>;
  /**
   * Filters seeded into the user-controlled filter state on mount.
   *
   * Unlike `defaultFilters` (which are permanent and invisible to the user),
   * `presetFilters` populate `appliedFilters` so they appear as removable badge
   * chips and participate in the normal filter UI lifecycle.
   *
   * ## Virtual composite keys
   * A key of the form `"fieldA_or_fieldB"` is treated as a virtual OR filter.
   * It renders as a single badge and is expanded to a Prisma OR clause before
   * the API call, e.g.:
   *   `account_id_or_credit_account_id: { eq: "abc" }`
   * expands to:
   *   `OR: [{ account_id: { eq: "abc" } }, { credit_account_id: { eq: "abc" } }]`
   *
   * See `expandVirtualFilters` for the expansion logic.
   */
  presetFilters?: Record<string, any>;
  /** Optional content rendered next to the page title (e.g. segmented control) */
  titleExtra?: React.ReactNode;
  /** Optional map of rowId → columnKey for cell-level highlighting */
  cellHighlights?: CellHighlightMap;
  /** Optional render function to inject extra content after a row (e.g. suggestion buttons) */
  renderRowExtra?: (row: any) => React.ReactNode | null;
  /** Optional extra action buttons per row (e.g. Reconcile icon); rendered between Edit and Delete */
  injectRowActions?: (record: any) => React.ReactNode | null;
  isCreate?: boolean;
  /** When `false`, hides the Import button. Omitted or `true` shows it (default: show). */
  isImport?: boolean;
  /** When provided, replaces metadata-generated columns and body rendering in DynamicTable */
  customRowRenderer?: CustomRowRenderer;
  /** Optional per-field filter enhancements (e.g. extra search filters for specific dropdowns) */
  filterEnhancements?: FilterEnhancements;
}

type DateRangeType = {
  from: Date | undefined;
  to: Date | undefined;
};

const Master = forwardRef<MasterHandle, MasterProps>(({
  type,
  view,
  displayName,
  filterConfig,
  defaultSortOption,
  defaultFilters,
  presetFilters,
  listConfig,
  bulkActions,
  supportPath,
  titleExtra,
  cellHighlights,
  renderRowExtra,
  injectRowActions,
  isCreate,
  isImport,
  customRowRenderer,
  filterEnhancements,
}, masterRef) => {
  // Extract import-related config from listConfig.importConfig
  const {
    updateCSVData,
    additionalFileds,
    relationFieldId,
    relationField,
    relationView,
    relation,
  } = listConfig?.importConfig || {};
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { setPageContext } = useChatContext();

  interface MasterData {
    metaData?: any;
    total?: number;
    data?: any[];
  }

  const [masterList, setMasterList] = useState<MasterData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState<string | undefined>(undefined);
  const [searchParam, setSearchParam] = useState<string | undefined>(undefined);
  const [showImport, setShowImport] = useState(false);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  // Seeded from presetFilters on mount so drill-through filters appear as removable badges.
  const [appliedFilters, setAppliedFilters] = useState<Record<string, any>>(
    () => presetFilters ?? {}
  );
  const [filterOutput, setFilterOutput] = useState<string>(
    () => (presetFilters && Object.keys(presetFilters).length > 0 ? JSON.stringify(presetFilters) : "")
  );
  const [filterSearchOutput, setFilterSearchOutput] = useState<any>({});
  // Seeded from presetFilters when a date range key is configured, so the FilterModal
  // date picker reflects drill-through dates on open.
  const [dateRange, setDateRange] = useState<DateRangeType>(() => {
    const dateKey = filterConfig?.dateRangeFilter?.key;
    const vd = dateKey ? presetFilters?.[dateKey] : undefined;
    if (vd?.gte && vd?.lte) {
      return { from: new Date(vd.gte), to: new Date(vd.lte) };
    }
    return { from: undefined, to: undefined };
  });

  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [processingActionId, setProcessingActionId] = useState<string | null>(
    null,
  );

  /**
   * Merge updated rows into masterList.data by `id`.
   * Only updates fields present in the merge row; other fields are preserved.
   * This avoids a full list reload.
   */
  const mergeRowsIntoList = useCallback((rows: MergeRow[]) => {
    if (!rows || rows.length === 0) return;
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    setMasterList((prev) => {
      if (!prev?.data) return prev;
      return {
        ...prev,
        data: prev.data.map((existing) => {
          const updated = rowMap.get(existing.id);
          return updated ? { ...existing, ...updated } : existing;
        }),
      };
    });
  }, []);

  /**
   * Remove rows from the current list by id (e.g. after status changed and row no longer matches filter).
   */
  const removeRowsFromList = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    setMasterList((prev) => {
      if (!prev?.data) return prev;
      const data = prev.data.filter((row) => !idSet.has(row.id));
      return {
        ...prev,
        data,
        total: Math.max(0, (prev.total ?? data.length) - (prev.data.length - data.length)),
      };
    });
  }, []);

  useImperativeHandle(masterRef, () => ({
    updateRowsInList: mergeRowsIntoList,
    removeRowsFromList,
  }), [mergeRowsIntoList, removeRowsFromList]);

  const handleApplyFilters = (filters: Record<string, any>) => {
    setAppliedFilters(filters);
    setFilterOutput(JSON.stringify(filters, null, 2));
  };

  const handleClearFilter = (field: string) => {
    const newFilters = { ...appliedFilters };
    delete newFilters[field];
    setAppliedFilters(newFilters);
    setFilterOutput(JSON.stringify(newFilters, null, 2));
    // Keep dateRange in sync when the date range chip is individually cleared.
    if (field === filterConfig?.dateRangeFilter?.key) {
      setDateRange({ from: undefined, to: undefined });
    }
  };

  const handleClearAllFilters = () => {
    setAppliedFilters({});
    setFilterOutput("");
    setDateRange({ from: undefined, to: undefined });
  };

  useEffect(() => {
    // Reset pagination and import UI when the model/view changes.
    // Do NOT clear appliedFilters here — that would wipe presetFilters seeded on mount.
    // Filter state is only cleared by the user via "Clear All" or closing the import flow.
    setPage(1);
    setPageSize(10);
    setTotal(0);
    setShowImport(false);
    setSelectedRows([]);
  }, [type, view]);

  useEffect(() => {
    setPageContext({
      modelName: type,
      viewName: view,
      recordId: null,
      stateId: null,
      viewId: null,
      modelDisplayName: displayName || getModelDisplayName(type),
      currentPath: location.pathname,
    });

    return () => {
      setPageContext(null);
    };
  }, [type, view, displayName, location.pathname, setPageContext]);

  useEffect(() => {
    return () => {
      setSelectedRows([]);
    };
  }, []);

  useEffect(() => {
    fetchModelData();
  }, [
    page,
    pageSize,
    searchTerm,
    searchParam,
    filterOutput,
    filterSearchOutput,
    defaultFilters,
  ]);

  /**
   * Merges user filters with default filters.
   * If a field exists in both, combine them with AND.
   */
  const mergeFiltersWithAnd = (
    userFilters: Record<string, any>,
    defaultFilters: Record<string, any>,
  ): Record<string, any> => {
    if (!defaultFilters || Object.keys(defaultFilters).length === 0) {
      return userFilters || {};
    }
    if (!userFilters || Object.keys(userFilters).length === 0) {
      return defaultFilters;
    }

    const result: Record<string, any> = {};
    const andConditions: any[] = [];

    // Check user filters - user's explicit selection always wins over defaults
    for (const [key, userValue] of Object.entries(userFilters)) {
      result[key] = userValue;
    }

    // Add default filters that user doesn't have
    for (const [key, defaultValue] of Object.entries(defaultFilters)) {
      if (!(key in userFilters)) {
        result[key] = defaultValue;
      }
    }

    // Merge AND conditions with any existing AND
    if (andConditions.length > 0) {
      const existingAnd = result.AND
        ? Array.isArray(result.AND)
          ? result.AND
          : [result.AND]
        : [];
      result.AND = [...existingAnd, ...andConditions];
    }

    return result;
  };

  /**
   * Expands virtual composite keys (e.g. `account_id_or_credit_account_id`) into
   * proper Prisma OR clauses before the filter object is sent to the API.
   *
   * A virtual key has the form `"fieldA_or_fieldB"` and a value shaped like a
   * normal single-field filter operator object, e.g. `{ eq: "abc" }`.
   * It is rewritten to: `OR: [{ fieldA: <value> }, { fieldB: <value> }]`
   *
   * Any existing `OR` array is preserved and merged.
   *
   * This keeps the badge/chip UI simple (one key → one badge) while allowing
   * OR semantics in the actual query. See Master `presetFilters` JSDoc for usage.
   */
  const expandVirtualFilters = (filters: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};
    const orClauses: any[] = [];

    for (const [key, value] of Object.entries(filters)) {
      const orMatch = key.match(/^(.+?)_or_(.+)$/);
      if (orMatch) {
        const [, fieldA, fieldB] = orMatch;
        orClauses.push({ [fieldA]: value }, { [fieldB]: value });
      } else {
        result[key] = value;
      }
    }

    if (orClauses.length > 0) {
      const existing = result.OR ? (Array.isArray(result.OR) ? result.OR : [result.OR]) : [];
      result.OR = [...existing, ...orClauses];
    }

    return result;
  };

  const fetchModelData = () => {
    setIsLoading(true);
    const sortOption = defaultSortOption
      ? {
        [defaultSortOption.field]: defaultSortOption.direction,
      }
      : {};

    const rawUserFilters = {
      ...JSON.parse(filterOutput || "{}"),
      ...filterSearchOutput,
    };
    // Expand virtual composite keys (e.g. account_id_or_credit_account_id) to OR clauses.
    const userFilters = expandVirtualFilters(rawUserFilters);

    const allFilters = mergeFiltersWithAnd(userFilters, defaultFilters || {});

    viewAPI
      .search(type, view, page, pageSize, searchTerm, allFilters, sortOption)
      // viewAPI.getAll(type, view, page, pageSize, searchTerm, searchParam)
      .then((res: any) => {
        setMasterList(res);
        setTotal(res.total);
        setIsLoading(false);
      })
      .catch((error) => {
        setIsLoading(false);
        console.error("Error fetching data:", error);
      });
  };
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term || undefined);
    setPage(1); // Reset to first page when searching
  };

  const handleFieldChange = (field: string) => {
    setSearchParam(field);
  };

  const handleCreate = () => {
    // Workflow models that need to create a draft record immediately
    const workflowModels: Record<
      string,
      { stateId: string; routePattern: "view" | "state" }
    > = {
      sales_order: { stateId: "3", routePattern: "view" },
      quote: { stateId: "1", routePattern: "view" },
      delivery_challan: { stateId: "6", routePattern: "view" },
      credit_note: { stateId: "7", routePattern: "view" },
      invoice: { stateId: "3", routePattern: "view" },
    };
    const workflowConfig = workflowModels[type];

    if (workflowConfig) {
      // Create draft record immediately using workflowAPI
      workflowAPI
        .create(type, workflowConfig.stateId, {
          status: workflowConfig.stateId,
        })
        .then((res: any) => {
          if (res?.data?.id) {
            // Navigate to view-based route for sales workflow models
            const basePath = supportPath ? `/${supportPath}` : "";

            navigate(`${basePath}/${type}/${res.data.id}/view/${view}`);
          } else {
            toast({
              title: "Error",
              description: "Failed to create record - no ID returned",
              variant: "destructive",
            });
          }
        })
        .catch((err: any) => {
          console.error("Error creating record:", err);
          toast({
            title: "Error",
            description: err.message || "Failed to create record",
            variant: "destructive",
          });
        });
    } else {
      // Regular master data - navigate to empty form
      navigate(`/${type}/view/${view}`);
    }
  };

  const handleView = (id: string) => {
    navigate(`/${type}/${id}/view`);
  };

  const handleEdit = (id: string) => {
    const basePath = supportPath ? `/${supportPath}` : "";

    navigate(`${basePath}/${type}/${id}/view/${view}`);
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: "Are you sure you want to delete this item?",
      content: "This action cannot be undone.",
      okText: "Yes, Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await viewAPI.delete(type, id, view);
          toast({
            title: "Success",
            description: "Item deleted successfully",
          });
          fetchModelData(); // Refresh the data
        } catch (error) {
          console.error("Error deleting item:", error);
          toast({
            title: "Error",
            description: "Failed to delete item",
            variant: "destructive",
          });
        }
      },
    });
  };

  const handleImport = () => {
    setShowImport(true);
  };

  const handleSelectionChange = (rows: any[]) => {
    setSelectedRows(rows);
  };

  const handleBulkEditClose = () => {
    setIsBulkEditOpen(false);
    setSelectedRows([]);
    if (tableRef.current) {
      tableRef.current.clearSelection();
    }
  };

  const handleBulkEditSave = async () => {
    try {
      handleBulkEditClose();
      setSelectedRows([]);
      if (tableRef.current) {
        tableRef.current.clearSelection();
      }
      fetchModelData();
    } catch (error) {
      console.error("Error updating data:", error);
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    Modal.confirm({
      title: "Are you sure you want to delete the selected items?",
      content: `This will delete ${ids?.length} items.`,
      okText: "Yes, Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await bulkEditAPI.bulkDelete(type, view, ids);
          toast({
            title: "Success",
            description: `${ids?.length} items deleted successfully`,
          });
          setSelectedRows([]);
          if (tableRef.current) {
            tableRef.current.clearSelection();
          }
          fetchModelData();
        } catch (error) {
          toast({
            title: "Bulk delete",
            description: "Failed to delete items",
            variant: "destructive",
          });
        }
      },
    });
  };

  /**
   * Generic handler for custom bulk actions
   */
  const handleCustomBulkAction = async (action: BulkAction) => {
    if (selectedRows.length === 0) {
      return;
    }

    // Check visibility
    if (action.isVisible && !action.isVisible(selectedRows)) {
      return;
    }

    // Check if disabled
    if (action.isDisabled && action.isDisabled(selectedRows)) {
      return;
    }

    // Show confirmation if configured
    const executeAction = async () => {
      setProcessingActionId(action.id);
      try {
        const result = await action.onClick(selectedRows, { type, view });

        // If the action returned mergeRows and is configured to use merge mode,
        // merge the rows in-place instead of refetching the full list.
        if (action.returnsMergeRows && result && 'mergeRows' in result && result.mergeRows) {
          mergeRowsIntoList(result.mergeRows);
        } else {
          // Default: refresh data after successful action
          fetchModelData();
        }

        // Clear selection after successful action
        setSelectedRows([]);
        if (tableRef.current) {
          tableRef.current.clearSelection();
        }
      } catch (error: any) {
        // Error toast is handled by the action handler
        // Don't clear selection on error so user can retry
      } finally {
        setProcessingActionId(null);
      }
    };

    if (action.confirmation) {
      Modal.confirm({
        title: action.confirmation.title,
        content:
          typeof action.confirmation.content === "function"
            ? action.confirmation.content(selectedRows)
            : action.confirmation.content.replace(
              "selected",
              selectedRows.length.toString(),
            ),
        okText: action.confirmation.okText || "Yes",
        cancelText: action.confirmation.cancelText || "Cancel",
        onOk: executeAction,
      });
    } else {
      await executeAction();
    }
  };
  const handlePageSizeChange = (current: number, size: number) => {
    setPageSize(size);
    setPage(current); // Reset to first page when changing page size
  };

  const clearImport = () => {
    fetchModelData();
    setShowImport(false);
    handleClearAllFilters();
  };

  const renderActions = (record: any) => {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => handleEdit(record.id)}>
          <Edit size={16} />
        </Button>
        {injectRowActions?.(record)}
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-600"
          onClick={() => handleDelete(record.id)}
        >
          <Trash2 size={16} />
        </Button>
      </div>
    );
  };

  const filterControls = (
    <div className="flex items-center gap-2">
      <Button className="flex items-center gap-2 bg-primary hover:bg-primary/90">
        <Plus size={16} /> Create New
      </Button>
    </div>
  );

  // Add table ref
  const tableRef = useRef<any>(null);

  if (showImport) {
    // Type guard: ensure updateCSVData is a function with the correct signature
    const csvDataUpdater =
      typeof updateCSVData === "function" ? updateCSVData : undefined;

    return (
      <ImportPage
        type={type}
        view={view}
        clearImport={clearImport}
        metaData={masterList?.metaData}
        updateCSVData={csvDataUpdater}
        additionalFileds={additionalFileds}
        relationFieldId={relationFieldId}
        relationField={relationField}
        relationView={relationView}
        relation={relation}
        fetchList={fetchModelData}
      />
    );
  }

  return (
    <>
      <div className="container mx-auto py-6">
        {titleExtra ? (
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-2xl font-bold flex items-center shrink-0">
                <Building className="mr-2" size={24} />
                {displayName}
              </h2>
              {titleExtra}
            </div>
            <div className="flex justify-end gap-2">
              {masterList?.metaData && (
                <FilterButton
                  onClick={() => setIsFilterModalOpen(true)}
                  filterCount={Object.keys(appliedFilters).length}
                  filterConfig={{
                    enableFilters: filterConfig?.enableFilters,
                    enableSearch: filterConfig?.enableSearch,
                  }}
                  setFilterSearchOutput={setFilterSearchOutput}
                  metaData={masterList?.metaData}
                />
              )}
              {isCreate !== false && (
                <Button
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                  onClick={handleCreate}
                >
                  <Plus size={16} />
                  <span>Add {displayName}</span>
                </Button>
              )}
              {isImport !== false && (
                <Button onClick={handleImport} className="flex items-center gap-2">
                  <Import size={16} />
                  <span>Import</span>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold flex items-center">
              <Building className="mr-2" size={24} />
              {displayName}
            </h2>
            <div className="flex gap-2">
              {masterList?.metaData && (
                <FilterButton
                  onClick={() => setIsFilterModalOpen(true)}
                  filterCount={Object.keys(appliedFilters).length}
                  filterConfig={{
                    enableFilters: filterConfig?.enableFilters,
                    enableSearch: filterConfig?.enableSearch,
                  }}
                  setFilterSearchOutput={setFilterSearchOutput}
                  metaData={masterList?.metaData}
                />
              )}
              {isCreate !== false && (
                <Button
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                  onClick={handleCreate}
                >
                  <Plus size={16} />
                  <span>Add {displayName}</span>
                </Button>
              )}
              {isImport !== false && (
                <Button onClick={handleImport} className="flex items-center gap-2">
                  <Import size={16} />
                  <span>Import</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      {/* <FilterBadges
        filters={appliedFilters}
        onClearFilter={handleClearFilter}
        onClearAll={handleClearAllFilters}
        filterConfig={{
          enableFilters: filterConfig?.enableFilters,
          enableSearch: filterConfig?.enableSearch,
        }}
      /> */}
      <EnhancedFilterBadges
        filters={appliedFilters}
        onClearFilter={handleClearFilter}
        onClearAll={handleClearAllFilters}
        filterConfig={{
          enableFilters: filterConfig?.enableFilters,
          enableSearch: filterConfig?.enableSearch,
        }}
      />
      <FilterModal
        isOpen={isFilterModalOpen}
        metaData={masterList?.metaData}
        onClose={() => setIsFilterModalOpen(false)}
        onApplyFilters={handleApplyFilters}
        initialFilters={Object.fromEntries(
          // Strip virtual composite keys (fieldA_or_fieldB) — they represent OR conditions
          // across multiple fields which the FilterModal cannot represent. They remain
          // visible as badge chips in EnhancedFilterBadges with a label that explains
          // the OR semantics (e.g. "Account (debit or credit): X").
          Object.entries(appliedFilters).filter(([key]) => !/_or_/.test(key))
        )}
        filterEnhancements={filterEnhancements}
        dateRangeFilter={{
          ...filterConfig?.dateRangeFilter,
          dateRange: dateRange,
          setDateRange: setDateRange,
        }}
      />
      <BulkEdit
        isOpen={isBulkEditOpen}
        onClose={handleBulkEditClose}
        onSave={handleBulkEditSave}
        selectedRows={selectedRows}
        metaData={masterList?.metaData}
        type={type}
        view={view}
      />
      <div className="w-full space-y-4">
        {/* Search component */}
        {/* {searchableFields.length > 0 && (
                            <SearchBar
                                onSearch={handleSearch}
                                searchableFields={searchableFields}
                                selectedField={searchParam || searchableFields[0]?.key || ''}
                                onFieldChange={handleFieldChange}
                            />
                        )} */}
        {!isLoading && selectedRows.length > 1 && (
          <div className="flex justify-between items-center mb-4 p-3 bg-[#F1F0FB] rounded-md">
            <div className="flex items-center gap-3">
              {/* Default Edit Action - Always rendered if enabled */}
              {listConfig?.enableBulkEdit !== false && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 text-[#9b87f5] border-[#9b87f5] hover:bg-[#E5DEFF]"
                  onClick={() => setIsBulkEditOpen(true)}
                >
                  <Edit size={16} />
                  <span>Edit</span>
                </Button>
              )}

              {/* Custom Bulk Actions */}
              {bulkActions?.map((action) => {
                // Check visibility
                if (action.isVisible && !action.isVisible(selectedRows)) {
                  return null;
                }

                const isProcessing = processingActionId === action.id;
                const isDisabled = action.isDisabled
                  ? action.isDisabled(selectedRows)
                  : false;

                return (
                  <Button
                    key={action.id}
                    variant={action.variant || "outline"}
                    size="sm"
                    className={`flex items-center gap-1 ${action.variant === "destructive"
                      ? "text-red-500 hover:text-red-600 border-red-300 hover:bg-red-50"
                      : "text-[#9b87f5] border-[#9b87f5] hover:bg-[#E5DEFF]"
                      }`}
                    onClick={() => handleCustomBulkAction(action)}
                    disabled={isProcessing || isDisabled}
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        {action.icon}
                        <span>{action.label}</span>
                      </>
                    )}
                  </Button>
                );
              })}

              {/* Default Delete Action - Always rendered */}
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1 text-red-500 hover:text-red-600 border-red-300 hover:bg-red-50"
                onClick={() =>
                  handleBulkDelete(selectedRows?.map((row) => row.id))
                }
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </Button>
            </div>
            <div className="text-sm font-medium text-[#403E43]">
              {selectedRows.length} items selected
            </div>
          </div>
        )}
        <DynamicTable
          ref={tableRef}
          data={masterList}
          isLoading={isLoading}
          renderActions={renderActions}
          enableMultiSelect={true}
          onSelectionChange={handleSelectionChange}
          cellHighlights={cellHighlights}
          renderRowExtra={renderRowExtra}
          customRowRenderer={customRowRenderer}
        />
        <div
          style={{ marginBottom: "10px" }}
          className="mt-4 mb-10 flex float-right"
        >
          <Pagination
            current={page}
            total={total}
            onChange={handlePageChange}
            onShowSizeChange={handlePageSizeChange}
            showSizeChanger={true}
            pageSizeOptions={["10", "20", "50", "100"]}
            showTotal={(total, range) =>
              `${range[0]}-${range[1]} of ${total} items`
            }
          />
        </div>
      </div>
    </>
  );
});

Master.displayName = 'Master';
export default Master;
