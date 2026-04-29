import React, { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { viewAPI, workflowAPI } from '@/api/api';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '../../utils/helper';
import { SearchDropDown } from '../../search_dropdown/dropdown';
import { Modal, Select } from 'antd';
import { Attachment } from '@/components/attachment/Attachment';

const createItemMasterSchema = (remainingBalance: number) => z.object({
    payment_method: z.string().min(1, { message: 'Payment Method is required' }),
    amount: z.union([z.string(), z.number()]).refine(
        (val) => {
            const num = typeof val === 'string' ? parseFloat(val) : val;
            return !isNaN(num) && num > 0;
        },
        { message: 'Amount must be a valid positive number' }
    ).refine(
        (val) => {
            const num = typeof val === 'string' ? parseFloat(val) : val;
            return num <= remainingBalance;
        },
        { message: 'Amount cannot exceed remaining balance' }
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
type ItemMasterValues = z.infer<ReturnType<typeof createItemMasterSchema>>;
interface PaymentReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId?: string;
    invoiceData?: any;
    onSuccess?: () => void;
}
export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
    isOpen,
    onClose,
    invoiceId,
    invoiceData,
    onSuccess
}) => {
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [remainingBalance, setRemainingBalance] = useState(invoiceData?.balance_amount || invoiceData?.invoice_total);
    const [amountError, setAmountError] = useState<string>('');
    const [detailsId, setDetailsId] = useState<string>('');
    // Calculate current balance - always use latest invoiceData, fallback to state
    const currentBalance = invoiceData?.balance_amount ?? invoiceData?.invoice_total ?? remainingBalance ?? 0;
    // Create resolver with current balance - useMemo to update when balance changes
    const resolver = useMemo(() => {
        const balance = invoiceData?.balance_amount ?? invoiceData?.invoice_total ?? remainingBalance ?? 0;
        return zodResolver(createItemMasterSchema(balance));
    }, [invoiceData?.balance_amount, invoiceData?.invoice_total, remainingBalance]);

    const form = useForm<ItemMasterValues>({
        resolver: resolver,
        defaultValues: {
            payment_method: '',
            amount: '',
            base_amount: '',
            notes: '',
            payment_type: '',
            status: '',
            exchange_rate: '',
            payment_reference: '',
        },
    });
    const watchedAmount = form.watch('amount');

    // Update remaining balance when invoiceData changes
    useEffect(() => {
        if (invoiceData) {
            const newBalance = invoiceData.balance_amount ?? invoiceData.invoice_total;
            if (newBalance !== remainingBalance) {
                setRemainingBalance(newBalance);
                // Reset form validation when balance changes
                form.clearErrors();
                form.trigger('amount');
                setAmountError('');
            }
        }
    }, [invoiceData?.balance_amount, invoiceData?.invoice_total, remainingBalance, form]);

    // Pre-populate form with invoice data when modal opens
    useEffect(() => {
        if (isOpen && invoiceData) {
            const balance = invoiceData.balance_amount ?? invoiceData.invoice_total ?? remainingBalance ?? 0;
            form.reset({
                payment_method: '',
                amount: balance || '',
                base_amount: '',
                notes: '',
                payment_type: '',
                status: '',
                exchange_rate: '',
                payment_reference: '',
            });
        }
    }, [isOpen, invoiceData, invoiceId, remainingBalance, form]);
    // Live validation message under Amount (also drives submit enable/disable)
    useEffect(() => {
        const balance = Number(invoiceData?.balance_amount ?? invoiceData?.invoice_total ?? remainingBalance ?? 0) || 0;
        const raw = watchedAmount;

        if (raw === undefined || raw === null || raw === '') {
            setAmountError('');
            return;
        }

        const numValue = typeof raw === 'string' ? parseFloat(raw) : (raw as number);
        if (Number.isNaN(numValue)) {
            setAmountError('');
            return;
        }
        if (numValue <= 0) {
            setAmountError('Amount must be greater than 0');
            return;
        }
        if (numValue > balance) {
            setAmountError(`Amount cannot exceed remaining balance: ${balance}`);
            return;
        }
        setAmountError('');
    }, [watchedAmount, remainingBalance, invoiceData?.balance_amount, invoiceData?.invoice_total]);

    const canSubmit = useMemo(() => {
        const balance = Number(invoiceData?.balance_amount ?? invoiceData?.invoice_total ?? remainingBalance ?? 0) || 0;
        const raw = watchedAmount;
        if (raw === undefined || raw === null || raw === '') return false;
        const numValue = typeof raw === 'string' ? parseFloat(raw) : (raw as number);
        if (Number.isNaN(numValue)) return false;
        return numValue > 0 && numValue <= balance;
    }, [watchedAmount, remainingBalance, invoiceData?.balance_amount, invoiceData?.invoice_total]);
    const handleSubmit = async (data: ItemMasterValues) => {
        // Validate amount against remaining balance before processing
        const enteredAmount = typeof data.amount === 'string' ? parseFloat(data.amount) : (data.amount as number);
        const currentBalance = remainingBalance || invoiceData?.balance_amount || invoiceData?.invoice_total || 0;

        if (enteredAmount > currentBalance) {
            toast({
                variant: "destructive",
                title: "Invalid Amount",
                description: `Amount cannot exceed available balance. Available balance: ${currentBalance}`,
            });
            return; // Stop execution here
        }
        try {
            setIsSubmitting(true);
            const submissionData = {
                ...data,
                amount: enteredAmount,
                base_amount: typeof data.base_amount === 'string' ? parseFloat(data.base_amount) : (data.base_amount as number) || null,
                exchange_rate: typeof data.exchange_rate === 'string' ? parseFloat(data.exchange_rate) : (data.exchange_rate as number) || null,
                payment_method: data.payment_method || null,
            };
            const response: any = await viewAPI.addChild(
                "invoice",
                invoiceId,
                "invoice_view",
                "payment_receipt",
                submissionData
            )
            // Update the remaining balance with the new value from the response
            // const newRemainingBalance = res?.invoice_details?.balance_amount || res?.remaining_balance;
            // setRemainingBalance(newRemainingBalance);
            toast({
                title: "Success",
                description: `Payment recorded successfully`
            });
            // Call onSuccess callback and close modal
            if (onSuccess) {
                onSuccess();
            }
            onClose();
        } catch (error: any) {
            const errorMessage = error.response?.data?.details?.field_name
                ? `Error with field: ${error.response.data.details.field_name}`
                : error.message || "Something went wrong";

            toast({
                variant: "destructive",
                title: "Error",
                description: errorMessage,
            });
            console.error("Error:", error);
        } finally {
            setIsSubmitting(false);
        }
    };
    const handleSelectChange = (
        sourceKey: any,
        key: string,
        value: any,
        fields: any
    ) => {
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key], { shouldValidate: true, shouldDirty: true }); // ✅
    };
    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '', { shouldValidate: true, shouldDirty: true }); // ✅ trigger validation
    };
    const handleUnitPriceChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        onChange: (value: any) => void
    ) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            onChange(value); // ✅ tell RHF about the change
        }
    };
    const handleCancel = () => {
        onClose();
    };
    return (
        <Modal
            title={
                <div className="bg-primary text-white p-4 -m-6 mb-6 rounded-t-lg">
                    <h2 className="text-lg font-semibold">Record Payment - {invoiceData?.invoice_number || 'Invoice'}</h2>
                </div>
            }
            open={isOpen}
            style={{ marginTop: "4%" }}
            // styles={{
            //     body: {
            //         padding: '2px',
            //         maxHeight: '90vh',
            //         overflowY: 'auto',
            //     }
            // }}
            onCancel={onClose}
            width={920}
            centered
            footer={[
                <Button
                    key="cancel"
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    style={{ marginRight: "10px" }}
                >
                    Cancel
                </Button>,
                <Button
                    key="submit"
                    type="submit"
                    disabled={isSubmitting || !canSubmit}
                    onClick={form.handleSubmit(handleSubmit)}
                    className="bg-primary hover:bg-primary/90"
                >
                    {isSubmitting ? "Recording..." : "Record Payment"}
                </Button>
            ]}
        >
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
                <Form {...form} key={`payment-form-${invoiceId}-${currentBalance}`}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Amount Received <span className="text-red-500">*</span></FormLabel>
                                        <FormControl>
                                            <Input
                                                type="text"
                                                name="amount"
                                                placeholder="Amount"
                                                value={field.value || ''}
                                                onChange={(e) => handleUnitPriceChange(e, field.onChange)}
                                                className={amountError && field.value ? 'border-red-500 focus:border-red-500' : ''}
                                            />
                                        </FormControl>
                                        {amountError && (
                                            <p className="text-sm text-red-500">{amountError}</p>
                                        )}
                                        {!amountError && <FormMessage />}
                                    </FormItem>
                                )}
                            />
                            {/* Bank Charges */}
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
                                                    { value: 'InActive', label: 'InActive' }
                                                ]}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Tax deducted */}
                            <FormField
                                control={form.control}
                                name="status"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tax deducted?</FormLabel>
                                        <FormControl>
                                            <div className="flex space-x-6">
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name="tax_deducted"
                                                        value="no"
                                                        defaultChecked
                                                        className="mr-2"
                                                    />
                                                    <span className="text-sm">No Tax deducted</span>
                                                </label>
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name="tax_deducted"
                                                        value="yes"
                                                        className="mr-2"
                                                    />
                                                    <span className="text-sm">Yes, TDS (Income Tax)</span>
                                                </label>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Payment Date */}
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
                                                    { value: 'ADVANCE', label: 'ADVANCE' }
                                                ]}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Payment Mode */}
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
                            {/* Exchange Rate */}
                            <FormField
                                control={form.control}
                                name="exchange_rate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Exchange Rate</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="text"
                                                placeholder="Exchange Rate"
                                                {...field}
                                            />
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
                                            <Input
                                                type="text"
                                                placeholder="Reference"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Attachments
                                </label>
                                <Attachment
                                    model="payment_receipt"
                                    id={detailsId}
                                />
                            </div>
                            {/* Notes */}
                            <div className="lg:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Notes</FormLabel>
                                            <FormControl>
                                                <textarea
                                                    className="w-full min-h-[80px] p-3 border border-gray-300 rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    </form>
                </Form>
            )}
        </Modal>
    );
};