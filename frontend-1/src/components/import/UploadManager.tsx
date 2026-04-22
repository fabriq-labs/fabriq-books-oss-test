import {
  Button,
  Form,
  Radio,
  Select,
  Result,
  Modal,
  notification,
  Upload,
} from "antd";
import React, { useState } from "react";
import { usePapaParse } from "react-papaparse";
import { UploadOutlined } from "@ant-design/icons";
import { SearchDropDown } from "../search_dropdown/dropdown";
export const UploadManager = ({
  isForeign,
  isOpen,
  setIsModalOpen,
  type,
  uploadPdf,
  setCsvContent,
  isLoading,
  onRelationSelectedState,
  uploadCsv,
  isUploading,
  setUploading,
  relationField,
  relationFieldId,
  showPdfCategorizationToggle,
  pdfCategorizationMode,
  onPdfCategorizationModeChange,
}: any) => {
  const [form] = Form.useForm();
  const { readString } = usePapaParse();
  const [relationSelectedState, setRelationSelectedState] = useState(null);
  const [isRelationState, setIsRelationState] = useState(false);
  const [isUploadComplete, setIsUploadComplete] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [api, contextHolder] = notification.useNotification();
  const [isSuccess, setSuccess] = useState<any>({
    status: "success",
    title: "Upload successfully",
  });


  const clearDropdown = () => {
    // setRelationSelectedState(null);
    // form.resetFields([relationField]);
    // setIsRelationState(false);
  };
  const handleCancel = () => {
    setIsModalOpen(false);
    if (isForeign) clearDropdown();
  };

  const handleUpload = ({ file }: any) => {
    handleFileChange(file);
  };

  const handleFileChange = (file: any) => {
    setUploading(true);
    if (type === "pdf") {
      uploadPdf(file, {
        categorizeInExtraction: pdfCategorizationMode === "extract_and_categorize",
      });
      return;
    }

    handleCancel();
    const reader = new FileReader();
    reader.onload = (event: any) => {
      const csvContent = event.target.result;
      readString(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const { data, errors } = results;
          if (errors.length > 0 || data.length === 0) {
            api.error({
              message: "Upload Failed",
              description:
                "The CSV file does not contain the required headers or data values.",
            });
            setUploading(false);
            return;
          }
          setCsvContent(csvContent);
          setUploading(false);

        },
      });
    };
    uploadCsv(file);
    reader.readAsText(file);
  };

  const formatLabel = (label: string) => {
    if (!label) return "";
    return label
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const handleDropdownChange = (value: any) => {
    const selectedName =
      value?.[relationField] ||
      value?.name ||
      "";
    const selectedId = value?.id;

    setRelationSelectedState(selectedName);
    setIsRelationState(!!selectedId);
    onRelationSelectedState(value);
  };
  const handleClear = () => {
    setRelationSelectedState(null);
    setIsRelationState(false);
    form.resetFields([relationField]);
  };
  return (
    <Modal
      width={"50%"}
      height={"100%"}
      title="Enter Your Upload"
      open={isOpen}
      onCancel={() => {
        handleCancel();
      }}
      maskClosable={false}
      footer={[
        <div
          key="footer"
          style={{
            display: "flex",
            width: "100%",
          }}
        >
          <Button key="back" onClick={handleCancel} className="mx-3">
            Cancel
          </Button>
          <Upload
            customRequest={(options) => handleUpload(options)}
            multiple={true}
            accept={type === "csv" ? ".csv" : ".pdf"}
            showUploadList={false}
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={isUploading}
              disabled={isUploading}
            >
              Click to upload {type === "csv" ? "CSV" : "PDF"}
            </Button>
          </Upload>
        </div>,
      ]}
    >
      {isUploadComplete ? (
        <Result
          status={isSuccess?.status}
          title={isSuccess?.title}
          subTitle={isSuccess?.subTitle}
        />
      ) : (
        <>
          {isForeign && isOpen && (
            <Form form={form} layout="vertical">
              <Form.Item
                label={`Select a ${relationField ? formatLabel(relationField) : "Value"}`}
                name="name"
                rules={[{ required: false, message: "Please a Value !" }]}
              >
                <SearchDropDown
                  instanceType={isForeign}
                  instanceSourceKey={relationFieldId}
                  instanceKey="id"
                  instanceLabel={relationField}
                  instanceValue={{
                    id: relationSelectedState,
                    [relationField]: relationSelectedState,
                  }}
                  onSelectItem={(
                    sourceKey: string,
                    key: string,
                    value: string,
                    fields: Record<string, unknown>
                  ) => {
                    handleDropdownChange(value);
                  }}
                  onClear={handleClear}
                  limit="10"
                  searchParams={relationField}
                />
              </Form.Item>
            </Form>
          )}
          {type === "pdf" && showPdfCategorizationToggle && (
            <div className="mt-2">
              <button
                type="button"
                className="text-sm text-[#7D23B2] hover:underline"
                onClick={() => setShowAdvancedOptions((prev) => !prev)}
              >
                {showAdvancedOptions ? "Hide Advanced options" : "Advanced options"}
              </button>
              {showAdvancedOptions && (
                <Form layout="vertical" className="mt-3">
                  <Form.Item label="PDF Processing Mode" className="mb-0">
                    <Radio.Group
                      value={pdfCategorizationMode}
                      onChange={(e) => onPdfCategorizationModeChange?.(e.target.value)}
                    >
                      <Radio value="extract_only">Extract only</Radio>
                      <Radio value="extract_and_categorize">Extract + Categorize</Radio>
                    </Radio.Group>
                    <p className="text-xs text-gray-500 mt-2 mb-0">
                      You can always run Categorize later from the CSV Mapper.
                    </p>
                  </Form.Item>
                </Form>
              )}
            </div>
          )}
        </>
      )}
      {contextHolder}
    </Modal>
  );
};