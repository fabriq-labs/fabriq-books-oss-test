import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '@/components/utils/helper';
import dayjs from 'dayjs';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { Attachment } from '@/components/attachment/Attachment';
import { SalesOrderItems } from './SalesOrderItems';
import WorkflowActions from './WorkflowActions';

const salesOrderItemSchema = z.object({
    id: z.string(),
    item_master_id: z.string().optional(),
    item_name: z.string().optional(),
    item_description: z.string().optional(),
    item_type: z.string().optional(),
    quantity: z.number().min(0),
    rate: z.number().min(0),
    line_total: z.number().min(0),
    uom: z.string().optional(),
    item_number: z.string().optional(),
});
const salesOrderSchema = z.object({
    so_number: z.string().min(1, { message: 'Sales Order Number is required' }),
    so_date: z.string().min(1, { message: 'Sales Order Date is required' }),
    customer_id: z.string().min(1, { message: 'Customer is required' }),
    location_id: z.string().min(1, { message: 'Location is required' }),
    status: z.string().optional(),
    notes: z.string().optional(),
    payment_terms_id: z.string().optional(),
    shipping_method_id: z.string().optional(),
    shipping_terms_id: z.string().optional(),
    adjustable_label: z.string().optional(),
    adjustable_value: z.number().optional(),
    items: z.array(salesOrderItemSchema).min(1, { message: 'At least one item is required' }),
});
type SalesOrderValues = z.infer<typeof salesOrderSchema>;
type SalesOrderItem = z.infer<typeof salesOrderItemSchema>;
interface SalesOrderFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    id?: string;
    viewId?: string;
    onSuccess?: () => void;
}
export const SalesOrderForm: React.FC<SalesOrderFormProps> = ({
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
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [currentCurrency, setCurrentCurrency] = useState<string>('USD'); // Default currency
    // Memoize additionalFilters to prevent infinite re-renders
    const [actionData, setActionData] = React.useState<any>([]);
    const [action, setAction] = React.useState<any>(null);
    const [workflowContext, setWorkflowContext] = React.useState<any>(null);
    const locationAdditionalFilters = useMemo(() => {
        return selectedCustomerId ? { customer_id: selectedCustomerId } : {};
    }, [selectedCustomerId]);

    // Sort items by created_at (oldest first), same as InvoiceForm / CreditNoteItems
    const sortItemsByCreatedAt = useCallback((items: any[]) => {
        if (!items?.length) return items ?? [];
        return [...items].sort((a: any, b: any) => {
            if (a.created_at && b.created_at) {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }
            if (a.created_at && !b.created_at) return -1;
            if (!a.created_at && b.created_at) return 1;
            return String(a.id).localeCompare(String(b.id));
        });
    }, []);

    // API function to update line items
    const updateLineItemApi = useCallback(async (itemId: string, field: string, value: any, data?: any) => {
        try {
            // Update local state immediately to prevent jumping
            setInitialValues((prev: any) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    sales_order_items: prev.sales_order_items?.map((item: any) =>
                        item.id === itemId
                            ? { ...item, [field]: value, ...(data || {}) }
                            : item
                    ) || []
                };
            });
            const res = await viewAPI.updateChild(
                "sales_order",
                id,
                "sales_order_view",
                "sales_order_items",
                itemId,
                { [field]: value, ...(data || {}) }
            ) as any;
            if (res.data) {
                // Only update if there are differences to prevent unnecessary re-renders
                setInitialValues((prev: any) => {
                    if (JSON.stringify(prev) !== JSON.stringify(res.data)) {
                        // Preserve item_name from local state and sort by created_at (like InvoiceForm)
                        const updatedData = { ...res.data };
                        if (updatedData.sales_order_items) {
                            const mapped = updatedData.sales_order_items.map((apiItem: any) => {
                                const localItem = prev?.sales_order_items?.find((local: any) => local.id === apiItem.id);
                                return {
                                    ...apiItem,
                                    item_name: localItem?.item_name || apiItem.item_name
                                };
                            });
                            updatedData.sales_order_items = sortItemsByCreatedAt(mapped);
                        }
                        return updatedData;
                    }
                    return prev;
                });
            }
        } catch (error) {
            console.error("Error updating line item:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to update line item",
            });
        }
    }, [id, toast, sortItemsByCreatedAt]);

    // Form state management
    const [formData, setFormData] = useState<SalesOrderValues>({
    } as SalesOrderValues);
    const form = useForm<SalesOrderValues>({
        resolver: zodResolver(salesOrderSchema),
        defaultValues: formData,
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("sales_order", id, "sales_order_view")
            .then((res: any) => {
                const data = res?.data;
                const sortedItems = sortItemsByCreatedAt(data?.sales_order_items ?? []);
                setInitialValues(
                    data
                        ? {
                            ...data,
                            sales_order_items: sortedItems,
                            adjustable_label: data?.adjustable_label ?? 'Adjustable',
                            adjustable_value: Number(data?.adjustable_value ?? 0),
                        }
                        : data
                );
                setActionData(res?.workflow_context?.current_state_ref?.source_actions);
                setWorkflowContext(res?.workflow_context)
                setSelectedCustomerId(res.data?.customer_id || null);
                // Set currency from the customer, default to 'USD' if not set
                setCurrentCurrency(res.data?.customer?.currency_master?.base_currency || 'USD');
                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };
    // Form handlers
    const handleItemChange = (itemId: string, field: keyof SalesOrderItem, value: any) => {
        // Update local state immediately to prevent jumping
        setInitialValues((prev: any) => {
            if (!prev) return prev;
            return {
                ...prev,
                sales_order_items: prev.sales_order_items?.map((item: any) =>
                    item.id === itemId
                        ? { ...item, [field]: value }
                        : item
                ) || []
            };
        });
    };

    const handleItemBlur = (itemId: string, field: keyof SalesOrderItem, value: any) => {
        updateLineItemApi(itemId, field, value);
    };

    const addItem = async () => {
        try {
            const response = await viewAPI.addChild(
                "sales_order",
                id,
                "sales_order_view",
                "sales_order_items",
                {}
            ) as any;
            if (response?.data) {
                const sortedItems = sortItemsByCreatedAt(response.data.sales_order_items ?? []);
                setInitialValues({
                    ...response.data,
                    sales_order_items: sortedItems
                });
            }
        } catch (error) {
            console.error("Error adding line item:", error);
        }
    };

    const removeItem = async (itemId: string) => {
        try {
            const res = await viewAPI.deleteChild(
                "sales_order",
                id,
                "sales_order_view",
                "sales_order_items",
                itemId
            );
            // Update local state to remove the item
            setInitialValues((prev: any) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    sales_order_items: prev.sales_order_items?.filter((item: any) => item.id !== itemId) || []
                };
            });
        } catch (error) {
            console.error("Error deleting line item:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to delete line item",
            });
        }
    };
    // Search dropdown handlers
    const handleCustomerSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key]);
        // Update selected customer ID and clear location selection
        setSelectedCustomerId(value[key] || null);
        setCurrentCurrency(value?.item?.currency_master?.base_currency || 'USD');
        form.setValue('location_id', '');
        // Call API when customer is selected or cleared
        if (id) {
            viewAPI.update("sales_order", id, "sales_order_view", {
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
            viewAPI.update("sales_order", id, "sales_order_view", {
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
        console.log('handleInputChange', field, value);
        // Update local state immediately
        setInitialValues((prev: any) => ({
            ...prev,
            [field]: value
        }));
        // Avoid calling API on each keystroke for notes; update on blur only
        if (field === 'notes') {
            return;
        }
        handleFieldUpdate(field, value);
    };
    // Handle field update API call on blur
    const handleFieldUpdate = (field: string, overrideValue?: any) => {
        if (id) {
            const currentValue = overrideValue !== undefined ? overrideValue : initialValues?.[field];
            console.log(currentValue)
            viewAPI.update("sales_order", id, "sales_order_view", {
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
    const handleProductSelectChange = (itemId: string) => (sourceKey: any, key: string, value: any, fields: any) => {
        const additionalData = {
            item_master_id: value[key],
            item_name: value.item?.item_name || '',
            item_type: value.item?.item_type || '',
            rate: value.item?.unit_price || 0,
            item_number: value.item?.item_code || '',
            item_description: value.item?.item_description || '',
            uom: value.item?.uom || '',
        };
        // Update local state immediately to show rate right away
        setInitialValues((prev: any) => {
            if (!prev) return prev;
            return {
                ...prev,
                sales_order_items: prev.sales_order_items?.map((item: any) =>
                    item.id === itemId
                        ? { ...item, ...additionalData }
                        : item
                ) || []
            };
        });
        // Call API to update line item with product selection and additional fields
        updateLineItemApi(itemId, 'item_master_id', value[key], additionalData);
    };
    const handleProductSelectClear = (itemId: string) => (sourceKey: any) => {
        form.setValue(sourceKey, '');
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
                const result = await viewAPI.create(
                    "sales_order",
                    viewId,
                    submissionData
                ) as { data: any };

                toast({
                    title: "Success",
                    description: "Sales Order created successfully",
                });

                // Extract the ID from the response and navigate to the edit page
                if (result?.data?.id) {
                    const newId = result.data.id;
                    const viewIdToUse = viewId || "sales_order_view";

                    // Call onSuccess callback if provided
                    if (propOnSuccess) {
                        propOnSuccess();
                    } else {
                        // Navigate to the edit page with the new ID
                        navigate(`/sales_order/${newId}/view/${viewIdToUse}`);
                    }
                } else {
                    // Fallback to list page if ID is not available
                    if (propOnSuccess) {
                        propOnSuccess();
                    } else {
                        navigate('/sales/sales-orders');
                    }
                }
            } else {
                await viewAPI.update(
                    "sales_order",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Sales Order updated successfully",
                });

                // Call onSuccess callback if provided
                if (propOnSuccess) {
                    propOnSuccess();
                } else {
                    // Stay on the same page after update
                    // Optionally refresh the data
                    if (id) {
                        fetchingDetails(id);
                    }
                }
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
        // Refresh current Sales Order details to update UI
        if (propOnCancel) {
            propOnCancel();
            propOnSuccess?.();
        } else {
            navigate('/sales/sales-orders');
        }
        // Intentionally not navigating away to allow UI to reflect refreshed data
    };
    // Memoize line items to prevent unnecessary re-renders
    const memoizedLineItems = useMemo(() => {
        const items = initialValues?.sales_order_items || [];
        // Sort items by creation order - newer items should appear at the end
        return items.sort((a: any, b: any) => {
            // If items have created_at timestamps, use those
            if (a.created_at && b.created_at) {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }
            // Otherwise, sort by ID (assuming newer IDs are larger)
            return a.id.localeCompare(b.id);
        });
    }, [initialValues?.sales_order_items]);

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
                                {initialValues ? 'Edit Sales Order' : 'Create Sales Order'}
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
                                    {/* Sales Order Number/Date on right, editable fields on left */}
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                <FormField
                                                    control={form.control}
                                                    name="payment_terms_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Payment Terms
                                                            </FormLabel>
                                                            <FormControl>
                                                                <SearchDropDown
                                                                    instanceType="payment_terms"
                                                                    instanceSourceKey="payment_terms_id"
                                                                    instanceKey="id"
                                                                    instanceLabel="payment_terms"
                                                                    instanceValue={initialValues?.payment_terms || ''}
                                                                    onSelectItem={(sourceKey, key, value) => {
                                                                        form.setValue(sourceKey, value[key]);
                                                                        handleInputChange('payment_terms_id', value[key]);
                                                                    }}
                                                                    onClear={(sourceKey) => {
                                                                        form.setValue(sourceKey, '');
                                                                        handleInputChange('payment_terms_id', '');
                                                                    }}
                                                                    limit="10"
                                                                    searchParams="payment_terms"
                                                                    type="payment_terms"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="shipping_method_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Shipping Method
                                                            </FormLabel>
                                                            <FormControl>
                                                                <SearchDropDown
                                                                    instanceType="shipping_method"
                                                                    instanceSourceKey="shipping_method_id"
                                                                    instanceKey="id"
                                                                    instanceLabel="shipping_method"
                                                                    instanceValue={initialValues?.shipping_method || ''}
                                                                    onSelectItem={(sourceKey, key, value) => {
                                                                        form.setValue(sourceKey, value[key]);
                                                                        handleInputChange('shipping_method_id', value[key]);
                                                                    }}
                                                                    onClear={(sourceKey) => {
                                                                        form.setValue(sourceKey, '');
                                                                        handleInputChange('shipping_method_id', '');
                                                                    }}
                                                                    limit="10"
                                                                    searchParams="shipping_method"
                                                                    type="shipping_method"
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
                                                    name="shipping_terms_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                                Shipping Terms
                                                            </FormLabel>
                                                            <FormControl>
                                                                <SearchDropDown
                                                                    instanceType="shipping_terms"
                                                                    instanceSourceKey="shipping_terms_id"
                                                                    instanceKey="id"
                                                                    instanceLabel="shipping_terms"
                                                                    instanceValue={initialValues?.shipping_terms || ''}
                                                                    onSelectItem={(sourceKey, key, value) => {
                                                                        form.setValue(sourceKey, value[key]);
                                                                        handleInputChange('shipping_terms_id', value[key]);
                                                                    }}
                                                                    onClear={(sourceKey) => {
                                                                        form.setValue(sourceKey, '');
                                                                        handleInputChange('shipping_terms_id', '');
                                                                    }}
                                                                    limit="10"
                                                                    searchParams="shipping_terms"
                                                                    type="shipping_terms"
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
                                                    <Label htmlFor="so_number" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Sales Order Number
                                                    </Label>
                                                    <p className="text-base text-foreground leading-6">
                                                        {initialValues?.so_number || '--'}
                                                    </p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="so_date" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Sales Order Date
                                                    </Label>
                                                    <p className="text-base text-foreground leading-6">
                                                        {initialValues?.so_date ? dayjs(initialValues.so_date).format("DD-MM-YYYY") : '--'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sales Order Items Section */}
                                    {id && (
                                        <SalesOrderItems
                                            orderId={id as string}
                                            details={initialValues}
                                            setDetails={setInitialValues}
                                            currentCurrency={currentCurrency}
                                        />
                                    )}

                                    {/* Zoho-style Notes, Terms and Attachments */}
                                    <div className="pt-4 border-t border-border/60">
                                        <div className="rounded-lg border border-border/70 bg-muted/10 divide-y divide-border/60">
                                            <div className="p-4 space-y-2">
                                                <Label htmlFor="notes" className="text-sm font-medium text-foreground">Notes</Label>
                                                <Textarea
                                                    id="notes"
                                                    placeholder="Additional notes or instructions"
                                                    value={initialValues?.notes ?? ""}
                                                    onChange={(e) => handleInputChange("notes", e.target.value)}
                                                    onBlur={(e) => {
                                                        if (id) {
                                                            handleFieldUpdate("notes", e.target.value);
                                                        }
                                                    }}
                                                    className="min-h-[78px] border-border/70 bg-background resize-y"
                                                    rows={2}
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]">
                                                <div className="p-4 space-y-2 border-b lg:border-b-0 lg:border-r border-border/60">
                                                    <Label htmlFor="terms_and_conditions" className="text-sm font-medium text-foreground">Terms and Conditions</Label>
                                                    <Textarea
                                                        id="terms_and_conditions"
                                                        placeholder="Enter terms and conditions"
                                                        value={initialValues?.terms_and_conditions ?? ""}
                                                        onChange={(e) => handleInputChange("terms_and_conditions", e.target.value)}
                                                        onBlur={(e) => {
                                                            if (id) {
                                                                handleFieldUpdate("terms_and_conditions", e.target.value);
                                                            }
                                                        }}
                                                        className="min-h-[110px] border-border/70 bg-background resize-y"
                                                        rows={4}
                                                    />
                                                </div>
                                                <div className="p-4 space-y-2">
                                                    <p className="text-sm font-medium text-foreground">
                                                        Attach File(s) to Sales Order
                                                    </p>
                                                    <Attachment model="sales_order" id={id} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Form Actions */}
                                    <WorkflowActions
                                        actionData={actionData}
                                        setActionData={setActionData}
                                        data={initialValues}
                                        setAction={setAction}
                                        type="sales_order"
                                        state={initialValues?.status || ''}
                                        view="sales_order_view"
                                        id={id as string}
                                        workflowContext={workflowContext}
                                        onCancel={handleCancel}
                                    />

                                </form>
                            </Form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
};

