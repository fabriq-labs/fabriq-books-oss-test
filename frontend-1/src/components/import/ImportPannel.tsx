import React, { useEffect, useMemo, useState } from "react";
import { Card, notification } from "antd";
import { importAPI, viewAPI } from "@/api/api";
import { buildDataWithLookupFields, fetchColumns } from "./utils/upload";
import {
  buildImportSampleCsvUrl,
  responseBodyLooksLikeCsv,
} from "./utils/importSampleCsv";
import { CSVMapper } from "./CsvMapper";
import { UploadManager } from "./UploadManager";
import { ChevronLeft, FileText, Upload, Download } from "lucide-react";
import { Button } from "../ui/button";
import { useToast } from "@/components/ui/use-toast";
import { importExtensionRegistry } from "@/features/import-extensions";
import { PdfParseProgress } from "@/features/import-extensions/types";
import { useEntity } from "@/contexts/EntityContext";

export const ImportPannel = ({
  modelType,
  modelView,
  relation,
  relationField,
  onDiscard,
  onUploadComplete,
  relationFieldId,
  metaData,
  additionalFileds = [],
  updateCSVData,
  onList,
  clearImport,
}: any) => {
  const { toast } = useToast();
  const [type, setType] = useState("");
  const [relationId, setRelationId] = useState("");
  const [relationSelection, setRelationSelection] = useState<any>(null);
  const [csvContent, setCsvContent] = useState<any>("");
  const [csvFile, setCsvFile] = useState<any>("");
  /** Original PDF name when flow came from PDF extraction (synthetic CSV file name is not shown). */
  const [importSourceDisplayName, setImportSourceDisplayName] = useState<
    string | null
  >(null);
  const [isUploading, setUploading] = useState(false);
  const [api, contextHolder] = notification.useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filedSets, setFieldSets] = useState<any>("");
  const [isError, setError] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showableRows, setShowableRows] = useState<number>(10);
  const [pageSize, setPageSize] = useState<number>(10);
  const [showDelete, setShowDelete] = useState(true);
  const [isTableLoader, setTableLoader] = useState(false);
  const [isSubmitLoader, setSubmitLoader] = useState(false);
  const [isUploadComplete, setIsUploadComplete] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<any>([]);
  const [columnsData, setColumnsData] = useState<any[]>([]);
  const [bulkEditData, setBulkEditData] = useState<any>(null);
  const [bulkOriginalData, setBulkOriginalData] = useState<any>([]);
  // Store categorizations from PDF extraction (managed by extension)
  const [pdfCategorizations, setPdfCategorizations] = useState<any[]>([]);
  const [pdfCategorizationMode, setPdfCategorizationMode] = useState<"extract_only" | "extract_and_categorize">("extract_and_categorize");
  const [enableChunking, setEnableChunking] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<PdfParseProgress | null>(null);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);

  // Get import extension for this model type (if any)
  const extension = importExtensionRegistry.getForModel(modelType);
  const { currentEntityId, entities } = useEntity();
  const effectiveEntityId = useMemo(
    () =>
      currentEntityId ??
      entities.find((e) => e.is_it_headquartres)?.id ??
      entities[0]?.id ??
      null,
    [currentEntityId, entities]
  );
  const relationAdditionalFilters = useMemo(
    () =>
      extension?.getRelationAdditionalFilters?.({
        currentEntityId,
        effectiveEntityId,
      }) ?? {},
    [extension, currentEntityId, effectiveEntityId]
  );
  const relationFormLabel = extension?.getRelationFormLabel?.();

  useEffect(() => {
    if (metaData) setFieldSets(metaData);
  }, [metaData]);
  const getFieldSets = () => {
    viewAPI.getAll(modelType, modelView, 1, 10, "", "name")
      .then((res: any) => {
        setFieldSets(res?.metaData);
      })
      .catch((err) => {
        const { response } = err;

        setError({ error: true });
        if (response?.status != 400) {
          setError({
            status: response?.status,
            title: response?.statusText,
            subTitle: response?.data?.error,
          });
        }
      });
  };

  /**
   * PDF Upload Handler
   *
   * If an import extension is registered for this model type and provides
   * handlePdfUpload, delegates to the extension. Otherwise uses generic
   * PDF parsing API.
   *
   * @param file - PDF file selected by user
   */
  const uploadPdf = async (
    file: any,
    uploadOptions?: { categorizeInExtraction?: boolean; enableChunking?: boolean }
  ) => {
    try {
      let csvContent: string;
      let categorizations: any[] = [];
      if (uploadOptions?.categorizeInExtraction) {
        setPdfProgress({ phase: "preparing", message: "Uploading statement…" });
      }

      // Check if extension handles PDF upload
      if (extension?.handlePdfUpload) {
        // Use extension's PDF handler (e.g., posting with categorization)
        const pdfOptions = extension.getPdfUploadOptions?.({
          modelType,
          relationField,
          relationFieldId,
          relationId,
          relationSelection,
        }) || {};
        const result = await extension.handlePdfUpload(file, {
          ...pdfOptions,
          categorizeInExtraction: uploadOptions?.categorizeInExtraction === true,
          enableChunking: uploadOptions?.enableChunking === true,
          onProgress: (progress) => setPdfProgress(progress),
        });

        setCurrentImportId(result?.import_id || null);

        if (result.empty) {
          setUploading(false);
          setIsModalOpen(false);
          toast({
            title: "No transactions to import",
            description:
              result.emptyMessage ||
              "The statement had no transactions for the selected account.",
          });
          return;
        }

        csvContent = result.csvContent;
        categorizations = result.categorizations || [];
      } else {
        // Generic PDF parsing for models without extensions
        const res: any = await importAPI.parseDocument(modelType, file);

        if (!res.success) {
          throw new Error(res.error || 'PDF parsing failed');
        }

        const transactions = res.data?.transactions || [];
        setCurrentImportId(
          res?.metaData?.import_id || res?.import_id || res?.data?.import_id || null
        );
        if (transactions.length === 0) {
          setUploading(false);
          setIsModalOpen(false);
          toast({
            title: "No transactions to import",
            description: "No transactions found in the PDF for this import.",
          });
          return;
        }

        // Transform to CSV format
        const headers = Object.keys(transactions[0]).join(",");
        const values = transactions
          .map((item: any) => {
            return headers
              .split(",")
              .map((key) => {
                let value = item[key];
                if (value === null || value === undefined) {
                  value = "";
                }
                value = String(value);
                if (typeof value === "string") {
                  value = value.replace(/\n/g, " ");
                  value = value.replace(/,/g, "");
                }
                return value;
              })
              .join(",");
          })
          .join("\n");

        csvContent = `${headers}\n${values}`;
      }

      // Store categorizations for passing to CSVMapper
      setPdfCategorizations(categorizations);

      // Create CSV file object (name is for internal use; mapper shows importSourceDisplayName)
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      const pdfBase = file.name.replace(/\.pdf$/i, "").trim();
      const derivedCsvName =
        pdfBase.length > 0 ? `${pdfBase}-extracted.csv` : "extracted-data.csv";
      const fileAfterUpload = new File([csvBlob], derivedCsvName, {
        type: "text/csv",
      });

      // Set state to trigger CSV mapping flow
      setImportSourceDisplayName(file.name);
      setCsvFile(fileAfterUpload);
      setCsvContent(csvContent);
      setUploading(false);
      setIsModalOpen(false);

      // Show success feedback
      const categorizedCount = categorizations.filter((c: any) => c.confidence_score >= 0.5).length;
      toast({
        title: "PDF Processed Successfully",
        description: `Extracted data from ${file.name}${categorizedCount > 0 ? `. ${categorizedCount} pre-categorized by AI.` : ''}`,
      });
    } catch (error: any) {
      setUploading(false);
      api.error({
        message: error?.message || "Failed to process PDF",
        placement: "topRight",
      });
    } finally {
      setPdfProgress(null);
    }
  };

  /* const fetchTaskOutput = async (response: any) => {
    try {
      api.success({
        message: "Task completed!",
        placement: "topRight",
      });
      const res: any = await getOutput("task", response?.id);
      const csvBlob = new Blob([res], { type: "text/csv" });
      const file = new File([csvBlob], "newfile.csv", { type: "text/csv" });
      const headers = Object.keys(res.files[0][0]).join(", ");
      const values = res.files[0]
        .map((item: any) => {
          return Object.values(item)
            .map((value) =>
              value !== undefined && value !== null ? value : ""
            )
            .join(", ");
        })
        .join("\n");
      const formattedText = `${headers}\n${values}`;
      setCsvFile(file);
      setCsvContent(formattedText);
      setUploading(false);
      setIsModalOpen(false);
      onUploadComplete();
    } catch (error) {
      setUploading(false);
      message.error("Failed to fetch task output.");
    }
  }; */

  const handleSelectedState = (value: any) => {
    if (!value) {
      setRelationId("");
      setRelationSelection(null);
      return;
    }

    if (typeof value === "string") {
      setRelationId(value);
      setRelationSelection(null);
      return;
    }

    setRelationId(value.id || "");
    setRelationSelection(value);
  };

  const handleCsv = (file: any) => {
    setImportSourceDisplayName(null);
    setCsvFile(file);
    setCurrentImportId(null);
  };

  const handleDiscardImport = async () => {
    if (currentImportId) {
      try {
        await importAPI.discardImportRun(currentImportId);
      } catch {
        toast({
          title: "Discard failed",
          description: "Unable to discard import run. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }
    clearImport();
    setCurrentImportId(null);
    onDiscard?.();
  };

  const bulkDelete = (setCsvData: any) => {
    setCsvData((prevData: any) =>
      prevData.filter((_: any, index: any) => !selectedRowKeys.includes(index))
    );
    setSelectedRowKeys([]);
  };



  const handleOnServerUpload = async (obj: {
    selectedValues: string[];
    csvData: Record<string, unknown>[];
    lookUpData?: Record<string, unknown>[];
  }) => {
    setSubmitLoader(true);
    const dropDownColumns = obj.selectedValues;
    const tableHeaders = Object.keys(obj.csvData[0]);
    const newObj: Record<string, string> = {};
    dropDownColumns.forEach((key: string, index: number) => {
      newObj[tableHeaders[index]] = key;
    });
    const csvData: Record<string, unknown>[] =
      obj?.lookUpData?.length > 0
        ? (await buildDataWithLookupFields(obj.csvData, obj.lookUpData, filedSets)) as Record<string, unknown>[]
        : obj.csvData;

    const browserFileMeta =
      csvFile && typeof csvFile === "object"
        ? {
          source_file_name: importSourceDisplayName || csvFile?.name,
          source_mime_type: csvFile?.type,
          source_file_size_bytes:
            typeof csvFile?.size === "number" ? csvFile.size : undefined,
        }
        : undefined;

    const importMetaForUpload =
      currentImportId
        ? { import_id: currentImportId }
        : browserFileMeta;

    let formattedData: any = {
      ...(relationFieldId && { parentData: { [relationFieldId]: relationId } }),
      mapping: newObj,
      isJSON: true,
      data: csvData,
      ...(importMetaForUpload && {
        importMeta: {
          ...importMetaForUpload,
        },
      }),
    };
    if (updateCSVData) {
      formattedData = await updateCSVData(formattedData, relationId);
    }
    if (currentImportId) {
      formattedData = {
        ...formattedData,
        importMeta: {
          ...(formattedData?.importMeta || {}),
          import_id: currentImportId,
        },
      };
    }

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("payload", JSON.stringify(formattedData));
      // For PDF flow, binary was already uploaded in parseDocument.
      // On mapper submit, send only mapped data + import_id (no second file upload).
      const shouldAttachBinaryFile = !currentImportId;
      if (shouldAttachBinaryFile && csvFile && typeof File !== "undefined" && csvFile instanceof File) {
        uploadFormData.append("file", csvFile);
      }
      const res: any = await importAPI.uploadData(modelType, modelView, uploadFormData);
      const { message } = res;

      if (message) {
        setUploading(false);
        setIsUploadComplete(true);
        setSubmitLoader(false);
        setTableLoader(false);
        toast({
          title: "Success",
          description: "Upload completed successfully",
        });
        clearImport()

        onUploadComplete(res);
        onList();
      }
    } catch {

      setUploading(false);
      setSubmitLoader(false);
      setTableLoader(false);

    }
  };
  const handleBulkEditChange = (filteredData: any, bulkOriginalData: any) => {
    setBulkEditData(filteredData);
    setBulkOriginalData(bulkOriginalData);
  };

  const handleRefreshList = () => {
    setSelectedRowKeys([]);
  };

  const buildSampleCsvFromMetadata = (): string | null => {
    if (!filedSets) return null;

    const availableFields = Object.entries(filedSets)
      .filter(([_, value]: any) => {
        return (
          value?.permission === "update" ||
          (value?.select && Object.values(value.select).includes("update"))
        );
      })
      .map(([key, value]: any) => {
        const displayField = value?.select
          ? Object.entries(value.select).find(([_, perm]) => perm === "update")?.[0]
          : null;

        return {
          key,
          displayName: value.displayName,
          datatype: value.datatype || value.dataType,
          required: value.required,
          isSelect: !!value.select,
          displayField,
          tableProps: value.tableProps,
        };
      });

    const uniqueFields = availableFields.reduce((acc: any[], current) => {
      const exists = acc.find((item) => item.displayName === current.displayName);
      if (!exists) acc.push(current);
      return acc;
    }, []);

    const headers = uniqueFields.map((field) => field.displayName).join(",");

    const sampleData = uniqueFields
      .map((field) => {
        if (field.isSelect) {
          return `Sample ${field.displayField || field.displayName}`;
        }
        switch (field.datatype?.toLowerCase()) {
          case "number":
          case "decimal":
          case "currency":
          case "float":
            return "0.00";
          case "date":
          case "datetime":
            return new Date().toISOString().split("T")[0];
          case "boolean":
            return "false";
          case "string":
          default:
            return `Sample ${field.displayName}`;
        }
      })
      .join(",");

    return `${headers}\n${sampleData}`;
  };

  const triggerCsvDownload = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  /** Prefer `public/download_csv/{modelType}.csv`; otherwise one row from view metadata. */
  const downloadSampleCsv = async () => {
    try {
      const res = await fetch(buildImportSampleCsvUrl(modelType));
      if (res.ok) {
        const text = await res.text();
        const ct = res.headers.get("content-type");
        if (responseBodyLooksLikeCsv(text, ct)) {
          triggerCsvDownload(text, `${modelType}_sample.csv`);
          toast({
            title: "Sample downloaded",
            description: `Loaded from download_csv/${modelType}.csv`,
          });
          return;
        }
      }
    } catch {
      /* fall back */
    }

    const fromMeta = buildSampleCsvFromMetadata();
    if (fromMeta) {
      triggerCsvDownload(fromMeta, `${modelType}_sample.csv`);
      toast({
        title: "Sample downloaded",
        description:
          "No file at public/download_csv for this model; generated from import columns.",
      });
      return;
    }

    toast({
      title: "No sample available",
      description:
        "Add public/download_csv/{modelType}.csv or open import after metadata loads.",
      variant: "destructive",
    });
  };


  return (
    <div className="flex flex-col items-center min-h-screen ">
      {!csvContent && (
        <div className="w-full max-w-3xl p-6">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900">Import Transactions via CSV</h1>
            <p className="mt-3 text-gray-600">What would you like to do?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 hover:shadow-md transition-shadow border-2 border-gray-100 cursor-pointer" onClick={() => {
              setIsModalOpen(true);
              setType("csv");
            }}>
              <div className="flex flex-col items-center justify-center h-32">
                <Upload className="h-10 w-10 text-gray-700 mb-4" />
                <span className="font-medium text-gray-800">UPLOAD A NEW CSV</span>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-md transition-shadow border-2 border-gray-100 cursor-pointer" onClick={() => {
              setIsModalOpen(true);
              setType("pdf");
            }}>
              <div className="flex flex-col items-center justify-center h-32">
                <FileText className="h-10 w-10 text-gray-700 mb-4" />
                <span className="font-medium text-gray-800">UPLOAD PDF</span>
              </div>
            </Card>
          </div>

          <div className="flex justify-between mt-6">
            <Button
              variant="outline"
              onClick={clearImport}
              className="group flex items-center gap-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Dashboard</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => void downloadSampleCsv()}
              className="group flex items-center gap-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Download Sample CSV</span>
            </Button>
          </div>
        </div>
      )}
      {isModalOpen && (
        <UploadManager
          isForeign={relation}
          isOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
          type={type}
          uploadPdf={uploadPdf}
          setCsvContent={setCsvContent}
          isLoading={isLoading}
          onRelationSelectedState={handleSelectedState}
          uploadCsv={handleCsv}
          isUploading={isUploading}
          setUploading={setUploading}
          relationField={relationField}
          relationFieldId={relationFieldId}
          showPdfCategorizationToggle={modelType === "posting"}
          pdfCategorizationMode={pdfCategorizationMode}
          onPdfCategorizationModeChange={setPdfCategorizationMode}
          enableChunking={enableChunking}
          onEnableChunkingChange={setEnableChunking}
          relationAdditionalFilters={relationAdditionalFilters}
          relationFormLabel={relationFormLabel}
          pdfProgress={pdfProgress}
        />
      )}
      {csvContent && csvContent.length > 0 && (
        <CSVMapper
          csvContent={csvContent}
          importFileName={
            importSourceDisplayName ??
            (typeof csvFile?.name === "string" ? csvFile.name : undefined)
          }
          filedSets={filedSets}
          // onFieldSets={!metaData && getFieldSets}
          onFieldSets={getFieldSets}
          showableRows={showableRows}
          pageSize={pageSize}
          showDelete={showDelete}
          onServerUpload={handleOnServerUpload}
          isSubmitLoader={isSubmitLoader}
          setSelectedRowKeys={setSelectedRowKeys}
          selectedRowKeys={selectedRowKeys}
          bulkDelete={bulkDelete}
          columnsData={columnsData}
          fetchColumns={fetchColumns}
          setColumnsData={setColumnsData}
          handleBulkEditChange={handleBulkEditChange}
          setBulkEditData={setBulkEditData}
          setBulkOriginalData={setBulkOriginalData}
          bulkOriginalData={bulkOriginalData}
          setSubmitLoader={setSubmitLoader}
          handleRefreshList={handleRefreshList}
          modelType={modelType}
          modelView={modelView}
          onDiscard={handleDiscardImport}
          onUploadComplete={onUploadComplete}
          additionalFileds={additionalFileds}
          onList={onList}
          relationId={relationId}
          relationSelection={relationSelection}
          importId={currentImportId}
          // Pass AI categorizations from PDF extraction (empty for CSV uploads)
          initialCategorizations={pdfCategorizations}
        />
      )}
      {contextHolder}
    </div>
  );
};