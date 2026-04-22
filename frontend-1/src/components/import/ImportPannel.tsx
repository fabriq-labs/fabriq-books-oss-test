import React, { useEffect, useState } from "react";
import { Card, notification } from "antd";
import { importAPI, viewAPI } from "@/api/api";
import { buildDataWithLookupFields, fetchColumns } from "./utils/upload";
import { CSVMapper } from "./CsvMapper";
import { UploadManager } from "./UploadManager";
import { ChevronLeft, FileText, Upload, Download } from "lucide-react";
import { Button } from "../ui/button";
import { useToast } from "@/components/ui/use-toast";
import { importExtensionRegistry } from "@/features/import-extensions";

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
  const [pdfCategorizationMode, setPdfCategorizationMode] = useState<"extract_only" | "extract_and_categorize">("extract_only");

  // Get import extension for this model type (if any)
  const extension = importExtensionRegistry.getForModel(modelType);

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
    uploadOptions?: { categorizeInExtraction?: boolean }
  ) => {
    try {
      let csvContent: string;
      let categorizations: any[] = [];

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
        });

        csvContent = result.csvContent;
        categorizations = result.categorizations || [];
      } else {
        // Generic PDF parsing for models without extensions
        const res: any = await importAPI.parseDocument(modelType, file);

        if (!res.success) {
          throw new Error(res.error || 'PDF parsing failed');
        }

        const transactions = res.data?.transactions || [];
        if (transactions.length === 0) {
          throw new Error('No transactions found in the PDF');
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

      // Create CSV file object
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      const fileAfterUpload = new File([csvBlob], "extracted-data.csv", {
        type: "text/csv",
      });

      // Set state to trigger CSV mapping flow
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
    setCsvFile(file);
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

    let formattedData: any = {
      ...(relationFieldId && { parentData: { [relationFieldId]: relationId } }),
      mapping: newObj,
      isJSON: true,
      data: csvData,
    };
    if (updateCSVData) {
      formattedData = await updateCSVData(formattedData, relationId);
    }

    try {
      const res: any = await importAPI.uploadJSON(modelType, modelView, formattedData);
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

  const generateSampleCSV = () => {
    if (!filedSets) return;

    // Filter fields that have isColumnShow true and permission update
    const availableFields = Object.entries(filedSets)
      .filter(([_, value]: any) => {
        // Include fields that are either:
        // 1. Directly marked as isColumnShow true and have update permission
        // 2. Have a select relationship with update permission
        return (
          (value?.permission === "update") ||
          (value?.select && Object.values(value.select).includes("update"))
        );
      })
      .map(([key, value]: any) => {
        // If this is a select field, get the display field from select object
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
          tableProps: value.tableProps
        };
      });

    // Remove duplicates based on displayName
    const uniqueFields = availableFields.reduce((acc: any[], current) => {
      const exists = acc.find(item => item.displayName === current.displayName);
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, []);

    // Generate headers
    const headers = uniqueFields.map(field => field.displayName).join(",");

    // Generate sample data row with appropriate data types
    const sampleData = uniqueFields.map(field => {
      if (field.isSelect) {
        // For select fields, use the display field name as sample
        return `Sample ${field.displayField || field.displayName}`;
      }

      // Handle different data types
      switch (field.datatype?.toLowerCase()) {
        case "number":
        case "decimal":
        case "currency":
        case "float":
          return "0.00";
        case "date":
        case "datetime":
          return new Date().toISOString().split('T')[0];
        case "boolean":
          return "false";
        case "string":
        default:
          return `Sample ${field.displayName}`;
      }
    }).join(",");

    // Create CSV content
    const csvContent = `${headers}\n${sampleData}`;

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${modelType}_sample.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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
              onClick={generateSampleCSV}
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
        />
      )}
      {csvContent && csvContent.length > 0 && (
        <CSVMapper
          csvContent={csvContent}
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
          onDiscard={clearImport}
          onUploadComplete={onUploadComplete}
          additionalFileds={additionalFileds}
          onList={onList}
          relationId={relationId}
          relationSelection={relationSelection}
          // Pass AI categorizations from PDF extraction (empty for CSV uploads)
          initialCategorizations={pdfCategorizations}
        />
      )}
      {contextHolder}
    </div>
  );
};