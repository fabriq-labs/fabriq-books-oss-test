import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '@/components/utils/helper';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
const itemMasterSchema = z.object({
    payment_terms: z.string().min(1, { message: 'Payment Terms is required' }),
    description: z.string().min(1, { message: 'Description is required' }),
    legal_entity_id: z.string().min(1, { message: 'Legal Entity is required' }),
    no_of_days: z.string().optional().refine(
        (value) => !isNaN(parseFloat(value)) && parseInt(value) >= 0,
        { message: 'No of Days must be a valid positive number' }
    ),
    status: z.string().min(1, { message: 'Status is required' }),
});

type ItemMasterValues = z.infer<typeof itemMasterSchema>;

interface ItemMasterFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    uomOptions?: any[];
    itemCategoryOptions?: any[];
    supplierOptions?: any[];
}

export const PaymentTermsForm: React.FC<ItemMasterFormProps> = (
) => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: initialValues || {
            payment_terms: '',
            description: '',
            no_of_days: '',
            legal_entity_id: '',
            status: '',

        },
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("payment_terms", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    payment_terms: res.data.payment_terms || '',
                    description: res.data.description || '',
                    no_of_days: res.data.no_of_days?.toString() || '',
                    legal_entity_id: res.data.legal_entity_id?.toString() || '',
                    status: res.data.status || '',
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

            const submissionData = {
                ...data,
                no_of_days: parseInt(data.no_of_days)
            };

            if (!id) {
                await viewAPI.create(
                    "payment_terms",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Payment Terms created successfully",
                });
                navigate('/accounting/payment-terms');
            } else {
                await viewAPI.update(
                    "payment_terms",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Payment Terms updated successfully",
                });
            }
            navigate('/accounting/payment-terms');
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Something went wrong",
            });
            console.error("Error:", error.message);
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key], { shouldValidate: true }); // ✅ trigger validation
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '', { shouldValidate: true }); // ✅ trigger validation
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
        navigate('/accounting/payment-terms');
    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Payment Terms Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Payment Terms' : 'Create New Payment Terms'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/accounting/payment-terms')}
                >
                    <ArrowLeft size={16} />
                    Back to list
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>
                        {/* {initialValues ? 'Edit Item Category' : 'Create Item Category'} */}
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
                                        name="payment_terms"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Payment Terms  <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Payment Terms" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Description  <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Description" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="no_of_days"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>No Of Days</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter No Of Days"
                                                        value={field.value || ''} // keep in sync
                                                        onChange={(e) => handleUnitPriceChange(e, field.onChange)}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="legal_entity_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Legal Entity  <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="entity"
                                                    instanceSourceKey="legal_entity_id"
                                                    instanceKey="id"
                                                    instanceLabel="legal_name"
                                                    instanceValue={
                                                        initialValues?.legal_entity
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="legal_name"
                                                    type="payment_terms"
                                                />

                                                <FormMessage />
                                            </FormItem>
                                        )} />

                                    <FormField
                                        control={form.control}
                                        name="status"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Status  <span className="text-red-500">*</span></FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select item status" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Active">Active</SelectItem>
                                                        <SelectItem value="InActive">InActive</SelectItem>
                                                    </SelectContent>
                                                </Select>
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
                        </Form>)}
                </CardContent>
            </Card>
        </div>

    );
};