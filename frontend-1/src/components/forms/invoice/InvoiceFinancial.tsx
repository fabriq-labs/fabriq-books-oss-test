import React, { useState } from 'react';
import { Card, Form, Select, Checkbox, Typography, Input } from 'antd';
import { UseFormReturn } from 'react-hook-form';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';

const { Option } = Select;
const { Title } = Typography;

const formatPaymentTerms = (paymentTerms: unknown): string => {
    if (!paymentTerms) return '';
    if (typeof paymentTerms === 'string') return paymentTerms;
    if (typeof paymentTerms === 'object' && paymentTerms !== null && 'payment_terms' in paymentTerms) {
        return (paymentTerms as { payment_terms?: string }).payment_terms ?? '';
    }
    return '';
};

interface FinancialInformationProps {
    form: UseFormReturn<any>;
    readOnly?: boolean;
    details: any;
    setDetails: any;
    onSubmit?: any
}

const InvoiceFinancialInformation: React.FC<FinancialInformationProps> = ({ form, readOnly = false, details, setDetails, onSubmit }) => {
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
    const [field, setField] = useState<string | null>(null);
    return (
        <Card title="Supplier Information" className="h-full">
            <Form layout="vertical" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Form.Item label="Supplier Name" className='mb-0'>
                        <Input
                            value={details?.purchase_order?.supplier_details
                                ?.supplier_name}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Supplier Contact Name" className='mb-0'>
                        <Input
                            value={details?.purchase_order?.supplier_details?.legal_name}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Supplier Email" className='mb-0'>
                        <Input
                            value={details?.purchase_order?.supplier_details
                                ?.primary_email}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="PO Email" className='mb-0'>
                        <Input
                            value={details?.purchase_order?.supplier_details?.po_email}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Phone" className='mb-0'>
                        <Input
                            value={details?.purchase_order?.supplier_details
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
                        <Input
                            value={details?.shipping_method}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label=" Shipping Terms" className='mb-0'>
                        <Input
                            value={details?.shipping_terms}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="Payment Terms" className='mb-0'>
                        <Input
                            value={formatPaymentTerms(details?.payment_terms)}
                            disabled
                        />
                    </Form.Item>

                    <Form.Item label="Supplier Remarks" className='mb-0'>
                        <Input
                            value={details?.purchase_order?.purchase_requisition?.purchase_reason}
                            disabled
                        />
                    </Form.Item>
                    <Form.Item label="AP Comments" className='mb-0'>
                        <Input
                            value={details?.ap_comment}
                            onChange={(e) =>
                                handleInputChange("ap_comment", e)
                            }
                            onBlur={() =>
                                handleFieldUpdate("ap_comment")
                            }
                            disabled={readOnly}
                        />
                    </Form.Item>
                </div>
            </Form>

        </Card>
    );
};

export default InvoiceFinancialInformation;
