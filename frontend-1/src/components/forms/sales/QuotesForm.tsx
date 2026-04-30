import React, { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from 'dayjs';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { Attachment } from '@/components/attachment/Attachment';
import { QuoteItems } from './QuoteItems';
import WorkflowActions from './WorkflowActions';
import { DatePicker } from 'antd';
import { Textarea } from '@/components/ui/textarea';

const quoteItemSchema = z.object({
    id: z.string(),
    item_master_id: z.string().optional(),
    item_name: z.string().optional(),
    item_number: z.string().optional(),
    item_description: z.string().optional(),
    item_type: z.string().optional(),
    quantity: z.number().min(0).optional(),
    rate: z.number().min(0).optional(),
    discount_rate: z.number().min(0).optional(),
    discount_amount: z.number().min(0).optional(),
    tax_rate: z.number().min(0).optional(),
    tax_amount: z.number().min(0).optional(),
    line_total: z.number().min(0).optional(),
    uom: z.string().optional(),
});

const quoteSchema = z.object({
    quote_number: z.string().min(1, { message: 'Quote Number is required' }),
    quote_date: z.string().min(1, { message: 'Quote Date is required' }),
    expiry_date: z.string().optional(),
    reference_number: z.string().optional(),
    customer_id: z.string().min(1, { message: 'Customer is required' }),
    location_id: z.string().optional(),
    sales_order_id: z.string().optional(),
    project_id: z.string().optional(),
    customer_notes: z.string().optional(),
    terms_and_conditions: z.string().optional(),
    total_amount: z.number().optional(),
    status: z.string().optional(),
    adjustable_label: z.string().optional(),
    adjustable_value: z.number().optional(),
    items: z.array(quoteItemSchema).min(1, { message: 'At least one item is required' }),
});
type QuoteValues = z.infer<typeof quoteSchema>;

interface QuoteFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    id?: string;
    viewId?: string;
    onSuccess?: () => void;
}
export const QuotesForm: React.FC<QuoteFormProps> = ({
    id: propId,
    viewId: propViewId,
    onCancel: propOnCancel,
    onSuccess: propOnSuccess
}) => {
    const { id: paramId, viewId: paramViewId } = useParams<{ id: string, viewId: string }>();
    const id = propId || paramId;
    const viewId = propViewId || paramViewId || "quote_view";
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [currentCurrency, setCurrentCurrency] = useState<string>('USD'); // Default currency
    // Memoize additionalFilters to prevent infinite re-renders
    const [actionData, setActionData] = React.useState<any>([]);
    const [action, setAction] = React.useState<any>(null);
    const [workflowContext, setWorkflowContext] = React.useState<any>(null);
    // Ref to track last update time to prevent duplicate API calls
    const lastUpdateRef = React.useRef<{ field: string; timestamp: number } | null>(null);
    // Ref to store the latest expiry_date value for API update
    const expiryDateRef = React.useRef<string | null>(null);
    const locationAdditionalFilters = useMemo(() => {
        return selectedCustomerId ? { customer_id: selectedCustomerId } : {};
    }, [selectedCustomerId]);

    // Form state management
    const [formData, setFormData] = useState<QuoteValues>({
    } as QuoteValues);
    const form = useForm<QuoteValues>({
        resolver: zodResolver(quoteSchema),
        defaultValues: formData,
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("quote", id, "quote_view")
            .then((res: any) => {
                setInitialValues({
                    ...res?.data,
                    adjustable_label: res?.data?.adjustable_label ?? 'Adjustable',
                    adjustable_value: Number(res?.data?.adjustable_value ?? 0),
                });
                setActionData(res?.workflow_context?.current_state_ref?.source_actions);
                setWorkflowContext(res?.workflow_context)
                setSelectedCustomerId(res.data?.customer_id || null);
                // Set currency from the customer, default to 'USD' if not set
                setCurrentCurrency(res.data?.customer?.currency_master?.base_currency || 'USD');
                // Initialize expiry_date ref with current value
                expiryDateRef.current = res.data?.expiry_date || null;
                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };
    // Search dropdown handlers
    const handleCustomerSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
        form.setValue(sourceKey, value[key]);
        // Update selected customer ID and clear location selection
        setSelectedCustomerId(value[key] || null);
        setCurrentCurrency(value?.item?.currency_master?.base_currency || 'USD');
        form.setValue('location_id', '');
        // Call API when customer is selected or cleared
        if (id) {
            viewAPI.update("quote", id, "quote_view", {
                customer_id: value[key] || '',
                location_id: undefined, // Clear location when customer changes
            })
                .then((res: any) => {
                    if (res?.data) {
                        setInitialValues(res.data);
                    }
                })
                .catch((err) => {
                    console.error("Error updating customer:", err.message);
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: "Failed to update customer information",
                    });
                });
        }
    };
    const handlCustomerSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '');
        setSelectedCustomerId(null);
        form.setValue('location_id', '');
        setCurrentCurrency('USD'); // Set default currency instead of empty string
    };
    const handleLocationSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
        form.setValue(sourceKey, value[key]);
        // Call API when location is selected or cleared
        if (id) {
            viewAPI.update("quote", id, "quote_view", {
                location_id: value[key] || '',
            })
                .then((res: any) => {
                    if (res?.data) {
                        setInitialValues(res.data);
                    }
                })
                .catch((err) => {
                    console.error("Error updating location:", err.message);
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: "Failed to update location information",
                    });
                });
        }
    };
    const handleLocationSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '');
    };
    // Handle input change for local state update only
    const handleInputChange = (field: string, value: any) => {
        // Update local state immediately
        setInitialValues((prev: any) => ({
            ...prev,
            [field]: value
        }));
        // Avoid calling API on each keystroke for text fields; update on blur only
        const fieldsToUpdateOnBlurOnly = ['customer_notes', 'terms_and_conditions', 'reference_number', 'expiry_date'];
        if (fieldsToUpdateOnBlurOnly.includes(field)) {
            return;
        }
        handleFieldUpdate(field, value);
    };
    // Handle field update API call on blur
    const handleFieldUpdate = (field: string, overrideValue?: any) => {
        if (id) {
            const currentValue = overrideValue !== undefined ? overrideValue : initialValues?.[field];

            // Prevent duplicate API calls within 500ms for the same field
            const now = Date.now();
            if (lastUpdateRef.current?.field === field &&
                now - lastUpdateRef.current.timestamp < 500) {
                return;
            }
            lastUpdateRef.current = { field, timestamp: now };

            viewAPI.update("quote", id, "quote_view", {
                [field]: currentValue
            })
                .then((res: any) => {
                    if (res?.data) {
                        setInitialValues(res.data);
                    }
                })
                .catch((err) => {
                    console.error(`Error updating ${field}:`, err.message);
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: `Failed to update ${field.replace('_', ' ')}`,
                    });
                });
        }
    };
    // Utility functions
    const formatCurrency = (amount: number, currency: string = currentCurrency) => {
        // Use USD as fallback if currency is empty or invalid
        const validCurrency = currency && currency.trim() !== '' ? currency : 'USD';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: validCurrency,
        }).format(amount);
    };

    const handleSubmit = async (data: any) => {
        try {
            setIsSubmitting(true);

            const submissionData = {
                ...data,
            };

            if (!id) {
                await viewAPI.create(
                    "quote",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Quote created successfully",
                });

                // Call onSuccess callback if provided
                if (propOnSuccess) {
                    propOnSuccess();
                } else {
                    navigate('/sales/quotes');
                }
            } else {
                await viewAPI.update(
                    "quote",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Quote updated successfully",
                });

            }

            // Call onSuccess callback if provided
            if (propOnSuccess) {
                propOnSuccess();
            } else {
                navigate('/sales/quotes');
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

    const handleCancel = () => {
        // Refresh current Quote details to update UI
        if (propOnCancel) {
            propOnCancel();
            propOnSuccess?.();
        } else {
            navigate('/sales/quotes');
        }
        // Intentionally not navigating away to allow UI to reflect refreshed data
    };

    return (
        <>
            <div className="max-w-7xl mx-auto px-2 md:px-4 space-y-4">
                <div className="mb-4 flex justify-end">
                    <Button
                        variant="ghost"
                        className="flex items-center gap-2 text-muted-foreground"
                        onClick={handleCancel}
                    >
                        <ArrowLeft size={16} />
                        Back to list
                    </Button>
                </div>
                <Card className="border border-border/70 shadow-sm overflow-hidden rounded-lg">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>
                                {initialValues ? 'Edit Quote' : 'New Quote'}
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-5 md:p-6 space-y-7 bg-background">
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
                                    {/* Quote number/date on right, editable fields on left */}
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="expiry_date"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Expiry Date
                                                            </FormLabel>
                                                            <FormControl>
                                                                <DatePicker
                                                                    className="w-full h-10 px-3 py-2 border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    style={{ width: "100%" }}
                                                                    value={initialValues?.expiry_date ? dayjs(initialValues.expiry_date) : null}
                                                                    onChange={(date) => {
                                                                        const dateValue = date ? date.toISOString() : '';
                                                                        expiryDateRef.current = dateValue;
                                                                        handleInputChange('expiry_date', dateValue);
                                                                    }}
                                                                    onOpenChange={(open) => {
                                                                        if (!open && expiryDateRef.current !== null) {
                                                                            handleFieldUpdate('expiry_date', expiryDateRef.current);
                                                                        }
                                                                    }}
                                                                    format="DD-MM-YYYY"
                                                                    placeholder="Select expiry date"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="reference_number"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Reference#
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Enter reference number"
                                                                    value={initialValues?.reference_number || ''}
                                                                    onChange={(e) => handleInputChange('reference_number', e.target.value)}
                                                                    onBlur={() => handleFieldUpdate('reference_number')}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="customer_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Customer
                                                            </FormLabel>
                                                            <FormControl>
                                                                <SearchDropDown
                                                                    instanceType="customers"
                                                                    instanceSourceKey="customer_id"
                                                                    instanceKey="id"
                                                                    instanceLabel="customer_name"
                                                                    instanceValue={initialValues?.customer || ''}
                                                                    onSelectItem={handleCustomerSelectChange}
                                                                    onClear={handlCustomerSelectClear}
                                                                    limit="10"
                                                                    searchParams="customer_name"
                                                                    type="customers"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="location_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Location
                                                            </FormLabel>
                                                            <FormControl>
                                                                <SearchDropDown
                                                                    instanceType="location"
                                                                    instanceSourceKey="location_id"
                                                                    instanceKey="id"
                                                                    instanceLabel="location"
                                                                    instanceValue={initialValues?.location || ''}
                                                                    onSelectItem={handleLocationSelectChange}
                                                                    onClear={handleLocationSelectClear}
                                                                    limit="10"
                                                                    searchParams="location"
                                                                    type="location"
                                                                    additionalFilters={locationAdditionalFilters}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="project_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Project
                                                            </FormLabel>
                                                            <FormControl>
                                                                <SearchDropDown
                                                                    instanceType="project_master"
                                                                    instanceSourceKey="project_id"
                                                                    instanceKey="id"
                                                                    instanceLabel="project_name"
                                                                    instanceValue={initialValues?.project || ''}
                                                                    onSelectItem={(sourceKey, key, value) => {
                                                                        form.setValue(sourceKey, value[key]);
                                                                        handleInputChange('project_id', value[key]);
                                                                    }}
                                                                    onClear={(sourceKey) => {
                                                                        form.setValue(sourceKey, '');
                                                                        handleInputChange('project_id', '');
                                                                    }}
                                                                    limit="10"
                                                                    searchParams="project_name"
                                                                    type="project_master"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="quote_number" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Quote Number
                                                    </Label>
                                                    <p className="text-base text-foreground leading-6">
                                                        {initialValues?.quote_number || '--'}
                                                    </p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="quote_date" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Quote Date
                                                    </Label>
                                                    <p className="text-base text-foreground leading-6">
                                                        {initialValues?.quote_date ? dayjs(initialValues.quote_date).format("DD-MM-YYYY") : '--'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quote Items Section */}
                                    {id && (
                                        <QuoteItems
                                            quoteId={id as string}
                                            details={initialValues}
                                            setDetails={setInitialValues}
                                            currentCurrency={currentCurrency}
                                        />
                                    )}

                                    {/* Zoho-style Notes, Terms and Attachments */}
                                    <div className="pt-4 border-t border-border/60">
                                        <div className="rounded-lg border border-border/70 bg-muted/10 divide-y divide-border/60">
                                            <div className="p-4 space-y-2">
                                                <Label htmlFor="customer_notes" className="text-sm font-medium text-foreground">
                                                    Customer Notes
                                                </Label>
                                                <Textarea
                                                    id="customer_notes"
                                                    placeholder="Enter any notes to be displayed in your transaction."
                                                    value={initialValues?.customer_notes || ''}
                                                    onChange={(e) => handleInputChange("customer_notes", e.target.value)}
                                                    onBlur={() => handleFieldUpdate("customer_notes")}
                                                    className="min-h-[78px] border-border/70 bg-background resize-y"
                                                    rows={2}
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]">
                                                <div className="p-4 space-y-2 border-b lg:border-b-0 lg:border-r border-border/60">
                                                    <Label htmlFor="terms_and_conditions" className="text-sm font-medium text-foreground">
                                                        Terms &amp; Conditions
                                                    </Label>
                                                    <Textarea
                                                        id="terms_and_conditions"
                                                        placeholder="Enter the terms and conditions of your business to be displayed in your transaction."
                                                        value={initialValues?.terms_and_conditions || ''}
                                                        onChange={(e) => handleInputChange("terms_and_conditions", e.target.value)}
                                                        onBlur={() => handleFieldUpdate("terms_and_conditions")}
                                                        className="min-h-[110px] border-border/70 bg-background resize-y"
                                                        rows={4}
                                                    />
                                                </div>
                                                <div className="p-4 space-y-2">
                                                    <p className="text-sm font-medium text-foreground">
                                                        Attach File(s) to Quote
                                                    </p>
                                                    <Attachment model="quote" id={id} />
                                                </div>
                                            </div>
                                        </div>
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

