import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '../../utils/helper';
import { useTool } from '@/contexts/ToolContext';
import { SearchDropDown } from '../../search_dropdown/dropdown';

const itemMasterSchema = z.object({
    customer_name: z.string().min(1, { message: 'Customer name is required' }),
    customer_address: z.string().min(1, { message: 'Customer address is required' }),
    city: z.string().min(1, { message: 'City is required' }),
    zip_code: z.string().min(1, { message: 'Zip code is required' }),
    primary_phone: z.string().min(1, { message: 'Primary phone is required' }),
    primary_email: z.string().min(1, { message: 'Primary email is required' }),
    industry: z.string().min(1, { message: 'Industry is required' }),
    website: z.string().optional(),
    payment_term_id: z.string().optional(),
    preferred_currency_id: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
});

type ItemMasterValues = z.infer<typeof itemMasterSchema>;

interface InstrumentFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    id?: string;
    viewId?: string;
    onSuccess?: () => void;
}

export const CustomersForm: React.FC<InstrumentFormProps> = ({
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
            customer_name: '',
            customer_address: '',
            city: '',
            state: '',
            country: '',
            zip_code: '',
            primary_phone: '',
            primary_email: '',
            industry: '',
            website: '',
            payment_term_id: '',
            preferred_currency_id: '',
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    // Handle latest form tool response updates
    useEffect(() => {
        if (latestFormToolResponse && latestFormToolResponse.result && latestFormToolResponse.result.model === 'customers') {
            console.log('Latest form tool response:', latestFormToolResponse);

            if (latestFormToolResponse.result.data) {
                const toolResultData = latestFormToolResponse.result.data;
                if (toolResultData.id) {
                    setInitialValues(toolResultData);
                    form.reset({
                        customer_name: toolResultData.customer_name || '',
                        customer_address: toolResultData.customer_address || '',
                        city: toolResultData.city || '',
                        state: toolResultData.state || '',
                        country: toolResultData.country || '',
                        zip_code: toolResultData.zip_code || '',
                        primary_phone: toolResultData.primary_phone || '',
                        primary_email: toolResultData.primary_email || '',
                        industry: toolResultData.industry || '',
                        website: toolResultData.website || '',
                        payment_term_id: toolResultData.payment_term_id || undefined,
                        preferred_currency_id: toolResultData.preferred_currency_id || undefined,
                    });
                }
            }
        }
    }, [latestFormToolResponse, form]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("customers", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    customer_name: res.data.customer_name || '',
                    customer_address: res.data.customer_address || '',
                    city: res.data.city || '',
                    state: res.data.state || '',
                    country: res.data.country || '',
                    zip_code: res.data.zip_code || '',
                    primary_phone: res.data.primary_phone || '',
                    primary_email: res.data.primary_email || '',
                    industry: res.data.industry || '',
                    website: res.data.website || '',
                    payment_term_id: res.data.payment_term_id || undefined,
                    preferred_currency_id: res.data.preferred_currency_id || undefined,
                });
                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };

    const handleSubmit = async (data: ItemMasterValues) => {
        try {
            setIsSubmitting(true);

            if (!id) {
                await viewAPI.create(
                    "customers",
                    viewId,
                    data
                );
                toast({
                    title: "Success",
                    description: "Customer created successfully",
                });

                if (propOnSuccess) {
                    propOnSuccess();
                } else {
                    navigate('/sales/customers');
                }
            } else {
                await viewAPI.update(
                    "customers",
                    id,
                    viewId,
                    data
                );
                toast({
                    title: "Success",
                    description: "Customer updated successfully",
                });
            }

            if (propOnSuccess) {
                propOnSuccess();
            } else {
                navigate('/sales/customers');
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

    const handleSelectChange = (
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
            navigate('/sales/customers');
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
                            {initialValues ? 'Edit Customer' : 'Create Customer'}
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="customer_name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Customer Name <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter customer name" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="customer_address"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Customer Address <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter customer address" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="city"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>City <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter city" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="state"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>State </FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter state" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="country"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Country </FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter country" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="zip_code"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Zip Code <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter zip code" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="primary_phone"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Primary Phone <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter primary phone" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="primary_email"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Primary Email <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter primary email" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="industry"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Industry <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter industry" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="website"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Website</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter website" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="payment_term_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Payment Terms</FormLabel>
                                                    <SearchDropDown
                                                        instanceType="payment_terms"
                                                        instanceSourceKey="payment_term_id"
                                                        instanceKey="id"
                                                        instanceLabel="payment_terms"
                                                        instanceValue={initialValues?.payment_terms}
                                                        onSelectItem={handleSelectChange}
                                                        onClear={handleSelectClear}
                                                        limit="10"
                                                        searchParams="payment_terms"
                                                        type="customers"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="preferred_currency_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Preferred Currency</FormLabel>
                                                    <SearchDropDown
                                                        instanceType="currency"
                                                        instanceSourceKey="preferred_currency_id"
                                                        instanceKey="id"
                                                        instanceLabel="code"
                                                        instanceValue={initialValues?.currency}
                                                        onSelectItem={handleSelectChange}
                                                        onClear={() => handleSelectClear('preferred_currency_id')}
                                                        limit="10"
                                                        searchParams="code"
                                                        type="customers"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

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

