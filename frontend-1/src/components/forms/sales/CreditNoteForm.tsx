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
import { CreditNoteItems } from './CreditNoteItems';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const creditNoteSchema = z.object({
    credit_note_number: z.string().min(1, { message: 'Credit Note Number is required' }),
    credit_note_date: z.string().min(1, { message: 'Credit Note Date is required' }),
    credit_note_version: z.number().optional(),
    credit_note_status: z.string().optional(),
    credit_note_type: z.enum(['SALES_RETURN', 'PRICE_ADJUSTMENT']).optional(),
    customer_id: z.string().min(1, { message: 'Customer is required' }),
    location_id: z.string().optional(),
    invoice_id: z.string().optional(),
    sales_order_id: z.string().optional(),
    account_id: z.string().optional(),
    credit_note_total: z.number().optional(),
    balance_amount: z.number().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
    terms_and_conditions: z.string().optional(),
    adjustable_label: z.string().optional(),
    adjustable_value: z.number().optional(),
});
type CreditNoteValues = z.infer<typeof creditNoteSchema>;

interface CreditNoteFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    id?: string;
    viewId?: string;
    onSuccess?: () => void;
}
export const CreditNoteForm: React.FC<CreditNoteFormProps> = ({
    id: propId,
    viewId: propViewId,
    onCancel: propOnCancel,
    onSuccess: propOnSuccess
}) => {
    const { id: paramId, viewId: paramViewId } = useParams<{ id: string, viewId: string }>();
    const id = propId || paramId;
    const viewId = propViewId || paramViewId || "credit_note_view";
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [currentCurrency, setCurrentCurrency] = useState<string>('USD'); // Default currency
    // Ref to track last update time to prevent duplicate API calls
    const lastUpdateRef = React.useRef<{ field: string; timestamp: number } | null>(null);
    const locationAdditionalFilters = useMemo(() => {
        return selectedCustomerId ? { customer_id: selectedCustomerId } : {};
    }, [selectedCustomerId]);

    // Form state management
    const form = useForm<CreditNoteValues>({
        resolver: zodResolver(creditNoteSchema),
        defaultValues: {} as CreditNoteValues,
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    // Sync form values with initialValues when they change
    useEffect(() => {
        if (initialValues) {
            form.reset({
                credit_note_number: initialValues?.credit_note_number || '',
                credit_note_date: initialValues?.credit_note_date || '',
                credit_note_version: initialValues?.credit_note_version,
                credit_note_status: initialValues?.credit_note_status || 'Draft',
                credit_note_type: initialValues?.credit_note_type || '',
                customer_id: initialValues?.customer_id || '',
                location_id: initialValues?.location_id || '',
                invoice_id: initialValues?.invoice_id || '',
                sales_order_id: initialValues?.sales_order_id || '',
                account_id: initialValues?.account_id || '',
                credit_note_total: initialValues?.credit_note_total,
                balance_amount: initialValues?.balance_amount,
                reason: initialValues?.reason || '',
                notes: initialValues?.notes || '',
                terms_and_conditions: initialValues?.terms_and_conditions || '',
                adjustable_label: initialValues?.adjustable_label || 'Adjustable',
                adjustable_value: Number(initialValues?.adjustable_value ?? 0),
            });
        }
    }, [initialValues, form]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("credit_note", id, "credit_note_view")
            .then((res: any) => {
                setInitialValues((prev: any) => ({
                    ...res?.data,
                    adjustable_label: res?.data?.adjustable_label ?? 'Adjustable',
                    adjustable_value: Number(res?.data?.adjustable_value ?? 0),
                }));
                setSelectedCustomerId(res.data?.customer_id || null);
                // Set currency from the customer, default to 'USD' if not set
                setCurrentCurrency(res.data?.customer?.currency_master?.base_currency || 'USD');
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
            viewAPI.update("credit_note", id, "credit_note_view", {
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
            viewAPI.update("credit_note", id, "credit_note_view", {
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
        const fieldsToUpdateOnBlurOnly = ['notes', 'terms_and_conditions', 'reason', 'credit_note_status'];
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

            viewAPI.update("credit_note", id, "credit_note_view", {
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

            let parsedDetails = {};
            try {
                if (data?.notes) {
                    parsedDetails = JSON.parse(data.notes);
                }
            } catch (error) {
                parsedDetails = { text: data.notes };
            }

            const submissionData = {
                ...data,
                notes: parsedDetails,
            };

            if (!id) {
                await viewAPI.create(
                    "credit_note",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Credit Note created successfully",
                });

                // Call onSuccess callback if provided
                if (propOnSuccess) {
                    propOnSuccess();
                } else {
                    navigate('/sales/credit-notes');
                }
            } else {
                await viewAPI.update(
                    "credit_note",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Credit Note updated successfully",
                });
            }

            // Call onSuccess callback if provided
            if (propOnSuccess) {
                propOnSuccess();
            } else {
                navigate('/sales/credit-notes');
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
        // Refresh current Credit Note details to update UI
        if (propOnCancel) {
            propOnCancel();
            propOnSuccess?.();
        } else {
            navigate('/sales/credit-notes');
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
                                {initialValues ? 'Edit Credit Note' : 'New Credit Note'}
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
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* <FormField
                                                    control={form.control}
                                                    name="credit_note_type"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Credit Note Type
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Select
                                                                    value={field.value || initialValues?.credit_note_type || ''}
                                                                    onValueChange={(value) => {
                                                                        field.onChange(value);
                                                                        handleInputChange('credit_note_type', value);
                                                                    }}
                                                                >
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Choose a credit note type" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="SALES_RETURN">SALES RETURN</SelectItem>
                                                                        <SelectItem value="PRICE_ADJUSTMENT">PRICE ADJUSTMENT</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                /> */}
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
                                                                    instanceValue={initialValues?.customers || ''}
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
                                                <FormField
                                                    control={form.control}
                                                    name="account_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Account
                                                            </FormLabel>
                                                            <FormControl>
                                                                <SearchDropDown
                                                                    instanceType="account"
                                                                    instanceSourceKey="account_id"
                                                                    instanceKey="id"
                                                                    instanceLabel="name"
                                                                    instanceValue={initialValues?.account || ''}
                                                                    onSelectItem={(sourceKey, key, value) => {
                                                                        form.setValue(sourceKey, value[key]);
                                                                        handleInputChange('account_id', value[key]);
                                                                    }}
                                                                    onClear={(sourceKey) => {
                                                                        form.setValue(sourceKey, '');
                                                                        handleInputChange('account_id', '');
                                                                    }}
                                                                    limit="10"
                                                                    searchParams="name"
                                                                    type="account"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="reason"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Subject
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Enter reason for credit note"
                                                                    value={initialValues?.reason || ''}
                                                                    onChange={(e) => handleInputChange('reason', e.target.value)}
                                                                    onBlur={() => handleFieldUpdate('reason')}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" />
                                        </div>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="credit_note_number" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Credit Note#
                                                    </Label>
                                                    <p className="text-base text-foreground leading-6">
                                                        {initialValues?.credit_note_number || '--'}
                                                    </p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="credit_note_date" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Credit Note Date
                                                    </Label>
                                                    <p className="text-base text-foreground leading-6">
                                                        {initialValues?.credit_note_date ? dayjs(initialValues.credit_note_date).format("DD-MM-YYYY") : '--'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>




                                    {/* Credit Note Items Section */}
                                    {id && (
                                        <CreditNoteItems
                                            creditNoteId={id as string}
                                            details={initialValues}
                                            setDetails={setInitialValues}
                                            currentCurrency={currentCurrency}
                                        />
                                    )}

                                    {/* Zoho-style Notes, Terms and Attachments */}
                                    <div className="pt-4 border-t border-border/60">
                                        <div className="rounded-lg border border-border/70 bg-muted/10 divide-y divide-border/60">
                                            <div className="p-4 space-y-2">
                                                <Label htmlFor="notes" className="text-sm font-medium text-foreground">
                                                    Customer Notes
                                                </Label>
                                                <Textarea
                                                    id="notes"
                                                    placeholder="Enter any notes to be displayed in your transaction."
                                                    value={initialValues?.notes || ''}
                                                    onChange={(e) => handleInputChange("notes", e.target.value)}
                                                    onBlur={() => handleFieldUpdate("notes")}
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
                                                        Attach File(s) to Credit Note
                                                    </p>
                                                    <Attachment model="credit_note" id={id} />
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

