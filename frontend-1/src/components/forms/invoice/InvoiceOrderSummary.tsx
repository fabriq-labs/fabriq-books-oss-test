
import React from 'react';
import { Form, Input, Typography } from 'antd';
import { UseFormReturn } from 'react-hook-form';
import { Card } from "@/components/ui/card";
import { StatusTag } from '@/components/purchase-requisition/RequisitionStatus';
import { formatCurrency } from '@/lib/formatters';
const { Title } = Typography;

interface OrderSummaryProps {
    form: UseFormReturn<any>;
    details: any;
    setDetails: any;
    whorFlow: any;
}

const InvoiceOrderSummary: React.FC<OrderSummaryProps> = ({ form, details, setDetails, whorFlow }) => {
    return (
        <Card className="h-auto" style={{ minHeight: '180px' }}>
            <div className="p-3">
                <Title level={5} className="mb-2">Order Summary</Title>
                <Form layout="vertical" className="space-y-2">
                    <Form.Item label="Invoice Total" className="mb-2">
                        <Input
                            type="text"
                            value={formatCurrency(details?.invoice_total || 0)}
                            disabled
                            suffix="INR"
                        />
                    </Form.Item>

                    <Form.Item label="Invoice Status" className="mb-0">
                        <div>
                            <StatusTag status={whorFlow?.current_state_ref?.name} />
                        </div>
                    </Form.Item>
                </Form>
            </div>
        </Card>
    );
};

export default InvoiceOrderSummary;
