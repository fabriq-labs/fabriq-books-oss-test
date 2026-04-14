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
    // gl_number: z.string().min(1, { message: 'GL Number is required' }),
    gl_code: z.string().min(1, { message: 'GL Code is required' }).refine(
        (value) => !isNaN(parseFloat(value)) && parseInt(value) >= 0,
        { message: 'GL Code must be a valid positive number' }
    ),
    gl_name: z.string().min(1, { message: 'GL Name is required' }),
    description: z.string().min(1, { message: 'Description is required' }),
    account_id: z.string().min(1, { message: 'COA is required' }),
    legal_entity_id: z.string().min(1, { message: 'Legal Entity is required' }),
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

export const GeneralLedgerForm: React.FC<ItemMasterFormProps> = (
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
            account_id: '',
            description: '',
            gl_code: '',
            gl_name: '',
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
        viewAPI.getById("general_ledger", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    account_id: res.data.account_id?.toString() || '',
                    gl_name: res.data.gl_name || '',
                    description: res.data.description || '',
                    gl_code: res.data.gl_code?.toString() || '',
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
                gl_code: parseInt(data.gl_code)
            };

            if (!id) {
                await viewAPI.create(
                    "general_ledger",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "General Legder created successfully",
                });
                navigate('/master/finance/ledger');
            } else {
                await viewAPI.update(
                    "general_ledger",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "General Legder updated successfully",
                });
            }
            navigate('/master/finance/ledger');
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
        // Update gl_code when account_id is selected
        if (sourceKey === 'account_id' && value?.item?.account_number) {
            console.log(value.item.account_number);
            form.setValue("gl_code", value.item.account_number.toString(), { shouldValidate: true });
        }
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
        navigate('/master/finance/ledger');
    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">General Ledger</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit General Ledger' : 'Create New General Ledger'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/master/finance/ledger')}
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
                                    {/* <FormField
                                        control={form.control}
                                        name="gl_number"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>GL Number <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter GL Number" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    /> */}
                                    <FormField
                                        control={form.control}
                                        name="gl_code"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>GL Code <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter GL Code"
                                                        value={field.value || ''}
                                                        onChange={(e) => handleUnitPriceChange(e, field.onChange)}
                                                        disabled
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="gl_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>GL Name <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter GL Name" {...field} />
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
                                                <FormLabel>Description <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Description" {...field} />
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
                                                <FormLabel>Legal Entity <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="organization"
                                                    instanceSourceKey="legal_entity_id"
                                                    instanceKey="id"
                                                    instanceLabel="legal_name"
                                                    instanceValue={
                                                        initialValues?.organization
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="legal_name"
                                                    type="general_ledger"

                                                />

                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    <FormField
                                        control={form.control}
                                        name="account_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>COA <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="account"
                                                    instanceSourceKey="account_id"
                                                    instanceKey="id"
                                                    instanceLabel="name"
                                                    instanceValue={
                                                        initialValues?.account
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={handleSelectClear}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )} />


                                    <FormField
                                        control={form.control}
                                        name="status"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Status <span className="text-red-500">*</span></FormLabel>
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