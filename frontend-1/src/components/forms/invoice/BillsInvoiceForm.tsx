/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useCallback, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Skeleton } from 'antd';
import { Button } from '@/components/ui/button';
import { Input, Select } from 'antd';
import dayjs from 'dayjs';
import { useRequisitionForm } from '../purchase-requisition/useRequisitionForm';
import WorkflowActions from '../purchase-requisition/WorkflowActions';
import { workflowAPI, viewAPI } from '@/api/api';
import { useToast } from '@/components/ui/use-toast';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { Attachment } from '@/components/attachment/Attachment';
import InvoiceLineItems from './InvoiceLineItems';
interface BillsInvoiceFormProps {
    onComplete?: () => void;
    requisitionId?: string;
    readOnly?: boolean;
    onBack?: () => void;
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <div className="flex flex-col gap-0.5 py-1">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <span className="text-sm text-foreground">{value ?? '—'}</span>
        </div>
    );
}

const BillsInvoiceForm: React.FC<BillsInvoiceFormProps> = ({
    onComplete,
    requisitionId,
    readOnly = false,
    onBack
}) => {
    const {
        form,
        lineItems,
        setLineItems,
        editingRowId,
        setEditingRowId,
        currentLineItem,
        setCurrentLineItem,
        updateTotalAmount,
    } = useRequisitionForm(onComplete, requisitionId, readOnly);

    const [details, setDetails] = useState<any>({});
    const [whorFlow, setWhorFlow] = useState<any>(null);
    const [status, setStatus] = useState<any>(null);
    const [actionId, setActionId] = useState<any>(null);
    const [actionData, setActionData] = useState<any>([]);
    const [state, setState] = useState<string>('');
    const [view, setView] = useState<string>('');
    const [type, setType] = useState<string>('');
    const [action, setAction] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [isSubmitLoader, setSubmitLoader] = useState<boolean>(false);
    const [workflowContext, setWorkflowContext] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const { stateId, viewId } = useParams<{ stateId: string; viewId: string }>();
    const location = useLocation();
    const { toast } = useToast();
    const redirectPath = location.pathname.includes('/sales/') ? 'sales/invoices' : 'purchases/bills';

    useEffect(() => {
        if (requisitionId) {
            setLoading(true);
            if (viewId) {
                viewAPI.getById('invoice', requisitionId, viewId)
                    .then((res: any) => {
                        setDetails(res?.data ?? {});
                        setActionData(res?.workflow_context?.current_state_ref?.source_actions ?? []);
                        setState(res?.data?.status ?? '');
                        setView(res?.stateDetails?.meta_view?.view_name ?? '');
                        setType(res?.workflow_context?.flow?.model_name ?? '');
                        setWorkflowContext(res?.workflow_context ?? null);
                        setWhorFlow(res?.workflow_context ?? null);
                        setStatus(res?.data?.status ?? null);
                        setActionId(res?.data?.purchase_order?.purchase_id ?? null);
                    })
                    .catch((err) => console.log(err))
                    .finally(() => setLoading(false));
            } else {
                workflowAPI.getById('invoice', requisitionId, stateId)
                    .then((res: any) => {
                        setDetails(res?.data ?? {});
                        setActionData(res?.workflow_context?.current_state_ref?.source_actions ?? []);
                        setState(res?.data?.status ?? '');
                        setView(res?.stateDetails?.meta_view?.view_name ?? '');
                        setType(res?.workflow_context?.flow?.model_name ?? '');
                        setWorkflowContext(res?.workflow_context ?? null);
                        setWhorFlow(res?.workflow_context ?? null);
                        setStatus(res?.data?.status ?? null);
                        setActionId(res?.data?.purchase_order?.purchase_id ?? null);
                    })
                    .catch((err) => console.log(err))
                    .finally(() => setLoading(false));
            }
        }
    }, [requisitionId, stateId, viewId]);

    const handleSubmit = useCallback(
        async (payload: any) => {
            if (!requisitionId) return;
            const updatedDetails = {
                ...payload,
                ...(payload?.total_price != null || details?.total_price != null
                    ? {
                        total_price: parseFloat(
                            String(payload?.total_price ?? details?.total_price ?? 0)
                        ),
                    }
                    : {}),
            };
            try {
                const res = await viewAPI.update('invoice', requisitionId, 'invoice_view', updatedDetails);
                console.log(res);
                setDetails(res?.data ?? details);
            } catch (err: any) {
                console.error('Error updating invoice:', err?.message);
            }
        },
        [requisitionId, details]
    );

    const handleInputChange = useCallback(
        (key: string, e: any) => {
            const value = e?.target ? e.target.value : e;
            setDetails((prev: any) => ({ ...prev, [key]: value }));
        },
        []
    );

    const handleFieldUpdate = useCallback(
        async (fieldName: string) => {
            if (readOnly) return;
            await handleSubmit({ [fieldName]: details[fieldName] });
        },
        [readOnly, details, handleSubmit]
    );

    const handleSelectChange = useCallback(
        async (sourceKey: string, key: string, value: any) => {
            const newVal = value?.[key];
            setDetails((prev: any) => ({
                ...prev,
                [sourceKey]: newVal,
                ...(sourceKey === 'purchase_order_id' && value && { purchase_order: value }),
            }));
            await handleSubmit({ [sourceKey]: newVal });
        },
        [handleSubmit]
    );

    const handleSelectClear = useCallback(
        async (sourceKey: string) => {
            setDetails((prev: any) => ({ ...prev, [sourceKey]: '' }));
            await handleSubmit({ [sourceKey]: '' });
        },
        [handleSubmit]
    );

    const handleInvoiceTypeChange = useCallback(
        async (value: string) => {
            setDetails((prev: any) => ({ ...prev, invoice_type: value }));
            await handleSubmit({ invoice_type: value });
        },
        [handleSubmit]
    );

    const validateInvoiceQuantities = useCallback(
        async (action: any, invoiceData: any): Promise<boolean> => {
            const isRejectAction = action?.name?.toLowerCase() === 'reject';
            const isDraftAction = action?.name?.toLowerCase() === 'draft';
            if (isRejectAction || isDraftAction) return true;

            const items = invoiceData?.invoice_line_item;
            if (!Array.isArray(items)) return true;

            const invalidItems: any[] = [];
            items.forEach((item: any) => {
                const poQuantity = item?.purchase_order_line_item?.quantity || 0;
                const alreadyInvoicedQty = item?.purchase_order_line_item?.invoice_qty || 0;
                const remainingQuantity = poQuantity - alreadyInvoicedQty;
                const invoiceQty = item?.invoice_qty || 0;
                if (invoiceQty > remainingQuantity) {
                    invalidItems.push({
                        itemName: item?.item_name || item?.item_master?.item_name || 'Unknown Item',
                        invoiceQty,
                        remainingQuantity,
                    });
                }
            });

            if (invalidItems.length > 0 && action?.name?.toLowerCase() == 'draft') {
                const first = invalidItems[0];
                toast({
                    title: 'Invoice Quantity Validation Failed',
                    description: `Cannot submit invoice. ${invalidItems.length} item(s) have invoice quantities exceeding available. Example: "${first.itemName}" - Invoice Qty (${first.invoiceQty}) exceeds available (${first.remainingQuantity}).`,
                    variant: 'destructive',
                });
                return false;
            }
            return true;
        },
        [toast]
    );

    if (loading) {
        return (
            <div className="space-y-4 p-4">
                <Skeleton active paragraph={{ rows: 3 }} />
                <Skeleton active paragraph={{ rows: 4 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-screen-xl mx-auto">
            {/* Approve panel – uncomment to enable Reject/Approve workflow actions */}
            {/* <div className="px-2 pt-2">
                <WorkflowActions
                    actionData={actionData}
                    setActionData={setActionData}
                    data={details}
                    setData={setDetails}
                    setAction={setAction}
                    setIsModalOpen={setIsModalOpen}
                    type={type}
                    state={state}
                    view={view}
                    id={requisitionId ?? ''}
                    isSubmitLoader={isSubmitLoader}
                    setSubmitLoader={setSubmitLoader}
                    form={form}
                    currentStep={0}
                    stepsLength={1}
                    reDirect={redirectPath}
                    readOnly={readOnly}
                    workflowContext={workflowContext}
                    onBeforeAction={validateInvoiceQuantities}
                />
            </div> */}

            {readOnly && (
                <div className="flex justify-between items-center px-2">
                    <div className="bg-primary-50 text-primary-700 px-3 py-1.5 rounded-md font-medium text-sm">
                        View Mode
                    </div>
                    <Button onClick={onBack} variant="outline" size="sm">
                        Close
                    </Button>
                </div>
            )}

            <div className="rounded-lg bg-white p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left column: Details + Attachments */}
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5">Details</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Invoice Type</label>
                                    <Select
                                        style={{ width: '100%' }}
                                        value={details?.invoice_type}
                                        disabled={readOnly || (details?.invoice_type === 'With PO' && (whorFlow?.current_state_ref?.name ?? '').toLowerCase() !== 'draft')}
                                        onChange={handleInvoiceTypeChange}
                                        options={[
                                            { value: 'With PO', label: 'With PO' },
                                            { value: 'Without PO', label: 'Without PO' },
                                        ]}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">PO Number</label>
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
                                            disabled={readOnly || (!!details?.purchase_order && (whorFlow?.current_state_ref?.name ?? '').toLowerCase() !== 'draft')}
                                        />
                                    ) : (
                                        <Input disabled placeholder="Only available with PO" />
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Remit To</label>
                                    <Input
                                        value={details?.remit_to}
                                        onChange={(e) => handleInputChange('remit_to', e)}
                                        onBlur={() => handleFieldUpdate('remit_to')}
                                        disabled={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">AP Comments</label>
                                    <Input
                                        value={details?.ap_comment}
                                        onChange={(e) => handleInputChange('ap_comment', e)}
                                        onBlur={() => handleFieldUpdate('ap_comment')}
                                        disabled={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5 mb-2">Attachments</h4>
                            <Attachment model="invoice" id={requisitionId} disabled={readOnly} />
                        </div>
                    </div>
                    {/* Right column: Invoice details + Supplier info */}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5">Invoice details</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Invoice #</p>
                                    <p className="text-sm font-medium text-foreground">{details?.invoice_number ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">PR #</p>
                                    <p className="text-sm font-medium text-foreground">{details?.purchase_order?.pr_number ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Date</p>
                                    <p className="text-sm font-medium text-foreground">{details?.invoice_date ? dayjs(details.invoice_date).format('DD-MM-YYYY') : '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Requester</p>
                                    <p className="text-sm font-medium text-foreground">{details?.purchase_order?.create_user?.name ?? '—'}</p>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5 mb-2">Supplier information</h4>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm font-medium text-foreground">{details?.purchase_order?.supplier_details?.supplier_name ?? '—'}</p>
                                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                        {details?.purchase_order?.supplier_details?.legal_name && (
                                            <p>{details.purchase_order.supplier_details.legal_name}</p>
                                        )}
                                        {details?.purchase_order?.supplier_details?.primary_email && (
                                            <p>{details.purchase_order.supplier_details.primary_email}</p>
                                        )}
                                        {details?.purchase_order?.supplier_details?.primary_phone && (
                                            <p>{details.purchase_order.supplier_details.primary_phone}</p>
                                        )}
                                    </div>
                                </div>
                                {(details?.purchase_order?.supplier_details?.po_email || details?.transmission_mode || details?.shipping_method) && (
                                    <div className="pt-2 space-y-1">
                                        {details?.purchase_order?.supplier_details?.po_email && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">PO Email</p>
                                                <p className="text-sm font-medium text-foreground">{details.purchase_order.supplier_details.po_email}</p>
                                            </div>
                                        )}
                                        {(details?.transmission_mode || details?.shipping_method) && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Transmission · Shipping</p>
                                                <p className="text-sm font-medium text-foreground">
                                                    {[details?.transmission_mode, details?.shipping_method].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {(details?.shipping_terms || details?.payment_terms) && (
                                    <div className="pt-2 space-y-1">
                                        {details?.shipping_terms && (
                                            <>
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Shipping terms</p>
                                                <p className="text-sm font-medium text-foreground">{details.shipping_terms}</p>
                                            </>
                                        )}
                                        {details?.payment_terms && (
                                            <>
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Payment terms</p>
                                                <p className="text-sm font-medium text-foreground">{details.payment_terms}</p>
                                            </>
                                        )}
                                    </div>
                                )}
                                {details?.purchase_order?.purchase_requisition?.purchase_reason && (
                                    <div className="pt-2">
                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Remarks</p>
                                        <p className="text-sm font-medium text-foreground">{details.purchase_order.purchase_requisition.purchase_reason}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-6 pt-4 border-t border-border">
                    <InvoiceLineItems
                        lineItems={lineItems}
                        setLineItems={setLineItems}
                        editingRowId={editingRowId}
                        setEditingRowId={setEditingRowId}
                        currentLineItem={currentLineItem}
                        setCurrentLineItem={setCurrentLineItem}
                        updateTotalAmount={updateTotalAmount}
                        budgetLevel={details?.budget_level}
                        details={details}
                        setDetails={setDetails}
                        readOnly={readOnly}
                        requisitionId={requisitionId}
                        whorFlow={whorFlow}
                    />
                </div>
            </div>

            <div className="px-2 pb-4">
                <WorkflowActions
                    actionData={actionData}
                    setActionData={setActionData}
                    data={details}
                    setData={setDetails}
                    setAction={setAction}
                    setIsModalOpen={setIsModalOpen}
                    type={type}
                    state={state}
                    view={view}
                    id={requisitionId ?? ''}
                    isSubmitLoader={isSubmitLoader}
                    setSubmitLoader={setSubmitLoader}
                    form={form}
                    currentStep={0}
                    stepsLength={1}
                    reDirect={redirectPath}
                    readOnly={readOnly}
                    workflowContext={workflowContext}
                    onBeforeAction={validateInvoiceQuantities}
                />
            </div>
        </div>
    );
};

export default BillsInvoiceForm;
