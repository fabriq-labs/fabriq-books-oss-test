import React, { useEffect, useState } from 'react';
import { Card, Form, Input, DatePicker, Select, Checkbox, Typography, Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { UseFormReturn } from 'react-hook-form';
import dayjs from 'dayjs';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { Attachment } from '@/components/attachment/Attachment';

const { TextArea } = Input;
const { Option } = Select;
const { Title } = Typography;

interface PurchaseRequisitionDetailsProps {
    form: UseFormReturn<any>;
    readOnly?: boolean;
    requisitionId?: any;
    details: any;
    setDetails: any;
    onSubmit?: any
    totalPOAmount: any
}

const PurchaseOrderDetails: React.FC<PurchaseRequisitionDetailsProps> = ({ form, readOnly = false, requisitionId, details, setDetails, onSubmit, totalPOAmount }) => {
    const [field, setField] = useState<string | null>(null);
    const isBehalf = details?.on_behalf_of || false;
    React.useEffect(() => {
        if (details) {
            if (details.on_behalf_of !== undefined) {
                form.setValue('on_behalf_of', details.on_behalf_of);
            }
        }
    }, [details, form]);
    const handleBehalfChange = (e: any) => {
        const checked = e.target.checked;
        setDetails({
            ...details,
            on_behalf_of: checked
        });
        form.setValue('on_behalf_of', checked);
    };
    const handleInputChange = (key: any, e: any) => {
        setDetails({
            ...details,
            [key]: e.target.value,
        });
    };
    const handleFieldUpdate = async (fieldName: string) => {
        if (readOnly) return;
        setField(fieldName);
        await onSubmit({ [fieldName]: details[fieldName] });
        setField(null);
    };
    const handleSelectChange = async (
        sourceKey: any,
        key: any,
        value: any,
        fields: any
    ) => {
        setDetails({
            ...details,
            [sourceKey]: value[key],
        });

        await onSubmit({ [sourceKey]: value[key] });
    };
    const handleSelectClear = (sourceKey: any) => {
        setDetails({
            ...details,
            [sourceKey]: "",
        });
    };
    return (
        <Card title="Purchase Order Details" className="h-full">
            <Form layout="vertical" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Form.Item label="PO Number" className='mb-0'>
                        <Input
                            value={details?.po_number}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="PO Date" className='mb-0'>
                        <DatePicker
                            value={dayjs(details?.po_date)}
                            style={{ width: '100%' }}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Need BY Date" className='mb-0'>
                        <Input
                            value={dayjs(details?.need_by_date).format("MM-DD-YYYY")}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="PR Number" className='mb-0'>
                        <Input
                            value={details?.pr_number}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="PR Date" className='mb-0'>
                        <Input
                            value={dayjs(details?.pr_date).format("MM-DD-YYYY")}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item
                        label="Requester"
                        validateStatus={form.formState.errors.requester ? 'error' : undefined}
                        help={form.formState.errors.requester?.message?.toString()}
                        className='mb-0'
                    >
                        <Input
                            value={details?.create_user?.email}
                            onChange={(e) =>
                                handleInputChange("requester", e)
                            }
                            onBlur={() =>
                                handleFieldUpdate("requester")
                            }
                            disabled={true}
                        />
                    </Form.Item>
                    {/* <Form.Item
                        label="Requester Department"
                        validateStatus={form.formState.errors.requesterDepartment ? 'error' : undefined}
                        help={form.formState.errors.requesterDepartment?.message?.toString()}
                    >
                        <Select
                            style={{ width: '100%' }}
                            placeholder="Select department"
                            value={details?.create_user?.department?.name}
                            onChange={(e) =>
                                handleInputChange("requester_department", e)
                            }
                            onBlur={() =>
                                handleFieldUpdate("requester_department")
                            }
                            disabled={readOnly}
                        >

                        </Select>
                    </Form.Item> */}

                    <Form.Item
                        label="Delivery Location"
                        name="location_id"
                        className="md:col-span-1 mb-0"
                    >
                        <SearchDropDown
                            instanceType="location"
                            instanceSourceKey="location_id"
                            instanceKey="id"
                            instanceLabel="location"
                            instanceValue={details?.location}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            searchParams="location"
                        ></SearchDropDown>
                    </Form.Item>

                    <Form.Item
                        label="Deliver To"
                        validateStatus={form.formState.errors.deliverTo ? 'error' : undefined}
                        help={form.formState.errors.deliverTo?.message?.toString()}
                        className="md:col-span-1 mb-0"
                    >
                        <TextArea
                            rows={3}
                            value={`${details?.location?.address || ''}\n${details?.location?.city || ''}, ${details?.location?.state || ''} ${details?.location?.zip_code || ''}\n${details?.location?.country || ''}`}
                            disabled
                        />
                    </Form.Item>

                    <Form.Item
                        label="Attachments"
                        className="md:col-span-1 mb-0"
                    >
                        <Attachment
                            model="purchase_order"
                            id={requisitionId}
                            disabled={readOnly}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Purchase Reason"
                        validateStatus={form.formState.errors.purchaseReason ? 'error' : undefined}
                        help={form.formState.errors.purchaseReason?.message?.toString()}
                        className="md:col-span-1 mb-0"
                    >
                        <TextArea
                            rows={3}
                            value={details?.purchase_reason}
                            disabled
                            onChange={(e) =>
                                handleInputChange("purchase_reason", e)
                            }
                            onBlur={() =>
                                handleFieldUpdate("purchase_reason")
                            }
                        />
                    </Form.Item>
                </div>
            </Form>
        </Card>
    );
};
export default PurchaseOrderDetails;