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
import dayjs from 'dayjs';
import { constructObject } from '@/components/utils/helper';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
const businessUnitSchema = z.object({
    name: z.string().min(1, { message: 'Department is required' }),
    business_unit_id: z.string().optional(),
    legal_entity_id: z.string().min(1, { message: 'Legal Entity is required' }),
});
type ItemMasterValues = z.infer<typeof businessUnitSchema>;

interface ItemMasterFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    uomOptions?: any[];
    itemCategoryOptions?: any[];
    supplierOptions?: any[];
}

export const DepartmentForm: React.FC<ItemMasterFormProps> = (
) => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(businessUnitSchema),
        defaultValues: initialValues || {
            business_unit_id: '',
            legal_entity_id: '',
            name: '',
        },
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("department", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    business_unit_id: res.data.business_unit_id?.toString() || '',
                    name: res.data.name || '',
                    legal_entity_id: res.data.legal_entity_id?.toString() || '',

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
                business_unit_id: data.business_unit_id || undefined,
            };

            if (!id) {
                await viewAPI.create(
                    "department",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Department created successfully",
                });
                navigate('/masters/departments');
            } else {
                await viewAPI.update(

                    "department",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Department  updated successfully",
                });
            }
            navigate('/masters/departments');
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




    const handleCancel = () => {
        navigate('/masters/departments');
    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Department Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Department' : 'Create New Department'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/masters/departments')}
                >
                    <ArrowLeft size={16} />
                    Back to list
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>

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
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Name <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Department" {...field} />
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
                                                    type="department"
                                                />

                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    <FormField
                                        control={form.control}
                                        name="business_unit_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Business Unit</FormLabel>
                                                <SearchDropDown
                                                    instanceType="business_unit"
                                                    instanceSourceKey="business_unit_id"
                                                    instanceKey="id"
                                                    instanceLabel="business_unit"
                                                    instanceValue={initialValues?.business_unit}
                                                    onSelectItem={handleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="business_unit"
                                                    type="department"
                                                />

                                                <FormMessage />
                                            </FormItem>
                                        )} />
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