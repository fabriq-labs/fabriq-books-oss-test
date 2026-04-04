/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { Card, Form, Input, DatePicker, Select } from 'antd';
import { UseFormReturn } from 'react-hook-form';
import dayjs from 'dayjs';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { Attachment } from '@/components/attachment/Attachment';



interface PurchaseRequisitionDetailsProps {
    form: UseFormReturn<any>;
    readOnly?: boolean;
    requisitionId?: any;
    details: any;
    setDetails: any;
    onSubmit?: any
}

const InvoiceFormDetails: React.FC<PurchaseRequisitionDetailsProps> = ({ form, readOnly = false, requisitionId, details, setDetails, onSubmit }) => {
    const [field, setField] = useState<string | null>(null);
    const handleInputChange = (key: any, e: any) => {
        const value = e && e.target ? e.target.value : e;
        setDetails({
            ...details,
            [key]: value,
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
        value: any) => {
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
        <Card title="Invoice Details" className="h-full">
            <Form layout="vertical" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Form.Item label="Invoice Type" className='mb-0'>
                        <Select
                            style={{ width: '100%' }}
                            value={details?.invoice_type}
                            disabled={readOnly || details?.invoice_type === 'With PO'}
                            onChange={async (value) => {
                                handleInputChange("invoice_type", value);
                                if (!readOnly) {
                                    await onSubmit({ invoice_type: value });
                                }
                            }}
                            options={[
                                { value: 'With PO', label: 'With PO' },
                                { value: 'Without PO', label: 'Without PO' },
                            ]}
                        />
                    </Form.Item>

                    <Form.Item label="PO Number" className='mb-0'>
                        {details?.invoice_type === 'With PO' ? (
                            <SearchDropDown
                                instanceType="purchase_order"
                                instanceSourceKey="purchase_order_id"
                                instanceKey="id"
                                instanceLabel="po_number"
                                instanceValue={details?.purchase_order}
                                onSelectItem={handleSelectChange}
                                onClear={handleSelectClear}
                                searchParams="po_number"
                                type="invoice"
                                isShowSearch={true}
                                disabled={readOnly || details?.purchase_order}
                            />
                        ) : (
                            <Input disabled placeholder="Only available with PO" />
                        )}
                    </Form.Item>
                    <Form.Item label="Invoice Number" className='mb-0'>
                        <Input
                            value={details?.invoice_number}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="PR Number" className='mb-0'>
                        <Input
                            value={details?.purchase_order?.pr_number}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Invoice Date" className='mb-0'>
                        <DatePicker
                            value={dayjs(details?.invoice_date)}
                            style={{ width: '100%' }}
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
                            value={details?.purchase_order?.create_user?.name}
                            onChange={(e) =>
                                handleInputChange("requester", e)
                            }
                            onBlur={() =>
                                handleFieldUpdate("requester")
                            }
                            disabled={true}
                        />
                    </Form.Item>
                    <Form.Item label="Remit To" className='mb-0'>
                        <Input
                            value={details?.remit_to}
                            onChange={(e) =>
                                handleInputChange("remit_to", e)
                            }
                            onBlur={() =>
                                handleFieldUpdate("remit_to")
                            }
                            disabled={readOnly}
                        />
                    </Form.Item>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        <Form.Item
                            label="Attachments"
                            className="md:col-span-1 mb-0"
                        >
                            <Attachment
                                model="invoice"
                                id={requisitionId}
                                disabled={readOnly}
                            />
                        </Form.Item>
                    </div>
                </div>
            </Form>
        </Card>
    );
};
export default InvoiceFormDetails;
