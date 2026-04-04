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
import { DeliveryChallanItems } from './DeliveryChallanItems';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from 'antd';
import { Textarea } from '@/components/ui/textarea';

const deliveryChallanSchema = z.object({
    challan_number: z.string().min(1, { message: 'Delivery Challan Number is required' }),
    challan_date: z.string().min(1, { message: 'Delivery Challan Date is required' }),
    challan_type: z.enum(['DELIVERY', 'REPLACEMENT', 'RETURN', 'JOB_WORK', 'STOCK_TRANSFER', 'SAMPLE', 'EXHIBITION_DEMO', 'APPROVAL', 'CONSIGNMENT']).optional(),
    customer_id: z.string().min(1, { message: 'Customer is required' }),
    location_id: z.string().optional(),
    sales_order_id: z.string().optional(),
    reference_number: z.string().optional(),
    delivery_status: z.enum(['SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED']).optional(),
    delivery_date: z.string().optional(),
    driver_name: z.string().optional(),
    vehicle_number: z.string().optional(),
    delivery_notes: z.string().optional(),
    notes: z.string().optional(),
    terms_and_conditions: z.string().optional(),
    partial_delivery_reason: z.string().optional(),
});
type DeliveryChallanValues = z.infer<typeof deliveryChallanSchema>;

interface DeliveryChallanFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    id?: string;
    viewId?: string;
    onSuccess?: () => void;
}
export const DeliveryChallanForm: React.FC<DeliveryChallanFormProps> = ({
    id: propId,
    viewId: propViewId,
    onCancel: propOnCancel,
    onSuccess: propOnSuccess
}) => {
    const { id: paramId, viewId: paramViewId } = useParams<{ id: string, viewId: string }>();
    const id = propId || paramId;
    const viewId = propViewId || paramViewId || "delivery_challan_view";
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
    const form = useForm<DeliveryChallanValues>({
        resolver: zodResolver(deliveryChallanSchema),
        defaultValues: {} as DeliveryChallanValues,
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
                challan_number: initialValues?.challan_number || '',
                challan_date: initialValues?.challan_date || '',
                challan_type: initialValues?.challan_type || '',
                customer_id: initialValues?.customer_id || '',
                location_id: initialValues?.location_id || '',
                sales_order_id: initialValues?.sales_order_id || '',
                reference_number: initialValues?.reference_number || '',
                delivery_status: initialValues?.delivery_status || '',
                delivery_date: initialValues?.delivery_date || '',
                driver_name: initialValues?.driver_name || '',
                vehicle_number: initialValues?.vehicle_number || '',
                delivery_notes: initialValues?.delivery_notes || '',
                notes: initialValues?.notes || '',
                terms_and_conditions: initialValues?.terms_and_conditions || '',
                partial_delivery_reason: initialValues?.partial_delivery_reason || '',
            });
        }
    }, [initialValues, form]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("delivery_challan", id, "delivery_challan_view")
            .then((res: any) => {
                setInitialValues(res?.data);
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
            viewAPI.update("delivery_challan", id, "delivery_challan_view", {
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
            viewAPI.update("delivery_challan", id, "delivery_challan_view", {
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
        const fieldsToUpdateOnBlurOnly = ['notes', 'driver_name', 'vehicle_number', 'terms_and_conditions', 'delivery_notes', 'partial_delivery_reason', 'reference_number', 'delivery_date'];
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

            viewAPI.update("delivery_challan", id, "delivery_challan_view", {
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
                    "delivery_challan",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Delivery Challan created successfully",
                });

                // Call onSuccess callback if provided
                if (propOnSuccess) {
                    propOnSuccess();
                } else {
                    navigate('/sales/delivery-challans');
                }
            } else {
                await viewAPI.update(
                    "delivery_challan",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Delivery Challan updated successfully",
                });
            }

            // Call onSuccess callback if provided
            if (propOnSuccess) {
                propOnSuccess();
            } else {
                navigate('/sales/delivery-challans');
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
        // Refresh current Delivery Challan details to update UI
        if (propOnCancel) {
            propOnCancel();
            propOnSuccess?.();
        } else {
            navigate('/sales/delivery-challans');
        }
        // Intentionally not navigating away to allow UI to reflect refreshed data
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
                        <div className="flex items-center justify-between">
                            <CardTitle>
                                {initialValues ? 'Edit Delivery Challan' : 'New Delivery Challan'}
                            </CardTitle>
                        </div>
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
                                    {/* Delivery Challan Number, Date, Type, and Reference Row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="challan_number" className="text-sm font-semibold text-gray-700">
                                                Delivery Challan#
                                            </Label>
                                            <Input
                                                type="text"
                                                value={initialValues?.challan_number || ''}
                                                disabled
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="challan_date" className="text-sm font-semibold text-gray-700">
                                                Delivery Challan Date
                                            </Label>
                                            <Input
                                                type="text"
                                                value={initialValues?.challan_date ? dayjs(initialValues.challan_date).format("DD-MM-YYYY") : ''}
                                                disabled
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="challan_type"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm font-semibold text-gray-700">
                                                        Challan Type
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Select
                                                            value={field.value || initialValues?.challan_type || ''}
                                                            onValueChange={(value) => {
                                                                field.onChange(value);
                                                                handleInputChange('challan_type', value);
                                                            }}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Choose a proper challan type." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="DELIVERY">DELIVERY</SelectItem>
                                                                <SelectItem value="REPLACEMENT">REPLACEMENT</SelectItem>
                                                                <SelectItem value="RETURN">RETURN</SelectItem>
                                                                <SelectItem value="JOB_WORK">JOB WORK</SelectItem>
                                                                <SelectItem value="STOCK_TRANSFER">STOCK TRANSFER</SelectItem>
                                                                <SelectItem value="SAMPLE">SAMPLE</SelectItem>
                                                                <SelectItem value="EXHIBITION_DEMO">EXHIBITION DEMO</SelectItem>
                                                                <SelectItem value="APPROVAL">APPROVAL</SelectItem>
                                                                <SelectItem value="CONSIGNMENT">CONSIGNMENT</SelectItem>
                                                            </SelectContent>
                                                        </Select>
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
                                                    <FormLabel className="text-sm font-semibold text-gray-700">
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
                                    </div>

                                    {/* Customer and Location Row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="customer_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm font-semibold text-gray-700">
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
                                                    <FormLabel className="text-sm font-semibold text-gray-700">
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
                                    {/* Driver Name and Vehicle Number Row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="driver_name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm font-semibold text-gray-700">
                                                        Driver Name
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="text"
                                                            placeholder="Enter driver name"
                                                            value={initialValues?.driver_name || ''}
                                                            onChange={(e) => handleInputChange('driver_name', e.target.value)}
                                                            onBlur={() => handleFieldUpdate('driver_name')}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="vehicle_number"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm font-semibold text-gray-700">
                                                        Vehicle Number
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="text"
                                                            placeholder="Enter vehicle number"
                                                            value={initialValues?.vehicle_number || ''}
                                                            onChange={(e) => handleInputChange('vehicle_number', e.target.value)}
                                                            onBlur={() => handleFieldUpdate('vehicle_number')}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    {/* Delivery Status and Delivery Date Row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="delivery_status"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm font-semibold text-gray-700">
                                                        Delivery Status
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Select
                                                            value={field.value || initialValues?.delivery_status || ''}
                                                            onValueChange={(value) => {
                                                                field.onChange(value);
                                                                handleInputChange('delivery_status', value);
                                                            }}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select delivery status" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="SCHEDULED">SCHEDULED</SelectItem>
                                                                <SelectItem value="IN_TRANSIT">IN TRANSIT</SelectItem>
                                                                <SelectItem value="DELIVERED">DELIVERED</SelectItem>
                                                                <SelectItem value="PARTIALLY_DELIVERED">PARTIALLY DELIVERED</SelectItem>
                                                                <SelectItem value="FAILED">FAILED</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="delivery_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm font-semibold text-gray-700">
                                                        Delivery Date
                                                    </FormLabel>
                                                    <FormControl>
                                                        <DatePicker
                                                            className="w-full h-10 px-3 py-2 border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                            style={{ width: "100%" }}
                                                            value={initialValues?.delivery_date ? dayjs(initialValues.delivery_date) : null}
                                                            onChange={(date) => {
                                                                const dateValue = date ? date.toISOString() : '';
                                                                handleInputChange('delivery_date', dateValue);
                                                            }}
                                                            onOpenChange={(open) => {
                                                                // When calendar closes (open becomes false), update API
                                                                if (!open && initialValues?.delivery_date) {
                                                                    handleFieldUpdate('delivery_date');
                                                                }
                                                            }}
                                                            format="DD-MM-YYYY"
                                                            placeholder="Select delivery date"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>


                                    {/* Attachments */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            Attachments
                                        </label>
                                        <Attachment
                                            model="delivery_challan"
                                            id={id}
                                        />
                                    </div>

                                    {/* Delivery Challan Items Section */}
                                    {id && (
                                        <DeliveryChallanItems
                                            challanId={id as string}
                                            details={initialValues}
                                            setDetails={setInitialValues}
                                            currentCurrency={currentCurrency}
                                        />
                                    )}

                                    {/* Notes and Terms and Conditions */}
                                    <div className="space-y-4 pt-4 border-t border-border/60">
                                        <div className="space-y-2">
                                            <Label htmlFor="notes" className="text-sm font-semibold text-gray-700">
                                                Notes
                                            </Label>
                                            <Textarea
                                                id="notes"
                                                placeholder="Additional notes or instructions"
                                                value={initialValues?.notes ?? ''}
                                                onChange={(e) => handleInputChange("notes", e.target.value)}
                                                onBlur={() => handleFieldUpdate("notes")}
                                                className="min-h-[80px] border-border/60 resize-y"
                                                rows={3}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="terms_and_conditions" className="text-sm font-semibold text-gray-700">
                                                Terms and Conditions
                                            </Label>
                                            <Textarea
                                                id="terms_and_conditions"
                                                placeholder="Enter terms and conditions"
                                                value={initialValues?.terms_and_conditions ?? ''}
                                                onChange={(e) => handleInputChange("terms_and_conditions", e.target.value)}
                                                onBlur={() => handleFieldUpdate("terms_and_conditions")}
                                                className="min-h-[80px] border-border/60 resize-y"
                                                rows={3}
                                            />
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

