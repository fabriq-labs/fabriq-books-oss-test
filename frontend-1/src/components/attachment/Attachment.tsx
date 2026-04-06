import React, { useState, useEffect } from "react";
import { Upload, Button, notification, UploadProps } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { attachmentAPI } from "@/api/api";



interface AttachmentProps {
    model: string;
    id: string;
    isViewMode?: any;
    disabled?: boolean;
}

export const Attachment: React.FC<AttachmentProps> = ({
    model,
    id,
    isViewMode,
    disabled
}) => {
    const [fileList, setFileList] = useState<any[]>([]);
    const [uploading, setUploading] = useState<boolean>(false);
    const [api, contextHolder] = notification.useNotification();
    const [data, setData] = useState({});
    useEffect(() => {
        if (id) {
            getAttachmentDetails(model, id);
        }

    }, [model, id]);

    const handleUpload: UploadProps["customRequest"] = async (options) => {
        try {
            setUploading(true);
            const { file } = options;
            const formData = new FormData();
            console.log(formData)
            formData.append("file", file as Blob);
            formData.append("data", JSON.stringify({ name: (file as File).name }));
            const res = await attachmentAPI.create(model, id, formData);
            if (res) {
                api.success({ message: "File uploaded successfully", placement: "bottomRight" });
                setUploading(false);
            }
            setUploading(false);
            getAttachmentDetails(model, id);
        } catch (error: any) {
            api.error({ message: error?.message, placement: "topRight" });
        } finally {
            setUploading(false);
        }
    };
    const getAttachmentDetails = async (type: string, id: string) => {
        try {
            const res = await attachmentAPI.get(type, id);
            if (res) {
                const formattedAttachments = res.map((item: any) => ({
                    uid: item.id,
                    name: item.name,
                    status: "done",
                    url: item.url,
                }));
                setFileList(formattedAttachments);
            }
        } catch (err: any) {
            handleError(err);
        }
    };

    const getAttachmentFileDownload = async (
        attachment_id: string,
        fileName: string
    ) => {
        try {
            const blob = await attachmentAPI.directDownloadFile(model, id, attachment_id);

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            api.success({
                message: "File downloaded successfully!",
                placement: "bottomRight",
            });
        } catch (err: any) {
            console.error("Error in getAttachmentFileDownload:", err);
            handleError(err);
        }
    };

    const handleError = (err: any) => {
        const { response } = err;
        api.error({ message: err?.message, placement: "bottomRight" });
    };

    const handleRemove = async (attachment_id: any) => {
        await attachmentAPI.delete(model, id, attachment_id)
            .then((res: any) => {
                setData(res);
                api.success({
                    message: res.deleteRes.message,
                    placement: "bottomRight",
                });
            })
            .catch((error: any) => {
                throw error;
            });
    };
    return (
        <div className="upload-div">
            <Upload
                fileList={fileList}
                onChange={({ fileList }) => setFileList(fileList as any[])}
                multiple
                customRequest={handleUpload}
                showUploadList={{ showDownloadIcon: true }}
                onDownload={(file) => getAttachmentFileDownload(file.uid, file.name)}
                onRemove={(file) => handleRemove(file.uid)}

            >
                <Button icon={<UploadOutlined />}
                    loading={uploading}
                    disabled={disabled}>
                    Upload
                </Button>
            </Upload>
            {contextHolder}
        </div>
    );
};
