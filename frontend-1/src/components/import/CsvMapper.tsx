import { useEffect, useState } from "react";
import { usePapaParse } from "react-papaparse";
import {
  Table,
  notification,
} from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { filterUniqueRecords } from "./utils/upload";

import { useNavigate } from "react-router-dom";
import { UploadDropdown } from "./UploadDropdown";
import { Button } from "../ui/button";
import { FileText, Upload, X } from "lucide-react";
import { viewAPI } from "@/api/api";
import { importExtensionRegistry, ImportExtensionState } from "@/features/import-extensions";
// import { BulkEdit } from "@/components/bulk_edit/bulk_edit";

export const CSVMapper = ({
  csvContent,
  filedSets,
  onFieldSets,
  showableRows,
  showDelete,
  onServerUpload,
  isSubmitLoader,
  selectedRowKeys,
  setSelectedRowKeys,
  bulkDelete,
  fetchColumns,
  setColumnsData,
  columnsData,
  handleBulkEditChange,
  setBulkEditData,
  setBulkOriginalData,
  bulkOriginalData,
  setSubmitLoader,
  handleRefreshList,
  modelType,
  modelView,
  onDiscard,
  onUploadComplete,
  additionalFileds,
  onList,
  // Categorizations from PDF extraction (passed from ImportPannel)
  initialCategorizations = [],
}: any) => {
  // Get import extension for this model type (if any)
  const extension = importExtensionRegistry.getForModel(modelType);
  const { readString } = usePapaParse();
  const router = useNavigate();
  const [csvData, setCsvData] = useState<any>([]);
  const [list, setList] = useState<any>([]);
  const [isbulkModeVisible, setBulkModeVisible] = useState<boolean>(false);
  const [selectedValues, setSelectedValues] = useState(Array().fill(null));
  const [isLookupField, setLookupFields] = useState({});
  const [api, contextHolder] = notification.useNotification();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [lookUpData, setLookUpData] = useState<any>([]);
  const [lookUpLoader, setLookUpLoader] = useState(false);

  // Extension state for categorizations (or any extension-specific state)
  const [extensionState, setExtensionState] = useState<ImportExtensionState>({
    isActive: false,
    categorizations: {},
    isProcessing: false,
  });

  useEffect(() => {
    if (csvContent) {
      readString(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          let parsedData: any = results.data;

          parsedData = parsedData?.map((row: any) =>
            Object.keys(row).reduce((acc: any, key) => {
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
          setCsvData(filteredData);
          const lists = Object.entries(filedSets)
            ?.filter(
              ([, value]: any) => value?.permission === "update"
              // value?.permission === "update" && value?.required === true
            )
            .map(([key, value]: any) => ({
              key: key,
              displayName: value?.displayName || key
            }));
          // Handle additionalFileds - convert to objects if they're strings
          const additionalFieldsList = (additionalFileds || []).map((field: any) =>
            typeof field === 'string'
              ? { key: field, displayName: filedSets[field]?.displayName || field }
              : field
          );
          setList([...lists, ...additionalFieldsList]);
          const allKeys = [...lists.map((item: any) => item.key), ...additionalFieldsList.map((item: any) => item.key)];
          mapSimilarData(allKeys);
          handleTableData(parsedData);
          const columnCount = Object.keys(parsedData[0] || {}).length;
          setSelectedValues((prevSelectedValues) => {
            const newSelectedValues = Array(columnCount).fill(null);
            for (
              let i = 0;
              i < Math.min(prevSelectedValues.length, columnCount);
              i++
            ) {
              newSelectedValues[i] = prevSelectedValues[i];
            }
            return newSelectedValues;
          });
        },
      });
    }
  }, [csvContent, filedSets]);
  useEffect(() => {
    if (selectedValues?.some((value) => value !== null)) {
      handleTableData(csvData);

      fetchColumns(selectedValues, setColumnsData, filedSets);
    }
  }, [selectedValues]);

  useEffect(() => {
    if (onFieldSets) onFieldSets();
  }, []);

  // Initialize extension state from initialCategorizations (if provided)
  useEffect(() => {
    if (initialCategorizations && initialCategorizations.length > 0 && extension) {
      const catMap: Record<number, any> = {};
      initialCategorizations.forEach((cat: any) => {
        const index = cat.transaction_index;
        if (index !== undefined) {
          catMap[index] = {
            account_id: cat.predicted_account_id,
            account_name: cat.predicted_account_name,
            confidence: cat.confidence_score >= 0.8 ? 'high' : cat.confidence_score >= 0.5 ? 'medium' : 'low',
            confidence_score: cat.confidence_score,
            reasoning: cat.reasoning,
          };
        }
      });
      setExtensionState(prev => ({
        ...prev,
        isActive: true,
        categorizations: catMap,
      }));
    }
  }, [initialCategorizations, extension]);

  // Handler for receiving categorizations from extension
  const handleCategorizationsReceived = (categorizations: Record<number, any>) => {
    setExtensionState(prev => ({
      ...prev,
      isActive: true,
      categorizations,
    }));
  };

  const onSelectChange = (newSelectedRowKeys: any) => {
    setSelectedRowKeys(newSelectedRowKeys);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
    ],
  };

  const handleDelete = (index: number) => {
    const absoluteIndex = (currentPage - 1) * pageSize + index;
    setCsvData((prevData: any) => {
      const newData = prevData.filter((_: any, i: any) => i !== absoluteIndex);
      const newPage = Math.max(1, Math.ceil(newData.length / pageSize));
      if (currentPage > newPage) {
        setCurrentPage(newPage);
      }
      return newData;
    });
  };

  const handleSendFileToServer = () => {
    // Clean up CSV data (remove isNotAvailable markers)
    let finalCSVData = csvData.map((item: any) => {
      const record: any = {};
      Object.keys(item).map((key) => {
        record[key] = item[key]?.isNotAvailable ? null : item[key];
      });
      return record;
    });
    let finalSelectedValues = selectedValues;

    // Use extension's transformDataForUpload if available
    if (extension?.transformDataForUpload && Object.keys(extensionState.categorizations).length > 0) {
      const transformed = extension.transformDataForUpload(
        finalCSVData,
        finalSelectedValues,
        extensionState.categorizations
      );
      finalCSVData = transformed.csvData;
      finalSelectedValues = transformed.selectedValues;
    }

    onServerUpload({ selectedValues: finalSelectedValues, csvData: finalCSVData, lookUpData });
  };

  const handleDropDownValue = async (value: any, index: number) => {
    const normalizedValue = value?.trim?.() || value;
    const csvHeaderSelectedKey = Object.keys(csvData[0] || {})[index];
    const previousMappedField = selectedValues[index];
    const previousFieldConfig = filedSets?.[previousMappedField];

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
            return {
              ...row,
              [columnKey]: currentValue.oldValue,
            };
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

    // If previously selected field at this index was a lookup/select, restore the column.
    if (previousFieldConfig?.tableProps?.columnType === "select") {
      restoreColumnOriginalValues(csvHeaderSelectedKey);
      removeLookupStateForColumn(csvHeaderSelectedKey, index);
    }

    setSelectedValues((prevSelectedValues) => {
      const newSelectedValues = [...prevSelectedValues];
      const existingIndex = newSelectedValues.findIndex(
        (val, i) => val === normalizedValue && i !== index
      );
      if (existingIndex !== -1) {
        newSelectedValues[existingIndex] = 0;
      }
      newSelectedValues[index] = normalizedValue;
      return newSelectedValues;
    });

    if (
      filedSets[normalizedValue] &&
      filedSets[normalizedValue]?.tableProps?.columnType === "select"
    ) {
      try {
        setLookupFields({ ...isLookupField, [csvHeaderSelectedKey]: index });
        setLookUpLoader(true);
        const searchValues = await filterUniqueRecords(
          csvData,
          csvHeaderSelectedKey
        );
        const filters = [
          {
            field: filedSets[normalizedValue]?.tableProps?.selectProps?.instanceLabel,
            operator: "in",
            value: searchValues,
          },
        ];
        // Ensure searchValues is an array for length, fallback to 10
        const pageSize = Array.isArray(searchValues) ? searchValues.length : 10;
        const lookupResult: any = await viewAPI.search(
          filedSets[normalizedValue]?.tableProps?.selectProps?.instanceType,
          `${filedSets[normalizedValue]?.tableProps?.selectProps?.instanceType}_view`,
          1,
          pageSize,
          undefined,
          filters
        );
        const instanceDetails = lookupResult?.data || [];
        setLookUpData((prev: any[]) => [
          ...prev.filter((entry: any) => entry.index !== index),
          {
            key: normalizedValue,
            csvKey: Object.keys(csvData[0])[index],
            index: index,
            lookupData: instanceDetails,
          },
        ]);
        const lookUpArray = instanceDetails.map(
          (val: any) =>
            val?.name ||
            val?.[filedSets[normalizedValue]?.tableProps?.selectProps?.instanceLabel]
        );
        const updateCSVData = csvData.map((item: any) => {
          return {
            ...item,
            [Object.keys(csvData[0])[index]]: lookUpArray.includes(
              item[Object.keys(csvData[0])[index]]
            )
              ? item[Object.keys(csvData[0])[index]]
              : {
                isNotAvailable: true,
                oldValue: item[Object.keys(csvData[0])[index]],
              },
          };
        });
        setCsvData(updateCSVData);
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
  };

  const handleTableData = (data: any) => {
    const filteredData = data?.filter((row: any) => {
      return Object.keys(row).length === Object.keys(data[0]).length;
    });
    setCsvData(filteredData);
  };

  const handleCancel = () => {
    onDiscard();
  };

  const handleEditShowModal = () => {
    setBulkModeVisible(true);
  };

  const handleBulkEditCancel = () => {
    setBulkModeVisible(false);
  };

  const updateTransformedData = (transformedData: any) => {
    setCsvData((prevData: any) =>
      prevData.map((row: any, rowIndex: number) => {
        if (selectedRowKeys.includes(rowIndex)) {
          const updatedRow = { ...row };

          columns.forEach((col: any, index: number) => {
            const originalColumnKey = col.key;
            const mappedColumnKey = selectedValues[index];

            if (transformedData[mappedColumnKey] !== undefined) {
              updatedRow[originalColumnKey] = transformedData[mappedColumnKey];
            }
          });

          return updatedRow;
        }

        return row;
      })
    );
  };

  const mapSimilarData = (filedSets: any) => {
    if (columns.length == 0) {
      return;
    }
    columns?.map((item: any, i: any) => {
      if (filedSets?.includes(item?.key?.trim())) {
        handleDropDownValue(item?.key?.trim(), i);
      }
    });
  };

  const hasNotAvailableRows = () => {
    return csvData.some((row: any) => {
      return Object.values(row).some((cellValue: any) => {
        return cellValue && typeof cellValue === 'object' && cellValue.isNotAvailable === true;
      });
    });
  };

  const isUploadButtonEnabled = () => {
    const requiredFields = Object.entries(filedSets)
      .filter(
        ([, value]: any) =>
          value?.required === true && value?.permission === "update"
      )
      .map(([key]) => key);
    const allRequiredFieldsMapped = requiredFields.every((field) => selectedValues.includes(field));
    const noNotAvailableRows = !hasNotAvailableRows();
    return allRequiredFieldsMapped && noNotAvailableRows;
  };

  // Get extension columns if available
  const extensionColumns = extension?.getColumns?.(extensionState) || [];

  const columns: any =
    csvData && csvData.length > 0
      ? [
        ...Object.keys(csvData[0] || {}).map((key: any, index: number) => ({
          title: <div>{
            key && key.trim()}
            {isLookupField[key?.trim()] == index &&
              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-purple-600 rounded-full ml-2">Lookup</span>}
          </div>,
          dataIndex: key && key.trim(),
          key: key && key.trim(),
          render: (record: any) =>
            record.isNotAvailable ? (
              <div className="flex gap-y-1 flex-wrap">
                <span className="bg-red-500 text-white px-2 py-1 rounded text-xs">
                  {record.oldValue}
                  <span className="ml-1 font-medium">(Not Available)</span>
                </span>
              </div>
            ) : (
              record
            ),
        })),
        // Extension-provided columns (e.g., AI Category column for posting)
        ...extensionColumns,
        ...(showDelete
          ? [
            {
              title: "Action",
              key: "action",
              align: "center",
              render: (_: any, __: any, index: number) => (
                <DeleteOutlined
                  onClick={() => handleDelete(index)}
                  style={{ color: "#7D23B2", cursor: "pointer" }}
                />
              ),
            },
          ]
          : []),
      ]
      : [];
  const updatePagination = (pagination: any, filters: any) => {
    setCurrentPage(pagination);
    setPageSize(filters);
  };
  return (
    <div className="container mx-auto py-6">
      <div className="">
        {/* <Card> */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold flex items-center">
            <FileText className="mr-2" size={24} />
            Data for Import
          </h2>
          <div className="flex gap-2">
            {/* Extension-provided toolbar actions (e.g., Categorize button for posting) */}
            {extension?.renderToolbarActions?.({
              modelType,
              csvData,
              selectedValues,
              lookUpData,
              filedSets,
              onCategorizationsReceived: handleCategorizationsReceived,
            })}
            <Button className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600" onClick={handleCancel}>
              <X size={16} />
              <span>Discard</span>
            </Button>
            {isUploadButtonEnabled() && <Button onClick={handleSendFileToServer}
              // loading={isSubmitLoader}
              disabled={isSubmitLoader} className="flex items-center gap-2">
              <Upload size={16} />
              <span>Upload CSV</span>
            </Button>}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
          }}
          className="item-header mb-2 gap-3"
        >

          {selectedRowKeys.length > 1 && (
            <div className="d-flex gap-3">
              <DeleteOutlined
                onClick={() => bulkDelete(setCsvData)}
                style={{ color: "#7D23B2", cursor: "pointer" }}
              />
              <EditOutlined
                onClick={handleEditShowModal}
                style={{ color: "#7D23B2", cursor: "pointer" }}
              />
            </div>
          )}
        </div>
        {csvData.length > 0 && (
          <div className="grid grid-cols-1 gap-4 my-2 mx-3">
            <div className="col-span-1">
              <Table
                columns={columns}
                // style={{ width: "100%" }}
                dataSource={csvData}
                loading={lookUpLoader}
                pagination={{
                  current: currentPage,
                  pageSize: pageSize,
                  total: total,
                  onChange: updatePagination,
                  showSizeChanger: true,
                  pageSizeOptions: ["10", "20", "50", "100"],
                }}
                rowKey={(record, index) => index ?? 0}
                rowSelection={rowSelection}
                components={{
                  header: {
                    wrapper: (props: any) => (
                      <>
                        <thead>
                          <tr>
                            <th className="ant-table-cell" />
                            {columns
                              ?.filter((item: any) => item?.key !== "action")
                              ?.map((col: any, index: number) => (
                                <th
                                  className="ant-table-cell"
                                  key={`${index + 1}`}
                                >
                                  <UploadDropdown
                                    list={list?.length > 0 ? list : []}
                                    value={selectedValues[index] || 0}
                                    index={index}
                                    className="csvmapper"
                                    onChange={(value: any) =>
                                      handleDropDownValue(value, index)
                                    }
                                  />
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <thead {...props} />
                      </>
                    ),
                  },
                }}
                scroll={{
                  x: columns.length > 5 ? columns.length * 250 : "100%",
                  y: 500,
                }}
              />
            </div>
          </div>)}
        {/* <div className="form-footer my-5 px-5 flex justify-end">
          <Button onClick={handleCancel}>Discard</Button>
          {isUploadButtonEnabled() && (
            <Button
              type="primary"
              onClick={handleSendFileToServer}
              loading={isSubmitLoader}
              disabled={isSubmitLoader}
            >
              Upload CSV
            </Button>
          )}
        </div> */}
        {/* </Card> */}

      </div>


      {/* <Modal
        width={"50%"}
        open={isbulkModeVisible}
        onCancel={handleBulkEditCancel}
        footer={null}
      >
        {columnsData?.length > 0 && (
          <BulkEdit
            onApplyFilter={handleBulkEditChange}
            setFilterData={setBulkEditData}
            setFilterOriginalData={setBulkOriginalData}
            filteredData={bulkOriginalData}
            filedSets={columnsData}
            selectedRowKeys={selectedRowKeys}
            setSelectedRowKeys={setSelectedRowKeys}
            isSubmitLoader={isSubmitLoader}
            setSubmitLoader={setSubmitLoader}
            onCloseModel={handleBulkEditCancel}
            onRefresh={handleRefreshList}
            isCsvmapper={true}
            updateTransformedData={updateTransformedData}
          />
        )}
      </Modal> */}
      {/* {contextHolder} */}
    </div>
  );
};
