import React, { useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowLeft, ArrowUpRight, FileText } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from 'antd';
import { Attachment } from '@/components/attachment/Attachment';

const MODEL = 'payment_receipt';
const VIEW = 'payment_receipt_view';

const paymentReceiptSchema = z.object({
    payment_method: z.string().min(1, { message: 'Payment Method is required' }),
    invoice_id: z.string().optional(),
    amount: z.union([z.string(), z.number()]).refine(
        (val) => {
            const num = typeof val === 'string' ? parseFloat(val) : val;
            return !isNaN(num) && num > 0;
        },
        { message: 'Amount must be a valid positive number' }
    ),
    base_amount: z.union([z.string(), z.number()]).optional().refine(
        (val) => {
            if (val === undefined || val === null || val === '') return true;
            const num = typeof val === 'string' ? parseFloat(val) : val;
            return !isNaN(num) && num > 0;
        },
        { message: 'Base Amount must be a valid positive number' }
    ),
    exchange_rate: z.union([z.string(), z.number()]).optional().refine(
        (val) => {
            if (val === undefined || val === null || val === '') return true;
            const num = typeof val === 'string' ? parseFloat(val) : val;
            return !isNaN(num) && num > 0;
        },
        { message: 'Exchange Rate must be a valid positive number' }
    ),
    notes: z.string().optional(),
    payment_reference: z.string().optional(),
    payment_type: z.string().min(1, { message: 'Payment Type is required' }),
    status: z.string().min(1, { message: 'Status is required' }),
});

type PaymentReceiptFormValues = z.infer<typeof paymentReceiptSchema>;

export interface PaymentReceiptFormRef {
    submit: () => void;
    form: ReturnType<typeof useForm<PaymentReceiptFormValues>>;
    isSubmitting: boolean;
}

interface PaymentReceiptFormProps {
    /** When true, renders only form fields (no Card, no Back, no footer). Use in modal. */
    embedInModal?: boolean;
    onSuccess?: () => void;
    onCancel?: () => void;
    onStateChange?: (state: { isSubmitting: boolean }) => void;
}

export const PaymentReceiptForm = forwardRef<PaymentReceiptFormRef, PaymentReceiptFormProps>(function PaymentReceiptForm(
    { embedInModal = false, onSuccess, onCancel, onStateChange },
    ref
) {
    const { id } = useParams<{ id: string }>();
    const isEditMode = Boolean(id);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [detailsId, setDetailsId] = useState<string>('');
    const [invoiceId, setInvoiceId] = useState<string | null>(null);
    const navigate = useNavigate();
    const { toast } = useToast();

    const form = useForm<PaymentReceiptFormValues>({
        resolver: zodResolver(paymentReceiptSchema),
        defaultValues: {
            payment_method: '',
            invoice_id: '',
            amount: '',
            base_amount: '',
            notes: '',
            payment_type: '',
            status: '',
            exchange_rate: '',
            payment_reference: '',
        },
    });

    const fetchDetails = (receiptId: string) => {
        setIsLoading(true);
        viewAPI.getById(MODEL, receiptId, VIEW)
            .then((res: any) => {
                const d = res?.data ?? res;
                setDetailsId(d?.id ?? receiptId);
                setInvoiceId(d?.invoice_id ?? d?.invoice?.id ?? null);
                form.reset({
                    invoice_id: d?.invoice?.invoice_number ?? '',
                    payment_method: d?.payment_method ?? '',
                    amount: d?.amount ?? '',
                    base_amount: d?.base_amount ?? '',
                    notes: d?.notes ?? '',
                    payment_type: d?.payment_type ?? '',
                    status: d?.status ?? '',
                    exchange_rate: d?.exchange_rate ?? '',
                    payment_reference: d?.payment_reference ?? '',
                });
            })
            .catch((err) => {
                console.error(err);
                toast({ variant: 'destructive', title: 'Error', description: 'Failed to load payment receipt' });
            })
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        if (isEditMode && id) {
            fetchDetails(id);
        } else {
            setDetailsId('');
            setInvoiceId(null);
        }
    }, [id, isEditMode]);

    useEffect(() => {
        onStateChange?.({ isSubmitting });
    }, [isSubmitting, onStateChange]);

    useImperativeHandle(ref, () => ({
        submit: () => form.handleSubmit(handleSubmit)(),
        form,
        isSubmitting,
    }), [form, isSubmitting]);

    const handleSubmit = async (data: PaymentReceiptFormValues) => {
        try {
            setIsSubmitting(true);
            const enteredAmount = typeof data.amount === 'string' ? parseFloat(data.amount) : (data.amount as number);
            const payload: any = {
                ...data,
                amount: enteredAmount,
                base_amount: typeof data.base_amount === 'string' ? parseFloat(data.base_amount) || null : (data.base_amount as number) || null,
                exchange_rate: typeof data.exchange_rate === 'string' ? parseFloat(data.exchange_rate) || null : (data.exchange_rate as number) || null,
                payment_method: data.payment_method || null,
            };

            // Ensure we never send an invalid invoice_id (invoice number) to the backend.
            // Use the actual invoice primary key when known, otherwise omit invoice_id from the payload.
            if (invoiceId) {
                payload.invoice_id = invoiceId;
            } else {
                delete payload.invoice_id;
            }

            if (isEditMode && id) {
                await viewAPI.update(MODEL, id, VIEW, payload);
                toast({ title: 'Success', description: 'Payment receipt updated successfully' });
            } else {
                await viewAPI.create(MODEL, VIEW, payload);
                toast({ title: 'Success', description: 'Payment receipt created successfully' });
            }

            if (onSuccess) onSuccess();
            else if (!embedInModal) navigate(-1);
            onCancel?.();
        } catch (error: any) {
            const errorMessage = error.response?.data?.details?.field_name
                ? `Error with field: ${error.response.data.details.field_name}`
                : error.message || 'Something went wrong';
            toast({ variant: 'destructive', title: 'Error', description: errorMessage });
            console.error('Error:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUnitPriceChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        onChange: (value: any) => void
    ) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) onChange(value);
    };

    const handleCancel = () => {
        window.scrollTo({ top: 0, behavior: 'auto' });
        if (onCancel) onCancel();
        else navigate(-1);
    };

    const formContent = (
        <Form {...form} key={`payment-receipt-form-${id ?? 'new'}`}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="invoice_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                    Invoice Number
                                    {invoiceId && (
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/sales/invoice/${invoiceId}/view/invoice_view`)}
                                            className="inline-flex p-0.5 text-primary hover:text-primary/90"
                                            title="Open invoice"
                                        >
                                            <ArrowUpRight className="h-4 w-4" />
                                        </button>
                                    )}
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        type="text"
                                        placeholder="Invoice Number"
                                        value={field.value || ''}
                                        readOnly
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-2">Amount Received <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Input
                                        type="text"
                                        name="amount"
                                        placeholder="Amount"
                                        value={field.value || ''}
                                        onChange={(e) => handleUnitPriceChange(e, field.onChange)}

                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="base_amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Bank Charges (Base Amount)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="text"
                                        placeholder="Bank Charges"
                                        value={field.value || ''}
                                        onChange={(e) => handleUnitPriceChange(e, field.onChange)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Select
                                        placeholder="Select status"
                                        value={field.value}
                                        onChange={field.onChange}
                                        style={{ width: '100%' }}
                                        size="large"
                                        options={[
                                            { value: 'Active', label: 'Active' },
                                            { value: 'InActive', label: 'InActive' },
                                        ]}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="payment_type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Payment Type <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Select
                                        placeholder="Select Payment Type"
                                        value={field.value}
                                        onChange={field.onChange}
                                        style={{ width: '100%' }}
                                        size="large"
                                        options={[
                                            { value: 'FULL', label: 'FULL' },
                                            { value: 'PARTIAL', label: 'PARTIAL' },
                                            { value: 'ADVANCE', label: 'ADVANCE' },
                                        ]}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="payment_method"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Payment Mode <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Select
                                        placeholder="Select Payment Method"
                                        value={field.value}
                                        onChange={field.onChange}
                                        style={{ width: '100%' }}
                                        size="large"
                                        options={[
                                            { value: 'Bank Remittance', label: 'Bank Remittance' },
                                            { value: 'Bank Transfer', label: 'Bank Transfer' },
                                            { value: 'Cash', label: 'Cash' },
                                            { value: 'Cheque', label: 'Cheque' },
                                            { value: 'Credit Card', label: 'Credit Card' },
                                            { value: 'Debit Card', label: 'Debit Card' },
                                            { value: 'UPI', label: 'UPI' },
                                        ]}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="exchange_rate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Exchange Rate</FormLabel>
                                <FormControl>
                                    <Input type="text" placeholder="Exchange Rate" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="payment_reference"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reference</FormLabel>
                                <FormControl>
                                    <Input type="text" placeholder="Reference" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Attachments
                        </label>
                        <Attachment model="payment_receipt" id={detailsId} />
                    </div>
                    <div className="lg:col-span-2">
                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl>
                                        <textarea
                                            className="w-full min-h-[80px] p-3 border border-input rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                            placeholder="Enter notes..."
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>


                <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                        Save
                    </Button>
                </div>

            </form>
        </Form>
    );

    if (embedInModal) {
        return formContent;
    }

    return (
        <>
            <div className="mx-auto w-[70%]">
                <div className="mb-4">
                    <Button
                        variant="ghost"
                        className="flex items-center gap-2 text-muted-foreground"
                        onClick={handleCancel}
                    >
                        <ArrowLeft size={16} />
                        Back to list
                    </Button>
                </div>
                <Card>
                    <CardHeader />
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-6">
                                <div>
                                    <Skeleton className="h-4 w-[100px] mb-2" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                                <div>
                                    <Skeleton className="h-4 w-[120px] mb-2" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                                <div className="flex justify-end space-x-2">
                                    <Skeleton className="h-10 w-[100px]" />
                                    <Skeleton className="h-10 w-[100px]" />
                                </div>
                            </div>
                        ) : (
                            formContent
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
});
