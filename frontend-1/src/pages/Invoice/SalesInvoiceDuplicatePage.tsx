import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { viewAPI, workflowAPI } from '@/api/api';

interface ApiRecordResponse {
    data?: Record<string, any>;
}

interface WorkflowCreateResponse {
    data?: { id?: string };
}

const addCopySuffix = (value?: string | null) => (value ? `${value} copy` : value);

const resolvePaymentTermsId = (source: Record<string, any>) =>
    source.payment_terms_id ?? source.payment_terms?.id ?? undefined;

const buildDuplicateHeaderPayload = (source: Record<string, any>) => ({
    legal_entity_id: source.legal_entity_id,
    customer_id: source.customer_id,
    location_id: source.location_id,
    bill_to: source.bill_to,
    payment_terms_id: resolvePaymentTermsId(source),
    invoice_date: source.invoice_date,
    invoice_number: addCopySuffix(source.invoice_number),
    invoice_total: source.invoice_total,
    invoice_net_total: source.invoice_net_total,
    additional_tax: source.additional_tax,
    shipping_cost: source.shipping_cost,
    terms_and_conditions: source.terms_and_conditions,
    notes: source.notes,
    adjustable_label: source.adjustable_label,
    adjustable_value: source.adjustable_value,
    transaction_type: source.transaction_type,
    supplier_name: source.supplier_name,
});

const buildDuplicateLineItemPayload = (lineItem: Record<string, any>) => ({
    item_name: lineItem.item_name,
    item_number: lineItem.item_number,
    item_description: lineItem.item_description,
    item_type: lineItem.item_type,
    rate: lineItem.rate || 0,
    tax_rate: lineItem.tax_rate || lineItem.tax_rate_intra || 0,
    tax_rate_intra: lineItem.tax_rate_intra,
    ordered_quantity: lineItem.ordered_quantity || 0,
    ordered_amount: lineItem.ordered_amount || 0,
    invoice_qty: lineItem.invoice_qty || lineItem.ordered_quantity || 0,
    line_total: lineItem.line_total,
    invoiced_amount: lineItem.invoiced_amount,
    line_tax_amount: lineItem.line_tax_amount,
    discount_rate: lineItem.discount_rate,
    discount_amount: lineItem.discount_amount,
    need_by_date: lineItem.need_by_date,
    item_master_id: lineItem.item_master_id || lineItem.item_master?.id,
});

const SalesInvoiceDuplicatePage: React.FC = () => {
    const { viewId = 'invoice_view' } = useParams<{ viewId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const duplicateOfId = new URLSearchParams(window.location.search).get('duplicateOf');
        if (!duplicateOfId) {
            navigate('/sales/invoices');
            return;
        }

        let cancelled = false;

        const duplicateInvoice = async () => {
            try {
                const sourceRes = (await viewAPI.getById('invoice', duplicateOfId, viewId)) as ApiRecordResponse;
                const source = sourceRes.data ?? {};

                const createRes = (await workflowAPI.create('invoice', '3', {
                    status: '3',
                })) as WorkflowCreateResponse;

                const newId = createRes.data?.id;
                if (!newId) {
                    throw new Error('Failed to create duplicate invoice');
                }

                await viewAPI.update('invoice', newId, viewId, buildDuplicateHeaderPayload(source));

                const lineItems = Array.isArray(source.invoice_line_item)
                    ? source.invoice_line_item
                    : [];

                for (const lineItem of lineItems) {
                    await viewAPI.addChild(
                        'invoice',
                        newId,
                        viewId,
                        'invoice_line_item',
                        buildDuplicateLineItemPayload(lineItem)
                    );
                }

                if (cancelled) return;

                navigate(`/sales/invoice/${newId}/view/${viewId}`, { replace: true });
            } catch (err: any) {
                if (cancelled) return;

                const message = err?.message || 'Failed to duplicate invoice';
                setError(message);
                toast({
                    title: 'Error duplicating invoice',
                    description: message,
                    variant: 'destructive',
                });
                navigate('/sales/invoices');
            }
        };

        duplicateInvoice();

        return () => {
            cancelled = true;
        };
    }, [viewId, navigate, toast]);

    if (error) {
        return null;
    }

    return (
        <div className="w-full space-y-4 p-4">
            <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((item) => (
                    <Skeleton key={item} className="h-12 w-full rounded" />
                ))}
            </div>
        </div>
    );
};

export default SalesInvoiceDuplicatePage;
