import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePapaParse } from "react-papaparse";
import { filterUniqueRecords } from "./utils/upload";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import { viewAPI } from "@/api/api";
import { importExtensionRegistry, ImportExtensionState } from "@/features/import-extensions";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Info,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

/** Stable row id for table selection / delete; stripped from upload (only on derived table rows). */
const IMPORT_ROW_ID = "__importRowId";

const PRIMARY = "#7028a0";
const BORDER = "#dde3ed";

function rowHasNotAvailableCell(row: Record<string, unknown>) {
  return Object.entries(row).some(
    ([key, cellValue]) =>
      key !== IMPORT_ROW_ID &&
      cellValue &&
      typeof cellValue === "object" &&
      (cellValue as { isNotAvailable?: boolean }).isNotAvailable === true
  );
}

function isTruthyField(v: unknown): v is string {
  if (v === null || v === undefined || v === 0 || v === "0") return false;
  const s = String(v).trim();
  return s.length > 0;
}

function fieldDatatype(filedSets: any, fieldKey: string): string {
  const v = filedSets?.[fieldKey];
  return String(v?.datatype || v?.dataType || "string").toLowerCase();
}

function isNumericType(dt: string) {
  return ["number", "decimal", "currency", "float", "integer", "int"].includes(dt);
}

export const CSVMapper = ({
  csvContent,
  filedSets,
  onFieldSets,
  importFileName,
  showableRows: _showableRows,
  pageSize: _pageSizeProp,
  showDelete: _showDelete,
  onServerUpload,
  isSubmitLoader,
  selectedRowKeys,
  setSelectedRowKeys,
  bulkDelete,
  fetchColumns,
  setColumnsData,
  columnsData: _columnsData,
  handleBulkEditChange: _handleBulkEditChange,
  setBulkEditData: _setBulkEditData,
  setBulkOriginalData: _setBulkOriginalData,
  bulkOriginalData: _bulkOriginalData,
  setSubmitLoader: _setSubmitLoader,
  handleRefreshList: _handleRefreshList,
  modelType,
  modelView: _modelView,
  onDiscard,
  onUploadComplete: _onUploadComplete,
  additionalFileds,
  onList: _onList,
  relationId,
  relationSelection,
  initialCategorizations = [],
}: any) => {
  const extension = importExtensionRegistry.getForModel(modelType);
  const { readString } = usePapaParse();
  const [csvData, setCsvData] = useState<any[]>([]);
  const [list, setList] = useState<any[]>([]);
  const [selectedValues, setSelectedValues] = useState<(string | number | null)[]>([]);
  const [isLookupField, setLookupFields] = useState<Record<string, number>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lookUpData, setLookUpData] = useState<any[]>([]);
  const [lookUpLoader, setLookUpLoader] = useState(false);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [optionalIds, setOptionalIds] = useState<string[]>([]);
  const [mappingPopoverField, setMappingPopoverField] = useState<string | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);

  const lookupPrimedForCsvRef = useRef<string>("");
  const selectedValuesRef = useRef<(string | number | null)[]>([]);
  useEffect(() => {
    selectedValuesRef.current = selectedValues;
  }, [selectedValues]);
  /**
   * Stable reference to the latest `handleDropDownValue` so the lookup-priming
   * effect can call it without listing it as a dependency. Listing it would
   * cause the effect to re-run (and tear down the in-flight loop) every time
   * `handleDropDownValue` mutates `csvData` mid-priming, which would skip
   * subsequent select columns (e.g. Parent Account after Currency).
   */
  const handleDropDownValueRef = useRef<
    (value: any, index: number) => Promise<void>
  >(async () => { });

  const [extensionState, setExtensionState] = useState<ImportExtensionState>({
    isActive: false,
    categorizations: {},
    isProcessing: false,
  });

  const tableHeaders = useMemo(
    () => (csvData.length > 0 ? Object.keys(csvData[0]) : []) as string[],
    [csvData]
  );

  const requiredKeysOrdered = useMemo(() => {
    return list
      .map((item: any) => item.key as string)
      .filter(
        (k: string) =>
          filedSets[k]?.required === true && filedSets[k]?.permission === "update"
      );
  }, [list, filedSets]);

  const optionalKeysInList = useMemo(() => {
    return list
      .map((item: any) => item.key as string)
      .filter(
        (k: string) =>
          filedSets[k]?.permission === "update" &&
          !filedSets[k]?.required ||
          additionalFileds?.some((field: any) => field.key === k)
      );
  }, [list, filedSets]);

  const visibleFieldKeys = useMemo(() => {
    const opt = optionalIds.filter((id) => optionalKeysInList.includes(id));
    return [...requiredKeysOrdered, ...opt];
  }, [requiredKeysOrdered, optionalIds, optionalKeysInList]);

  const mappedFieldCount = useMemo(() => {
    return requiredKeysOrdered.filter((k) => selectedValues.includes(k)).length;
  }, [requiredKeysOrdered, selectedValues]);

  const allRequiredMapped =
    requiredKeysOrdered.length > 0 &&
    mappedFieldCount === requiredKeysOrdered.length;

  const mappedCsvIndices = useMemo(() => {
    const set = new Set<number>();
    selectedValues.forEach((v, i) => {
      if (isTruthyField(v)) set.add(i);
    });
    return set;
  }, [selectedValues]);

  const unusedCsvCount = tableHeaders.length - mappedCsvIndices.size;

  const errorRowCount = useMemo(
    () => csvData.filter((row) => rowHasNotAvailableCell(row)).length,
    [csvData]
  );

  useEffect(() => {
    lookupPrimedForCsvRef.current = "";
    if (csvContent) {
      readString(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          let parsedData: any = results.data;
          parsedData = parsedData?.map((row: any) =>
            Object.keys(row).reduce((acc: any, key: string) => {
              const trimmedKey = key.trim();
              acc[trimmedKey] = row[key];
              return acc;
            }, {})
          );
          const filteredData = parsedData?.filter((row: any) => {
            return (
              Object.keys(row).length === Object.keys(parsedData[0]).length
            );
          });

          const lists = Object.entries(filedSets)
            ?.filter(([, value]: any) => value?.permission === "update")
            .map(([key, value]: any) => ({
              key,
              displayName: value?.displayName || key,
            }));
          const additionalFieldsList = (additionalFileds || []).map((field: any) =>
            typeof field === "string"
              ? { key: field, displayName: filedSets[field]?.displayName || field }
              : field
          );
          const mergedList = [...lists, ...additionalFieldsList];
          const displayNameCount = mergedList.reduce(
            (acc: Record<string, number>, item: any) => {
              const label = item?.displayName || item?.key;
              acc[label] = (acc[label] || 0) + 1;
              return acc;
            },
            {}
          );
          const disambiguatedList = mergedList.map((item: any) => {
            const label = item?.displayName || item?.key;
            if ((displayNameCount[label] || 0) <= 1) return item;
            return {
              ...item,
              displayName: `${label} (${item?.key})`,
            };
          });
          setList(disambiguatedList);

          const headers = Object.keys(filteredData[0] || {});
          const initial: (string | null)[] = Array(headers.length).fill(null);
          const autoOptional = new Set<string>();
          headers.forEach((h, i) => {
            const hl = h.trim().toLowerCase();
            const match = disambiguatedList.find(
              (item: any) =>
                item.key === h.trim() ||
                String(item.displayName || "")
                  .trim()
                  .toLowerCase() === hl
            );
            if (match) {
              initial[i] = match.key;
              const req =
                filedSets[match.key]?.required === true &&
                filedSets[match.key]?.permission === "update";
              if (!req) autoOptional.add(match.key);
            }
          });
          setSelectedValues(initial);
          const optOrdered = disambiguatedList
            .map((x: any) => x.key as string)
            .filter((k: string) => autoOptional.has(k));
          setOptionalIds(optOrdered);

          setCsvData(filteredData);
          setCurrentPage(1);
          setSelectedRowKeys([]);
          setShowOnlyErrors(false);
        },
      });
    }
  }, [csvContent, filedSets]);

  useEffect(() => {
    if (onFieldSets) onFieldSets();
  }, []);

  useEffect(() => {
    if (selectedValues?.some(isTruthyField)) {
      handleTableData(csvData);
      fetchColumns(
        selectedValues.filter(isTruthyField) as string[],
        setColumnsData,
        filedSets
      );
    }
  }, [selectedValues]);

  useEffect(() => {
    if (initialCategorizations?.length > 0 && extension) {
      const catMap: Record<number, any> = {};
      initialCategorizations.forEach((cat: any) => {
        const index = cat.transaction_index;
        if (index !== undefined) {
          catMap[index] = {
            account_id: cat.predicted_account_id,
            account_name: cat.predicted_account_name,
            confidence:
              cat.confidence_score >= 0.8
                ? "high"
                : cat.confidence_score >= 0.5
                  ? "medium"
                  : "low",
            confidence_score: cat.confidence_score,
            reasoning: cat.reasoning,
          };
        }
      });
      setExtensionState((prev) => ({
        ...prev,
        isActive: true,
        categorizations: catMap,
      }));
    }
  }, [initialCategorizations, extension]);

  const handleCategorizationsReceived = (
    categorizations: Record<number, any>,
    options?: { replaceIndices?: number[] }
  ) => {
    setExtensionState((prev) => {
      const nextCategorizations = { ...prev.categorizations };
      if (options?.replaceIndices?.length) {
        options.replaceIndices.forEach((index) => {
          delete nextCategorizations[index];
        });
      }
      Object.entries(categorizations).forEach(([index, value]) => {
        nextCategorizations[Number(index)] = value;
      });
      return {
        ...prev,
        isActive: true,
        categorizations: nextCategorizations,
      };
    });
  };

  const handleTableData = (data: any) => {
    const filteredData = data?.filter((row: any) => {
      return Object.keys(row).length === Object.keys(data[0]).length;
    });
    setCsvData(filteredData);
  };

  const handleSendFileToServer = () => {
    let finalCSVData = csvData.map((item: any) => {
      const record: any = {};
      Object.keys(item).forEach((key) => {
        record[key] = item[key]?.isNotAvailable ? null : item[key];
      });
      return record;
    });
    let finalSelectedValues = selectedValues as string[];

    if (
      extension?.transformDataForUpload &&
      Object.keys(extensionState.categorizations).length > 0
    ) {
      const transformed = extension.transformDataForUpload(
        finalCSVData,
        finalSelectedValues,
        extensionState.categorizations
      );
      finalCSVData = transformed.csvData;
      finalSelectedValues = transformed.selectedValues;
    }

    onServerUpload({
      selectedValues: finalSelectedValues,
      csvData: finalCSVData,
      lookUpData,
    });
  };

  const handleDropDownValue = useCallback(
    async (value: any, index: number) => {
      const normalizedValue =
        value === 0 || value === "0" || value == null || value === ""
          ? 0
          : String(value).trim?.() || value;
      const headers = Object.keys(csvData[0] || {});
      const csvHeaderSelectedKey = headers[index];
      const previousMappedField = selectedValuesRef.current[index];
      const previousFieldConfig = filedSets?.[previousMappedField as string];

      const restoreColumnOriginalValues = (columnKey: string) => {
        if (!columnKey) return;
        setCsvData((prevData: any[]) =>
          prevData.map((row: any) => {
            const currentValue = row?.[columnKey];
            if (
              currentValue &&
              typeof currentValue === "object" &&
              currentValue.isNotAvailable === true
            ) {
              return { ...row, [columnKey]: currentValue.oldValue };
            }
            return row;
          })
        );
      };

      const removeLookupStateForColumn = (columnKey: string, columnIndex: number) => {
        setLookupFields((prev) => {
          const updatedFields: any = { ...prev };
          if (updatedFields?.[columnKey] === columnIndex) {
            delete updatedFields[columnKey];
          }
          return updatedFields;
        });
        setLookUpData((prev: any[]) =>
          prev.filter((entry: any) => entry.index !== columnIndex)
        );
      };

      if (previousFieldConfig?.tableProps?.columnType === "select") {
        restoreColumnOriginalValues(csvHeaderSelectedKey);
        removeLookupStateForColumn(csvHeaderSelectedKey, index);
      }

      setSelectedValues((prevSelectedValues) => {
        const newSelectedValues = [...prevSelectedValues];
        if (isTruthyField(normalizedValue)) {
          const existingIndex = newSelectedValues.findIndex(
            (val, i) => val === normalizedValue && i !== index
          );
          if (existingIndex !== -1) {
            (newSelectedValues as any)[existingIndex] = 0;
          }
        }
        (newSelectedValues as any)[index] =
          normalizedValue === 0 || normalizedValue === "0" ? 0 : normalizedValue;
        return newSelectedValues;
      });

      const fieldKey =
        normalizedValue === 0 || normalizedValue === "0" ? null : String(normalizedValue);
      if (
        fieldKey &&
        filedSets[fieldKey]?.tableProps?.columnType === "select"
      ) {
        try {
          setLookupFields((prev) => ({ ...prev, [csvHeaderSelectedKey]: index }));
          setLookUpLoader(true);
          const searchValues = await filterUniqueRecords(
            csvData,
            csvHeaderSelectedKey
          );
          const filters = [
            {
              field: filedSets[fieldKey]?.tableProps?.selectProps?.instanceLabel,
              operator: "in",
              value: searchValues,
            },
          ];
          const searchPageSize = Array.isArray(searchValues)
            ? searchValues.length
            : 10;
          const lookupResult: any = await viewAPI.search(
            filedSets[fieldKey]?.tableProps?.selectProps?.instanceType,
            `${filedSets[fieldKey]?.tableProps?.selectProps?.instanceType}_view`,
            1,
            searchPageSize,
            undefined,
            filters
          );
          const instanceDetails = lookupResult?.data || [];
          setLookUpData((prev: any[]) => [
            ...prev.filter((entry: any) => entry.index !== index),
            {
              key: fieldKey,
              csvKey: headers[index],
              index,
              lookupData: instanceDetails,
            },
          ]);
          const normalizeLookupValue = (val: any) =>
            val === null || val === undefined ? "" : String(val).trim().toLowerCase();
          const instanceLabel =
            filedSets[fieldKey]?.tableProps?.selectProps?.instanceLabel;
          const lookUpSet = new Set(
            instanceDetails.map((val: any) =>
              normalizeLookupValue(val?.[instanceLabel] ?? val?.name)
            )
          );
          setCsvData((prev) =>
            prev.map((item: any) => {
              const colKey = headers[index];
              const cellValue = item[colKey];
              const normalizedCellValue = normalizeLookupValue(cellValue);
              return {
                ...item,
                [colKey]: lookUpSet.has(normalizedCellValue)
                  ? cellValue
                  : {
                    isNotAvailable: true,
                    oldValue: cellValue,
                  },
              };
            })
          );
          setLookUpLoader(false);
        } catch (error) {
          setLookUpLoader(false);
          console.log(error);
        }
      } else {
        setLookupFields((prev) => {
          const updatedFields = { ...prev };
          delete updatedFields[csvHeaderSelectedKey];
          return updatedFields;
        });
      }
    },
    [csvData, filedSets]
  );

  useEffect(() => {
    handleDropDownValueRef.current = handleDropDownValue;
  }, [handleDropDownValue]);

  useEffect(() => {
    if (!csvData.length) {
      lookupPrimedForCsvRef.current = "";
      return;
    }
    const headers = Object.keys(csvData[0]);
    const fileKey = `${csvData.length}:${headers.join(",")}`;
    if (lookupPrimedForCsvRef.current === fileKey) return;
    lookupPrimedForCsvRef.current = fileKey;
    const sv = selectedValuesRef.current;
    if (sv.length !== headers.length) return;

    // Collect every select-type column that needs priming UP-FRONT, before any
    // `setCsvData` side-effect runs. Holding the list in a local closure keeps
    // the loop alive even though the priming itself mutates `csvData` (which
    // re-renders this effect — the fileKey guard catches the re-run).
    const tasks: Array<{ fieldKey: string; index: number }> = [];
    for (let i = 0; i < sv.length; i++) {
      const fk = sv[i];
      if (!isTruthyField(fk)) continue;
      const fs = filedSets[String(fk)];
      if (fs?.tableProps?.columnType !== "select") continue;
      tasks.push({ fieldKey: String(fk), index: i });
    }

    void (async () => {
      for (const { fieldKey, index } of tasks) {
        try {
          await handleDropDownValueRef.current(fieldKey, index);
        } catch {
          // handleDropDownValue already swallows search errors; keep priming
          // remaining columns even if one lookup fails.
        }
      }
    })();
  }, [csvData, filedSets]);

  const clearFieldMapping = useCallback(
    (fieldKey: string) => {
      const idx = selectedValuesRef.current.findIndex((v) => v === fieldKey);
      if (idx < 0) return;
      void handleDropDownValue(0, idx);
    },
    [handleDropDownValue]
  );

  const mapFieldToCsvColumn = useCallback(
    (fieldKey: string, csvHeader: string | null) => {
      if (!csvHeader) {
        clearFieldMapping(fieldKey);
        return;
      }
      const h = tableHeaders.indexOf(csvHeader);
      if (h < 0) return;
      void handleDropDownValue(fieldKey, h);
    },
    [tableHeaders, handleDropDownValue, clearFieldMapping]
  );

  const removeOptionalField = (fieldKey: string) => {
    setOptionalIds((p) => p.filter((x) => x !== fieldKey));
    clearFieldMapping(fieldKey);
  };

  const hasNotAvailableRows = () =>
    csvData.some((row: any) =>
      Object.values(row).some(
        (cellValue: any) =>
          cellValue &&
          typeof cellValue === "object" &&
          cellValue.isNotAvailable === true
      )
    );

  const tableDataSource = useMemo(() => {
    const withId = csvData.map((row: any, originalIndex: number) => ({
      ...row,
      [IMPORT_ROW_ID]: originalIndex,
    }));
    if (!showOnlyErrors) return withId;
    const errorsOnly = withId.filter((row) => rowHasNotAvailableCell(row));
    if (errorsOnly.length === 0 && withId.length > 0) return withId;
    return errorsOnly;
  }, [csvData, showOnlyErrors]);

  useEffect(() => {
    const stillHasErrors = csvData.some((row: any) =>
      Object.values(row).some(
        (cellValue: any) =>
          cellValue &&
          typeof cellValue === "object" &&
          cellValue.isNotAvailable === true
      )
    );
    if (!stillHasErrors && showOnlyErrors) {
      setShowOnlyErrors(false);
      setCurrentPage(1);
    }
  }, [csvData, showOnlyErrors]);

  const isUploadButtonEnabled = () => {
    const requiredFields = Object.entries(filedSets)
      .filter(
        ([, value]: any) =>
          value?.required === true && value?.permission === "update"
      )
      .map(([key]) => key);
    const allRequiredFieldsMapped = requiredFields.every((field) =>
      selectedValues.includes(field)
    );
    return allRequiredFieldsMapped && !hasNotAvailableRows();
  };

  const totalPages = Math.max(1, Math.ceil(tableDataSource.length / pageSize));
  const pageRows = tableDataSource.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleRowSelection = (originalIndex: number) => {
    setSelectedRowKeys((prev: any[]) =>
      prev.includes(originalIndex)
        ? prev.filter((k) => k !== originalIndex)
        : [...prev, originalIndex]
    );
  };

  const pageRowIds = pageRows.map((r) => r[IMPORT_ROW_ID] as number);
  const allPageSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selectedRowKeys.includes(id));

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedRowKeys((prev: any[]) =>
        prev.filter((k) => !pageRowIds.includes(k))
      );
    } else {
      setSelectedRowKeys((prev: any[]) => {
        const set = new Set([...prev, ...pageRowIds]);
        return Array.from(set);
      });
    }
  };

  const extensionColumns = extension?.getColumns?.(extensionState) || [];
  const showAiCategoryCol = extensionColumns.length > 0;

  const displayName = (fieldKey: string) =>
    list.find((l: any) => l.key === fieldKey)?.displayName || fieldKey;

  const csvIndexForField = (fieldKey: string) =>
    selectedValues.findIndex((v) => String(v) === String(fieldKey));

  const renderCellPlain = (fieldKey: string, row: any) => {
    const idx = csvIndexForField(fieldKey);
    if (idx < 0) {
      return (
        <span className="text-[11px] italic text-[#64748b] text-center block">
          —
        </span>
      );
    }
    const raw = row[tableHeaders[idx]];
    if (raw && typeof raw === "object" && (raw as any).isNotAvailable) {
      const o = raw as { oldValue?: unknown };
      return (
        <span className="inline-flex flex-wrap items-center gap-1 text-xs text-[#64748b]">
          <AlertTriangle className="h-3 w-3 shrink-0 text-[#ef4444]" />
          <span>{String(o.oldValue ?? "")}</span>
          <Badge
            variant="secondary"
            className="bg-[#fee2e2] text-[#b91c1c] font-medium"
          >
            Not available
          </Badge>
        </span>
      );
    }
    const dt = fieldDatatype(filedSets, fieldKey);
    const alignRight = isNumericType(dt);
    const empty =
      raw === null ||
      raw === undefined ||
      (typeof raw === "string" && raw.trim() === "");
    if (empty) {
      return (
        <span className="text-[11px] text-[#64748b]">—</span>
      );
    }
    return (
      <span
        className={cn(
          "text-[13px] text-[#0f172a] tabular-nums",
          alignRight && "block text-right"
        )}
      >
        {String(raw)}
      </span>
    );
  };

  const renderAiCategoryCell = (row: any) => {
    const originalIndex = row[IMPORT_ROW_ID] as number;
    const cat = extensionState.categorizations[originalIndex];
    if (!cat) return <span className="text-[13px] text-[#64748b]">—</span>;
    const badgeClass =
      cat.confidence === "high"
        ? "border-transparent bg-[#dcfce7] text-[#166534]"
        : cat.confidence === "medium"
          ? "border-transparent bg-amber-100 text-amber-900"
          : "border-transparent bg-[#fee2e2] text-[#b91c1c]";
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex max-w-[200px] flex-col gap-1">
              <span className="truncate text-sm font-medium">
                {cat.account_name || "Unknown"}
              </span>
              <Badge variant="outline" className={cn("w-fit text-xs", badgeClass)}>
                {Math.round((cat.confidence_score || 0) * 100)}%
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs text-sm">
              {cat.reasoning || "No reasoning provided"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const pageNumbers = useMemo(() => {
    const n = totalPages;
    if (n <= 5) return Array.from({ length: n }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 5].filter((p) => p <= n);
    if (currentPage >= n - 2)
      return [n - 4, n - 3, n - 2, n - 1, n].filter((p) => p >= 1);
    return [
      currentPage - 2,
      currentPage - 1,
      currentPage,
      currentPage + 1,
      currentPage + 2,
    ];
  }, [totalPages, currentPage]);

  const fileLabel =
    typeof importFileName === "string" && importFileName.length > 0
      ? importFileName
      : "Uploaded file";

  const extensionToolbar = extension?.renderToolbarActions?.({
    modelType,
    csvData,
    selectedValues: selectedValues as string[],
    selectedRowKeys,
    lookUpData,
    filedSets,
    relationId,
    relationSelection,
    onCategorizationsReceived: handleCategorizationsReceived,
  });

  const headerActions = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 border-[#dde3ed] text-[13px]"
        onClick={onDiscard}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Discard
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!isUploadButtonEnabled() || isSubmitLoader}
        className="h-8 bg-[#7028a0] text-white hover:bg-[#591e80] disabled:opacity-40"
        onClick={() => isUploadButtonEnabled() && handleSendFileToServer()}
      >
        {isSubmitLoader ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        Upload CSV
      </Button>
    </div>
  );

  const deleteToolbarButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={selectedRowKeys.length === 0}
      title={
        selectedRowKeys.length === 0 ? "Select one or more rows to delete" : undefined
      }
      className={cn(
        "h-8 text-[13px]",
        selectedRowKeys.length === 0
          ? "cursor-not-allowed border-[#dde3ed] text-[#94a3b8]"
          : "border-red-200 text-red-600 hover:bg-red-50"
      )}
      onClick={() => {
        if (selectedRowKeys.length > 0) bulkDelete(setCsvData);
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </Button>
  );

  return (
    <TooltipProvider>
      <div className="relative pb-24 font-sans text-[14px] leading-normal text-[#0f172a]">
        {/* Page header */}
        <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileSpreadsheet
              className="h-[19px] w-[19px] shrink-0"
              style={{ color: PRIMARY }}
            />
            <div className="min-w-0">
              <h1 className="text-[17px] font-bold leading-tight text-[#111827]">
                Map Columns
              </h1>
              <p className="mt-0.5 text-[12px] text-[#64748b]">
                {fileLabel}&nbsp;·&nbsp;{csvData.length} rows&nbsp;·&nbsp;
                {tableHeaders.length} columns detected
              </p>
            </div>
          </div>
          <div className="hidden sm:flex sm:items-center">{headerActions}</div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 sm:hidden">{headerActions}</div>

        {/* Progress strip */}
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <div
            className="h-1 min-w-[120px] flex-1 rounded-full"
            style={{ background: BORDER }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-[350ms] ease-out"
              style={{
                width: `${requiredKeysOrdered.length ? (mappedFieldCount / requiredKeysOrdered.length) * 100 : 0}%`,
                background: allRequiredMapped ? "#22c55e" : PRIMARY,
              }}
            />
          </div>
          <span className="whitespace-nowrap text-[11px] text-[#64748b]">
            {mappedFieldCount}/{requiredKeysOrdered.length} required
          </span>
          {allRequiredMapped ? (
            <span
              className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#166534]"
              style={{ background: "#dcfce7" }}
            >
              ✓ ready
            </span>
          ) : (
            <span
              className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#92400e]"
              style={{ background: "#fef3c7" }}
            >
              ★ required fields needed
            </span>
          )}
          {unusedCsvCount > 0 && (
            <span className="text-[11px] text-[#64748b]">
              {unusedCsvCount} column{unusedCsvCount !== 1 ? "s" : ""} not mapped
              — that&apos;s OK
            </span>
          )}
        </div>

        {/* Table toolbar */}
        <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold text-[#64748b]">
              {tableDataSource.length} rows
            </span>
            {errorRowCount > 0 && (
              <div className="flex items-center gap-2">
                <Switch
                  id="errors-only"
                  checked={showOnlyErrors}
                  onCheckedChange={(c) => {
                    setShowOnlyErrors(c);
                    setCurrentPage(1);
                  }}
                />
                <Label
                  htmlFor="errors-only"
                  className={cn(
                    "cursor-pointer text-[12px]",
                    showOnlyErrors ? "font-medium text-[#ef4444]" : "text-[#64748b]"
                  )}
                >
                  Errors only ({errorRowCount})
                </Label>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {deleteToolbarButton}
            {extensionToolbar}
            <AddOptionalColumnPopover
              open={addColumnOpen}
              onOpenChange={(v) => {
                setAddColumnOpen(v);
                if (v) setMappingPopoverField(null);
              }}
              candidates={optionalKeysInList.filter(
                (k) => !visibleFieldKeys.includes(k)
              )}
              filedSets={filedSets}
              displayName={displayName}
              onPick={(key) => {
                setOptionalIds((p) => (p.includes(key) ? p : [...p, key]));
                setAddColumnOpen(false);
              }}
            />
          </div>
        </div>

        {/* Table */}
        {csvData.length > 0 && (
          <div
            className="relative overflow-x-auto rounded-lg border bg-white"
            style={{ borderColor: BORDER }}
          >
            {lookUpLoader && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/60">
                <Loader2 className="h-8 w-8 animate-spin text-[#7028a0]" />
              </div>
            )}
            <table
              className="w-full border-collapse text-left"
              style={{ tableLayout: "fixed", minWidth: "100%" }}
            >
              <thead>
                <tr>
                  <th
                    className="border-b bg-[#fafafa] px-2 py-2.5 align-top"
                    style={{ width: 36, borderColor: BORDER }}
                  >
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={() => toggleSelectAllPage()}
                      aria-label="Select all on page"
                      className="border-[#dde3ed] data-[state=checked]:bg-[#7028a0] data-[state=checked]:border-[#7028a0]"
                    />
                  </th>
                  <th
                    className="border-b bg-[#fafafa] px-1 py-2.5 align-top text-[11px] font-semibold text-[#64748b]"
                    style={{ width: 32, borderColor: BORDER }}
                  >
                    #
                  </th>
                  {visibleFieldKeys.map((fieldKey) => {
                    const cfg = filedSets[fieldKey];
                    const isMapped = csvIndexForField(fieldKey) >= 0;
                    const isReq =
                      cfg?.required === true && cfg?.permission === "update";
                    const isLookup = cfg?.tableProps?.columnType === "select";
                    const isOptionalCol = !isReq;
                    return (
                      <th
                        key={fieldKey}
                        className={cn(
                          "group relative border-b px-3.5 pb-2 pt-2.5 align-top",
                          !isMapped && "striped-unmapped"
                        )}
                        style={{ borderColor: BORDER }}
                      >
                        <div className="mb-1 flex items-start justify-between gap-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1">
                            <span className="text-[12px] font-bold text-[#1e293b]">
                              {displayName(fieldKey)}
                            </span>
                            {isReq && (
                              <span className="text-[11px] text-[#ef4444]">★</span>
                            )}
                            {isLookup && (
                              <span
                                className="rounded-full px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-[#0369a1]"
                                style={{ background: "#e0f2fe" }}
                              >
                                lookup
                              </span>
                            )}
                          </div>
                          {isOptionalCol && (
                            <button
                              type="button"
                              title="Remove column"
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#e2e8f0] opacity-0 transition-opacity hover:bg-[#fee2e2] group-hover:opacity-100"
                              onClick={() => removeOptionalField(fieldKey)}
                            >
                              <X className="h-2.5 w-2.5 text-[#64748b]" />
                            </button>
                          )}
                        </div>
                        <CsvMappingPill
                          fieldKey={fieldKey}
                          isMapped={isMapped}
                          csvHeader={
                            isMapped ? tableHeaders[csvIndexForField(fieldKey)] : null
                          }
                          open={mappingPopoverField === fieldKey}
                          onOpenChange={(o) => {
                            setMappingPopoverField(o ? fieldKey : null);
                            if (o) setAddColumnOpen(false);
                          }}
                          tableHeaders={tableHeaders}
                          selectedValues={selectedValues}
                          onPick={(header) => {
                            mapFieldToCsvColumn(fieldKey, header);
                            setMappingPopoverField(null);
                          }}
                          onClear={() => {
                            clearFieldMapping(fieldKey);
                            setMappingPopoverField(null);
                          }}
                          displayFieldName={displayName(fieldKey)}
                        />
                        {!isMapped && (
                          <p className="mt-1 text-[10px] italic text-[#64748b]">
                            {isReq
                              ? "Required — select a column"
                              : "Select a column"}
                          </p>
                        )}
                      </th>
                    );
                  })}
                  {showAiCategoryCol && (
                    <th
                      className="border-b bg-[#fafafa] px-3.5 py-2.5 align-top text-[12px] font-bold text-[#1e293b]"
                      style={{ borderColor: BORDER, width: 180 }}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[#7028a0]">✦</span>
                        AI Category
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        visibleFieldKeys.length + 2 + (showAiCategoryCol ? 1 : 0)
                      }
                      className="px-3 py-8 text-center text-[#64748b]"
                    >
                      No rows to display
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, idx) => {
                    const originalIndex = row[IMPORT_ROW_ID] as number;
                    const hasErr = rowHasNotAvailableCell(row);
                    const sel = selectedRowKeys.includes(originalIndex);
                    return (
                      <tr
                        key={originalIndex}
                        className={cn(
                          "cursor-pointer border-b transition-colors",
                          hasErr && "bg-[#fff8f8] hover:bg-[#fff0f0]",
                          !hasErr && "hover:bg-[#fafafa]",
                          sel && "!bg-[#f5ebf9] hover:!bg-[#f5ebf9]"
                        )}
                        style={{ borderColor: BORDER }}
                        onClick={() => toggleRowSelection(originalIndex)}
                      >
                        <td
                          className="px-2 py-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={sel}
                            onCheckedChange={() =>
                              toggleRowSelection(originalIndex)
                            }
                            className="border-[#dde3ed] data-[state=checked]:bg-[#7028a0] data-[state=checked]:border-[#7028a0]"
                          />
                        </td>
                        <td className="px-1 py-1.5 text-[11px] text-[#64748b]">
                          {(currentPage - 1) * pageSize + idx + 1}
                        </td>
                        {visibleFieldKeys.map((fieldKey) => {
                          const idxCol = csvIndexForField(fieldKey);
                          const isMapped = idxCol >= 0;
                          const dt = fieldDatatype(filedSets, fieldKey);
                          const alignRight = isNumericType(dt);
                          return (
                            <td
                              key={fieldKey}
                              className={cn(
                                "px-3.5 py-1.5 align-middle",
                                !isMapped && "striped-unmapped"
                              )}
                            >
                              {isMapped ? (
                                <div
                                  className={cn(alignRight && "text-right")}
                                >
                                  {renderCellPlain(fieldKey, row)}
                                </div>
                              ) : (
                                <span className="block text-center text-[11px] italic text-[#64748b]">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                        {showAiCategoryCol && (
                          <td
                            className="px-3.5 py-1.5 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {renderAiCategoryCell(row)}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {csvData.length > 0 && (
          <div className="mt-2.5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <span className="text-[12px] text-[#64748b]">
              {tableDataSource.length === 0
                ? "0–0 of 0"
                : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, tableDataSource.length)} of ${tableDataSource.length}`}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                className="flex h-[27px] w-[27px] items-center justify-center rounded border border-[#dde3ed] bg-white text-[12px] disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {pageNumbers.map((pg) => (
                <button
                  key={pg}
                  type="button"
                  className={cn(
                    "flex h-[27px] min-w-[27px] items-center justify-center rounded border px-1 text-[12px] font-medium",
                    pg === currentPage
                      ? "border-[#7028a0] bg-[#7028a0] text-white"
                      : "border-[#dde3ed] bg-white hover:bg-[#f1f5f9]"
                  )}
                  onClick={() => setCurrentPage(pg)}
                >
                  {pg}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                className="flex h-[27px] w-[27px] items-center justify-center rounded border border-[#dde3ed] bg-white text-[12px] disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <div className="relative ml-1">
                <select
                  className="h-[27px] cursor-pointer appearance-none rounded-md border border-[#dde3ed] bg-white py-0 pl-2 pr-7 text-[12px]"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#64748b]" />
              </div>
            </div>
          </div>
        )}

        {/* Sticky footer (mapper scope) */}
        <div
          className="sticky bottom-0 z-20 mt-4 flex flex-col gap-2 border-t border-[#dde3ed] bg-white/95 px-1 py-2 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            {isUploadButtonEnabled() ? (
              <span className="flex items-center gap-2 font-semibold text-[#16a34a]">
                <Check className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  All required fields mapped — ready to import
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-[#64748b]">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  {requiredKeysOrdered.length - mappedFieldCount} required
                  field
                  {requiredKeysOrdered.length - mappedFieldCount !== 1
                    ? "s"
                    : ""}{" "}
                  unmapped — use the pills in the column headers
                </span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {deleteToolbarButton}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#dde3ed]"
              onClick={onDiscard}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!isUploadButtonEnabled() || isSubmitLoader}
              className="h-8 bg-[#7028a0] text-white hover:bg-[#591e80] disabled:opacity-40"
              onClick={() => isUploadButtonEnabled() && handleSendFileToServer()}
            >
              {isSubmitLoader ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload CSV
            </Button>
          </div>
        </div>

        <style>{`
          .striped-unmapped {
            background: repeating-linear-gradient(
              135deg,
              #fafafa,
              #fafafa 6px,
              #f1f5f9 6px,
              #f1f5f9 12px
            );
          }
        `}</style>
      </div>
    </TooltipProvider>
  );
};

function CsvMappingPill({
  fieldKey,
  isMapped,
  csvHeader,
  open,
  onOpenChange,
  tableHeaders,
  selectedValues,
  onPick,
  onClear,
  displayFieldName,
}: {
  fieldKey: string;
  isMapped: boolean;
  csvHeader: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tableHeaders: string[];
  selectedValues: (string | number | null)[];
  onPick: (header: string) => void;
  onClear: () => void;
  displayFieldName: string;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const usedByOther = (header: string, myHeader: string | null) => {
    const idx = tableHeaders.indexOf(header);
    if (idx < 0) return false;
    const v = selectedValues[idx];
    if (!isTruthyField(v)) return false;
    if (myHeader === header) return false;
    return true;
  };

  const filteredHeaders = tableHeaders.filter((h) =>
    h.toLowerCase().includes(q.trim().toLowerCase())
  );
  const available = filteredHeaders.filter(
    (h) => !usedByOther(h, csvHeader)
  );
  const alreadyUsed = filteredHeaders.filter((h) =>
    usedByOther(h, csvHeader)
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-full border-[1.5px] px-2 py-0.5 text-[11px] font-semibold transition-colors",
            isMapped
              ? "border-[#e8d4f2] bg-[#f5ebf9] text-[#7028a0] hover:bg-[#e8d4f2]"
              : "border-[#dde3ed] bg-[#f1f5f9] text-[#64748b] hover:border-[#e8d4f2] hover:bg-[#f5ebf9] hover:text-[#7028a0]",
            open && "shadow-[0_0_0_2px_rgba(112,40,160,0.22)]"
          )}
        >
          {isMapped && csvHeader ? (
            <>
              <span className="text-[10px] opacity-55">←</span>
              <span className="truncate font-mono text-[11px]">{csvHeader}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-70" />
            </>
          ) : (
            <>
              <span className="opacity-60">← Map…</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[232px] border-[#dde3ed] p-0 shadow-[0_8px_32px_rgba(0,0,0,0.13)]"
        sideOffset={6}
      >
        <div className="border-b border-[#dde3ed] px-3 pb-1.5 pt-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
            Map to <span className="normal-case text-[#0f172a]">{displayFieldName}</span>
          </div>
          <Input
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-[27px] rounded-md border-[#dde3ed] text-[12px] focus-visible:ring-[#7028a0]"
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto p-1">
          {available.length > 0 && (
            <>
              <div className="px-2.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
                Available
              </div>
              {available.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-[#f5ebf9]",
                    csvHeader === h && "bg-[#f5ebf9] font-semibold text-[#7028a0]"
                  )}
                  onClick={() => onPick(h)}
                >
                  <span className="truncate font-mono text-[12px]">{h}</span>
                  {csvHeader === h && (
                    <Check className="h-3 w-3 shrink-0 text-[#7028a0]" />
                  )}
                </button>
              ))}
            </>
          )}
          {alreadyUsed.length > 0 && (
            <>
              <div className="my-1 h-px bg-[#dde3ed]" />
              <div className="px-2.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
                Already used
              </div>
              {alreadyUsed.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] opacity-60 hover:bg-[#f5ebf9] hover:opacity-100"
                  onClick={() => onPick(h)}
                >
                  <span className="truncate font-mono text-[12px]">{h}</span>
                  <span className="shrink-0 text-[10px] text-[#64748b]">
                    reassign
                  </span>
                </button>
              ))}
            </>
          )}
          {available.length === 0 && alreadyUsed.length === 0 && (
            <div className="px-3 py-2.5 text-center text-[12px] text-[#64748b]">
              No match
            </div>
          )}
          {csvHeader && (
            <>
              <div className="my-1 h-px bg-[#dde3ed]" />
              <button
                type="button"
                className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] italic text-[#ef4444] hover:bg-[#fef2f2]"
                onClick={onClear}
              >
                ✕ Clear mapping
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddOptionalColumnPopover({
  open,
  onOpenChange,
  candidates,
  filedSets,
  displayName,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidates: string[];
  filedSets: any;
  displayName: (k: string) => string;
  onPick: (k: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border-[1.5px] border-dashed border-[#e8d4f2] bg-[#f5ebf9] px-2.5 py-1 text-[12px] font-semibold text-[#7028a0] transition-colors hover:border-[#7028a0] hover:bg-[#e8d4f2]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add column
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[210px] border-[#dde3ed] p-0 shadow-[0_8px_32px_rgba(0,0,0,0.13)]"
        sideOffset={6}
      >
        <div className="border-b border-[#dde3ed] px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
            Optional schema fields
          </div>
        </div>
        <div className="max-h-[220px] overflow-y-auto p-1">
          {candidates.length === 0 ? (
            <div className="px-3 py-3 text-center text-[12px] text-[#64748b]">
              All optional fields added
            </div>
          ) : (
            candidates.map((k) => (
              <button
                key={k}
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-[#f5ebf9]"
                onClick={() => onPick(k)}
              >
                <span>{displayName(k)}</span>
                {filedSets[k]?.tableProps?.columnType === "select" && (
                  <span className="text-[10px] text-[#64748b]">lookup</span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
