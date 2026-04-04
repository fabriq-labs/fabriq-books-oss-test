
import React from 'react';
import { Form, Input, Typography } from 'antd';
import { UseFormReturn } from 'react-hook-form';
import { Card } from "@/components/ui/card";
import { StatusTag } from '@/components/purchase-requisition/RequisitionStatus';
import moment from 'moment';
import { formatCurrency } from '@/lib/formatters';
const { Title } = Typography;

interface OrderSummaryProps {
    form: UseFormReturn<any>;
    details: any;
    setDetails: any;
    totalPOAmount: any;
    whorFlow: any;
}

const PurchaseOrderSummary: React.FC<OrderSummaryProps> = ({ form, details, setDetails, totalPOAmount, whorFlow }) => {

    return (
        <Card className="h-auto" style={{ minHeight: '180px' }}>
            <div className="p-3">
                <Title level={5} className="mb-2">Order Summary</Title>
                <Form layout="vertical" className="space-y-2">
                    <Form.Item label="Purchase Total" className="mb-2">
                        <Input
                            type="text"
                            value={details?.total_price ? formatCurrency(details?.total_price) :""}
                            disabled
                            suffix="INR"
                        />
                    </Form.Item>

                    <Form.Item label="Current Status" className="mb-0">
                        <div>
                            <StatusTag status={whorFlow?.current_state_ref?.name} />
                        </div>
                    </Form.Item>
                    <Form.Item label="Need By Date" className="mb-2">
                        <Input
                            type="text"
                            value={details?.need_by_date ? moment(details.need_by_date).format("DD-MM-YYYY") : '-'}
                            disabled

                        />
                    </Form.Item>

                </Form>
            </div>
        </Card>
    );
};

export default PurchaseOrderSummary;
