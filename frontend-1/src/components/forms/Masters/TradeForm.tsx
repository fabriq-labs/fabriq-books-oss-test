import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker, Select as AntSelect } from 'antd';
import dayjs from 'dayjs';
import { useTool } from '@/contexts/ToolContext';
import { SearchDropDown } from '../../search_dropdown/dropdown';

const itemMasterSchema = z.object({
    account_id: z.string().min(1, { message: 'Account is required' }),
    instrument_id: z.string().min(1, { message: 'Instrument is required' }),
    target_account_id: z.string().min(1, { message: 'Target Account is required' }),
    quantity: z.string().min(1, { message: 'Quantity is required' }).refine(
        (value) => !isNaN(parseInt(value)) && parseInt(value) >= 0,
        { message: 'Quantity must be a valid positive number' }
    ),
    price: z.string().min(1, { message: 'price is required' }).refine(
        (value) => !isNaN(parseInt(value)) && parseInt(value) >= 0,
        { message: 'Price must be a valid positive number' }
    ),
    brokerage: z.string().min(1, { message: 'Brokerage is required' }).refine(
        (value) => !isNaN(parseInt(value)) && parseInt(value) >= 0,
        { message: 'Brokerage must be a valid positive number' }
    ),
    tax: z.string().min(1, { message: 'Tax is required' }).refine(
        (value) => !isNaN(parseInt(value)) && parseInt(value) >= 0,
        { message: 'Tax must be a valid positive number' }
    ),
    net_amount: z.string().min(1, { message: 'Net Amount is required' }).refine(
        (value) => !isNaN(parseInt(value)) && parseInt(value) >= 0,
        { message: 'Net Amount must be a valid positive number' }
    ),
    total_amount: z.string().min(1, { message: 'Net Amount is required' }).refine(
        (value) => !isNaN(parseInt(value)) && parseInt(value) >= 0,
        { message: 'Total Amount must be a valid positive number' }
    ),
    isin: z.string().optional(),
    type: z.string().min(1, { message: 'Type is required' }),
    value_date: z.date().optional(),
});

type ItemMasterValues = z.infer<typeof itemMasterSchema>;

interface ItemMasterFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    id?: string;
    viewId?: string;
    onSuccess?: () => void;
    postingData?: any;
    existingTrade?: any;
    onTradeCreated?: (tradeData: any) => void;
    isModal?: boolean;
}

export const TradeForm: React.FC<ItemMasterFormProps> = ({
    id: propId,
    viewId: propViewId,
    onCancel: propOnCancel,
    onSuccess: propOnSuccess,
    postingData,
    existingTrade,
    onTradeCreated,
    isModal = false,
    isSubmitting: externalIsSubmitting,
    onCancel,
}) => {
    const { id: paramId, viewId: paramViewId } = useParams<{ id: string, viewId: string }>();
    const id = propId || paramId;
    const viewId = propViewId || paramViewId;
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [linkedPosting, setLinkedPosting] = useState<any>(postingData);
    const { latestFormToolResponse } = useTool();
    
    const tradeId = isModal ? existingTrade?.id : id;
    const finalIsSubmitting = externalIsSubmitting !== undefined ? externalIsSubmitting : isSubmitting;
    
    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: initialValues || {
            account_id: '',
            instrument_id: '',
            target_account_id: '',
            quantity: '',
            price: '',
            brokerage: '',
            tax: '',
            net_amount: '',
            total_amount: '',
            isin: '',
            type: '',
            value_date: ''
        },
    });

    useEffect(() => {
        if (latestFormToolResponse && latestFormToolResponse.result && latestFormToolResponse.result.model === 'trade') {
            if (latestFormToolResponse.result.data) {
                const toolResultData = latestFormToolResponse.result.data;
                if (toolResultData.id) {
                    setInitialValues(toolResultData);
                    form.reset({
                        account_id: toolResultData.account_id?.toString() || '',
                        instrument_id: toolResultData.instrument_id?.toString() || '',
                        target_account_id: toolResultData.target_account_id?.toString() || '',
                        quantity: toolResultData.quantity?.toString() || '',
                        price: toolResultData.price?.toString() || '',
                        brokerage: toolResultData.brokerage?.toString() || '',
                        tax: toolResultData.tax?.toString() || '',
                        net_amount: toolResultData.net_amount?.toString() || '',
                        total_amount: toolResultData.total_amount?.toString() || '',
                        isin: toolResultData.isin || '',
                        type: toolResultData.type || '',
                        value_date: toolResultData.value_date ? new Date(toolResultData.value_date) : undefined
                    });
                }
            }
        }
    }, [latestFormToolResponse, form]);

    useEffect(() => {
        if (isModal) {
            setTimeout(() => {
                if (existingTrade) {
                    setInitialValues(existingTrade);
                    form.reset({
                        instrument_id: existingTrade.instrument?.id?.toString() || '',
                        quantity: existingTrade.quantity?.toString() || '',
                        type: existingTrade.type || '',
                        account_id: existingTrade.account?.id?.toString() || '',
                        price: existingTrade.price?.toString() || '',
                        brokerage: existingTrade.brokerage?.toString() || '',
                        tax: existingTrade.tax?.toString() || '',
                        net_amount: existingTrade.net_amount?.toString() || '',
                        total_amount: existingTrade.total_amount?.toString() || '',
                        isin: existingTrade.isin?.toString() || '',
                        target_account_id: existingTrade.target_account?.id?.toString() || '',
                        value_date: existingTrade.value_date ? new Date(existingTrade.value_date) : undefined,
                    });
                } else if (postingData) {
                    setInitialValues(postingData);
                    form.reset({
                        account_id: postingData.account_id?.toString() || '',
                        instrument_id: postingData.instrument_id?.toString() || '',
                        target_account_id: postingData.credit_account_id?.toString() || '',
                        quantity: postingData.quantity?.toString() || '',
                        price: postingData.price?.toString() || '',
                        brokerage: postingData.brokerage?.toString() || '',
                        tax: postingData.tax?.toString() || '',
                        net_amount: postingData.net_amount?.toString() || '',
                        total_amount: postingData.amount?.toString() || postingData.total_amount?.toString() || '',
                        isin: postingData.isin?.toString() || '',
                        type: postingData.type || '',
                        value_date: postingData.value_date
                            ? (typeof postingData.value_date === 'string'
                                ? new Date(postingData.value_date)
                                : postingData.value_date)
                            : undefined,
                    });
                }
            }, 100);
        }
    }, [postingData, existingTrade, isModal, form]);

    useEffect(() => {
        if (tradeId && !isModal) {
            fetchingDetails(tradeId);
        }
    }, [tradeId, isModal]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("trade", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    instrument_id: res.data?.instrument?.id?.toString() || '',
                    quantity: res.data.quantity?.toString() || '',
                    type: res.data.type || '',
                    account_id: res.data?.account?.id?.toString() || '',
                    price: res.data?.price?.toString() || '',
                    brokerage: res.data?.brokerage?.toString() || '',
                    tax: res.data?.tax?.toString() || '',
                    net_amount: res.data?.net_amount?.toString() || '',
                    total_amount: res.data?.total_amount?.toString() || '',
                    isin: res.data?.isin?.toString() || '',
                    target_account_id: res.data?.target_account?.id?.toString() || '',
                    value_date: res.data.value_date ? new Date(res.data.value_date) : undefined,
                });
                setIsLoading(false);
            }).catch((err) => {
                console.error('Error fetching trade details:', err);
                setIsLoading(false);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to load trade details. Please try again.",
                });
            });
    };

    const handleSubmit = async (data: ItemMasterValues) => {
        try {
            setIsSubmitting(true);
            
            if (!data.account_id?.trim()) {
                throw new Error("Account is required and must be a valid selection");
            }
            if (!data.instrument_id?.trim()) {
                throw new Error("Instrument is required and must be a valid selection");
            }
            if (!data.target_account_id?.trim()) {
                throw new Error("Target Account is required and must be a valid selection");
            }

            const submissionData = {
                ...data,
                quantity: parseInt(data.quantity),
                price: parseInt(data.price),
                brokerage: parseInt(data.brokerage),
                tax: parseInt(data.tax),
                net_amount: parseInt(data.net_amount),
                total_amount: parseInt(data.total_amount),
                instrument_id: data.instrument_id.trim(),
                target_account_id: data.target_account_id.trim(),
                account_id: data.account_id.trim(),
                value_date: data.value_date || null,
                posting_id: linkedPosting?.id || null,
            };

            if (!tradeId) {
                const result = await viewAPI.create(
                    "trade",
                    viewId,
                    submissionData
                ) as { data: any };

                if (isModal && onTradeCreated) {
                    onTradeCreated(result.data);
                    return;
                } else {
                    toast({
                        title: "Success",
                        description: "Trade created successfully",
                    });

                    if (propOnSuccess) {
                        propOnSuccess();
                    } else {
                        navigate('/investments/trades');
                    }
                }
            } else {
                await viewAPI.update(
                    "trade",
                    tradeId,
                    viewId,
                    submissionData
                );

                toast({
                    title: "Success",
                    description: "Trade updated successfully",
                });

                if (propOnSuccess) {
                    propOnSuccess();
                } else if (!isModal) {
                    navigate('/investments/trades');
                }
            }
        } catch (error: any) {
            let errorMessage = "Something went wrong";
            console.error('Submission error:', error);

            if (error.response?.status === 500 && error.response?.data?.message?.includes("Foreign key constraint")) {
                errorMessage = "One or more selected items (Account, Instrument, or Target Account) no longer exist in the database. Please refresh and try again.";
            } else if (error.response?.data?.details?.field_name) {
                errorMessage = `Error with field: ${error.response.data.details.field_name}`;
            } else if (error.message) {
                errorMessage = error.message;
            }

            toast({
                variant: "destructive",
                title: "Error",
                description: errorMessage,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const onhandleSelectChange = (
        sourceKey: any,
        key: any,
        value: any,
        fields: any
    ) => {
        if (!value || !value[key]) {
            form.setValue(sourceKey, '');
            return;
        }
        form.setValue(sourceKey, value[key].toString());
    };

    const handleSelectChange = (
        sourceKey: any,
        key: any,
        value: any,
        fields: any
    ) => {
        if (!value || !value[key]) {
            form.setValue(sourceKey, '');
            return;
        }
        form.setValue(sourceKey, value[key].toString());
        form.setValue("isin", value?.item?.isin || '');
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '');
    };

    const handleInstrumentSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '');
        form.setValue("isin", '');
    };

    const handleCancel = () => {
        if (propOnCancel) {
            propOnCancel();
        } else if (isModal) {
            if (onCancel) {
                onCancel();
            }
        } else {
            navigate('/investments/trades');
        }
    };

    const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('quantity', value);
        }
    };

    const handleCostBasisChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('price', value);
        }
    };

    const handleAvgPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('brokerage', value);
        }
    };

    const handleUnrealizedPLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
            form.setValue('tax', value);
        }
    };

    const handleNetAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
            form.setValue('net_amount', value);
        }
    };

    const handleTotalAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
            form.setValue('total_amount', value);
        }
    };

    const handleDelete = async () => {
        if (!tradeId) return;

        try {
            setIsDeleting(true);
            if (linkedPosting?.id) {
                await viewAPI.update("posting", linkedPosting.id, "default", {
                    trade_id: null
                });
            }

            await viewAPI.delete("trade", tradeId, "default");

            toast({
                title: "Success",
                description: "Trade deleted successfully",
            });

            navigate('/investments/trades');
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to delete trade",
            });
        } finally {
            setIsDeleting(false);
        }
    };

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
                <div>
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
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="account_id"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Account</FormLabel>
                                            <SearchDropDown
                                                instanceType="account"
                                                instanceSourceKey="account_id"
                                                instanceKey="id"
                                                instanceLabel="name"
                                                instanceValue={initialValues?.account}
                                                onSelectItem={onhandleSelectChange}
                                                onClear={handleSelectClear}
                                                limit="10"
                                                searchParams="name"
                                                type="instrument"
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="instrument_id"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Instrument</FormLabel>
                                            <SearchDropDown
                                                instanceType="instrument"
                                                instanceSourceKey="instrument_id"
                                                instanceKey="id"
                                                instanceLabel="name"
                                                instanceValue={initialValues?.instrument}
                                                onSelectItem={handleSelectChange}
                                                onClear={handleInstrumentSelectClear}
                                                limit="10"
                                                searchParams="name"
                                                type="instrument"
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="target_account_id"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Target Account</FormLabel>
                                            <SearchDropDown
                                                instanceType="account"
                                                instanceSourceKey="target_account_id"
                                                instanceKey="id"
                                                instanceLabel="name"
                                                instanceValue={initialValues?.target_account || initialValues?.credit_account}
                                                onSelectItem={onhandleSelectChange}
                                                onClear={handleSelectClear}
                                                limit="10"
                                                searchParams="name"
                                                type="trade"
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="type"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Type</FormLabel>
                                            <FormControl>
                                                <AntSelect
                                                    placeholder="Select type"
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    style={{ width: '100%' }}
                                                    size="large"
                                                    options={[
                                                        { value: 'BUY', label: 'BUY' },
                                                        { value: 'SELL', label: 'SELL' },
                                                        { value: 'DIVIDEND', label: 'DIVIDEND' },
                                                        { value: 'INTEREST', label: 'INTEREST' },
                                                        { value: 'SPLIT', label: 'SPLIT' },
                                                        { value: 'TRANSFER', label: 'TRANSFER' }
                                                    ]}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="value_date"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Value Date</FormLabel>
                                            <FormControl>
                                                <DatePicker
                                                    className="w-full h-10 px-3 py-2 border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="Value Date"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="isin"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>ISIN</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="text"
                                                    placeholder="Enter ISIN"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="quantity"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Quantity</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="text"
                                                    placeholder="Enter Quantity"
                                                    {...field}
                                                    onChange={handleQuantityChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="price"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Price</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="text"
                                                    placeholder="Enter Price"
                                                    {...field}
                                                    onChange={handleCostBasisChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="brokerage"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Brokerage</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="text"
                                                    placeholder="Enter Brokerage"
                                                    {...field}
                                                    onChange={handleAvgPriceChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="tax"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tax</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="text"
                                                    placeholder="Enter Tax"
                                                    {...field}
                                                    onChange={handleUnrealizedPLChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="net_amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Net Amount</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="text"
                                                    placeholder="Enter Net Amount"
                                                    {...field}
                                                    onChange={handleNetAmountChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="total_amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Total Amount</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="text"
                                                    placeholder="Enter total amount"
                                                    {...field}
                                                    onChange={handleTotalAmountChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="flex justify-end space-x-2">
                                    {tradeId && (
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            onClick={handleDelete}
                                            disabled={isDeleting || finalIsSubmitting}
                                            className="mr-auto"
                                        >
                                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Delete
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleCancel}
                                        disabled={finalIsSubmitting || isDeleting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={finalIsSubmitting}
                                        className="bg-primary hover:bg-primary/90"
                                    >
                                        {finalIsSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {tradeId ? 'Update' : 'Create'}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    )}
                </div>
            </div>
        </>
    );
};

