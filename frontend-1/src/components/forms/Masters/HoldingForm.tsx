import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '../../utils/helper';
import { useTool } from '@/contexts/ToolContext';
import { SearchDropDown } from '../../search_dropdown/dropdown';

const itemMasterSchema = z.object({
    account_id: z.string().min(1, { message: 'Account is required' }),
    instrument_id: z.string().min(1, { message: 'Instrument is required' }),
    quantity: z.string().min(1, { message: 'Quantity is required' }).refine(
        (value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0,
        { message: 'Quantity must be a valid positive number' }
    ),
    average_cost: z.string().min(1, { message: 'Average cost is required' }).refine(
        (value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0,
        { message: 'Average cost must be a valid positive number' }
    ),
    current_price: z.string().optional().refine(
        (value) => !value || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0),
        { message: 'Current price must be a valid positive number' }
    ),
    market_value: z.string().optional().refine(
        (value) => !value || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0),
        { message: 'Market value must be a valid positive number' }
    ),
    unrealized_pnl: z.string().optional().refine(
        (value) => !value || !isNaN(parseFloat(value)),
        { message: 'Unrealized P&L must be a valid number' }
    ),
    realized_pnl: z.string().optional().refine(
        (value) => !value || !isNaN(parseFloat(value)),
        { message: 'Realized P&L must be a valid number' }
    ),
    currency_id: z.string().optional(),
    is_active: z.boolean().optional(),
    notes: z.string().optional(),
    tags: z.string().optional(),
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
}

export const HoldingForm: React.FC<ItemMasterFormProps> = ({
    id: propId,
    viewId: propViewId,
    onCancel: propOnCancel,
    onSuccess: propOnSuccess
}) => {
    const { id: paramId, viewId: paramViewId } = useParams<{ id: string, viewId: string }>();
    const id = propId || paramId;
    const viewId = propViewId || paramViewId;
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const { latestFormToolResponse } = useTool();

    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: initialValues || {
            quantity: '',
            account_id: '',
            instrument_id: '',
            average_cost: '',
            current_price: '',
            market_value: '',
            unrealized_pnl: '',
            realized_pnl: '',
            currency_id: 'USD',
            is_active: true,
            notes: '',
            tags: '',
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    // Handle latest form tool response updates
    useEffect(() => {
        if (latestFormToolResponse && latestFormToolResponse.result && latestFormToolResponse.result.model === 'holding') {
            console.log('Latest form tool response:', latestFormToolResponse);

            if (latestFormToolResponse.result.data) {
                const toolResultData = latestFormToolResponse.result.data;
                if (toolResultData.id) {
                    setInitialValues(toolResultData);
                    form.reset({
                        quantity: toolResultData.quantity?.toString() || '',
                        account_id: toolResultData?.account_id?.toString() || '',
                        instrument_id: toolResultData?.instrument_id?.toString() || '',
                        average_cost: toolResultData.average_cost?.toString() || '',
                        current_price: toolResultData.current_price?.toString() || '',
                        market_value: toolResultData.market_value?.toString() || '',
                        unrealized_pnl: toolResultData.unrealized_pnl?.toString() || '',
                        realized_pnl: toolResultData.realized_pnl?.toString() || '',
                        currency_id: toolResultData.currency_id || 'USD',
                        is_active: toolResultData.is_active ?? true,
                        notes: toolResultData.notes || '',
                        tags: toolResultData.tags?.join(', ') || '',
                    });
                }
            }
        }
    }, [latestFormToolResponse, form]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("holding", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    quantity: res.data.quantity?.toString() || '',
                    account_id: res.data?.account_id?.toString() || '',
                    instrument_id: res.data?.instrument_id?.toString() || '',
                    average_cost: res.data.average_cost?.toString() || '',
                    current_price: res.data.current_price?.toString() || '',
                    market_value: res.data.market_value?.toString() || '',
                    unrealized_pnl: res.data.unrealized_pnl?.toString() || '',
                    realized_pnl: res.data.realized_pnl?.toString() || '',
                    currency_id: res.data.currency_id || 'USD',
                    is_active: res.data.is_active ?? true,
                    notes: res.data.notes || '',
                    tags: res.data.tags?.join(', ') || '',
                });
                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };

    const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('quantity', value);
        }
    };

    const handleAverageCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('average_cost', value);
        }
    };

    const handleCurrentPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('current_price', value);
        }
    };

    const handleMarketValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('market_value', value);
        }
    };

    const handleUnrealizedPLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
            form.setValue('unrealized_pnl', value);
        }
    };

    const handleRealizedPLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
            form.setValue('realized_pnl', value);
        }
    };

    const handleSubmit = async (data: ItemMasterValues) => {
        try {
            setIsSubmitting(true);

            const submissionData = {
                quantity: parseFloat(data.quantity),
                account_id: data.account_id,
                instrument_id: data.instrument_id,
                average_cost: parseFloat(data.average_cost),
                current_price: data.current_price ? parseFloat(data.current_price) : null,
                market_value: data.market_value ? parseFloat(data.market_value) : null,
                unrealized_pnl: data.unrealized_pnl ? parseFloat(data.unrealized_pnl) : null,
                realized_pnl: data.realized_pnl ? parseFloat(data.realized_pnl) : null,
                currency_id: data.currency_id || 'USD',
                is_active: data.is_active ?? true,
                notes: data.notes || null,
                tags: data.tags ? data.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
            };

            if (!id) {
                await viewAPI.create(
                    "holding",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Holding created successfully",
                });

                if (propOnSuccess) {
                    propOnSuccess();
                } else {
                    navigate('/investments/holdings');
                }
            } else {
                await viewAPI.update(
                    "holding",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Holding updated successfully",
                });
            }

            if (propOnSuccess) {
                propOnSuccess();
            } else {
                navigate('/investments/holdings');
            }
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

    const onhandleSelectChange = (
        sourceKey: any,
        key: string,
        value: any,
        fields: any
    ) => {
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key], { shouldValidate: true });
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '', { shouldValidate: true });
    };

    const handleCancel = () => {
        if (propOnCancel) {
            propOnCancel();
        } else {
            navigate('/investments/holdings');
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
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {initialValues ? 'Edit Holding' : 'Create Holding'}
                        </CardTitle>
                    </CardHeader>
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
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
                                        name="average_cost"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Average Cost</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Average Cost"
                                                        {...field}
                                                        onChange={handleAverageCostChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="current_price"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Current Price</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Current Price"
                                                        {...field}
                                                        onChange={handleCurrentPriceChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="market_value"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Market Value</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Market Value"
                                                        {...field}
                                                        onChange={handleMarketValueChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="unrealized_pnl"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Unrealized P&L</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Unrealized P&L"
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
                                        name="realized_pnl"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Realized P&L</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Realized P&L"
                                                        {...field}
                                                        onChange={handleRealizedPLChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

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
                                        name="currency_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Currency</FormLabel>
                                                <SearchDropDown
                                                    instanceType="currency"
                                                    instanceSourceKey="currency_id"
                                                    instanceKey="id"
                                                    instanceLabel="code"
                                                    instanceValue={
                                                        initialValues?.currency
                                                    }
                                                    onSelectItem={onhandleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="code"
                                                    type="holding"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="is_active"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>Active</FormLabel>
                                                </div>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notes</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Notes"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="tags"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tags (comma-separated)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Tags (e.g., growth, tech, dividend)"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="flex justify-end space-x-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={handleCancel}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="bg-primary hover:bg-primary/90"
                                        >
                                            Save
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
};

