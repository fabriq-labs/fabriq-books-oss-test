import React, { useState } from 'react';
import { Card, Input, Form, Select, Checkbox, Typography } from 'antd';
import { UseFormReturn } from 'react-hook-form';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { constructObject } from '@/components/utils/helper';
import { formatCurrency } from '@/lib/formatters';

const { Option } = Select;
const { Title } = Typography;

interface FinancialInformationProps {
    form: UseFormReturn<any>;
    readOnly?: boolean;
    details: any;
    setDetails: any;
    onSubmit?: any
}

const SupplierDetails: React.FC<FinancialInformationProps> = ({ form, readOnly = false, details, setDetails, onSubmit }) => {
    const [field, setField] = useState<string | null>(null);
    const { TextArea } = Input;

    const handleSelectChange = async (
        sourceKey: any,
        key: string,
        value: any,
        fields?: any
    ) => {
        const lookupData = fields ? constructObject(value.item, fields) : value.item;
        setDetails((prev: any) => ({
            ...prev,
            [sourceKey]: value[key],
            [sourceKey.replace('_id', '')]: value[sourceKey.replace('_id', '')] || value.item
        }));

        // Call onSubmit to update the database immediately - only send the ID
        await onSubmit({
            [sourceKey]: value[key]
        });
    };

    const handleSelectClear = async (sourceKey: any) => {
        setDetails((prev: any) => ({
            ...prev,
            [sourceKey]: '',
            [sourceKey.replace('_id', '')]: null
        }));

        // Call onSubmit to update the database immediately - only send the ID
        await onSubmit({
            [sourceKey]: ''
        });
    };

    return (
        <Card title="Supplier Information" className="h-full">
            <Form layout="vertical" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Form.Item label="Supplier Name" className='mb-0'>
                        <Input
                            value={details?.supplier_details
                                ?.supplier_name}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Supplier Contact Name" className='mb-0'>
                        <Input
                            value={details?.supplier_details?.legal_name}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Supplier Email" className='mb-0'>
                        <Input
                            value={details?.supplier_details
                                ?.primary_email}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="PO Email" className='mb-0'>
                        <Input
                            value={details?.supplier_details?.po_email}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Phone" className='mb-0'>
                        <Input
                            value={details?.supplier_details
                                ?.primary_phone}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Transmission Mode" className='mb-0'>
                        <Input
                            value={details?.transmission_mode || "Email"}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Shipping Method" className='mb-0'>
                        <SearchDropDown
                            instanceType="shipping_method"
                            instanceSourceKey="shipping_method_id"
                            instanceKey="id"
                            instanceLabel="shipping_method"
                            instanceValue={details?.shipping_method}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit="10"
                            searchParams="shipping_method"
                            disabled={readOnly}
                        />
                    </Form.Item>
                    <Form.Item label="Shipping Terms" className='mb-0'>
                        <SearchDropDown
                            instanceType="shipping_terms"
                            instanceSourceKey="shipping_terms_id"
                            instanceKey="id"
                            instanceLabel="shipping_terms"
                            instanceValue={details?.shipping_terms}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit="10"
                            searchParams="shipping_terms"
                            disabled={readOnly}
                        />
                    </Form.Item>
                    <Form.Item label="Payment Terms" className='mb-0'>
                        <SearchDropDown
                            instanceType="payment_terms"
                            instanceSourceKey="payment_terms_id"
                            instanceKey="id"
                            instanceLabel="payment_terms"
                            instanceValue={details?.payment_terms}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit="10"
                            searchParams="payment_terms"
                            disabled={readOnly}
                        />
                    </Form.Item>
                    <Form.Item label="PR Total" className='mb-0'>
                        <Input
                            value={details?.pr_total ? formatCurrency(details?.pr_total) :""
                            }
                            disabled
                        />
                    </Form.Item>
                </div>
            </Form>

        </Card>
    );
};

export default SupplierDetails;
