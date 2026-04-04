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
    color: z.string().optional(),
    name: z.string().min(1, { message: 'Name is required' }),
    group_id: z.string().min(1, { message: 'Category Group is required' }),
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

export const CategoryForm: React.FC<ItemMasterFormProps> = ({
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
            color: '',
            name: '',
            group_id: '',
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    // Handle latest form tool response updates
    useEffect(() => {
        if (latestFormToolResponse && latestFormToolResponse.result && latestFormToolResponse.result.model === 'category') {
            console.log('Latest form tool response:', latestFormToolResponse);

            if (latestFormToolResponse.result.data) {
                const toolResultData = latestFormToolResponse.result.data;
                if (toolResultData.id) {
                    setInitialValues(toolResultData);
                    form.reset({
                        name: toolResultData.name || '',
                        color: toolResultData.color || '',
                        group_id: toolResultData.group_id?.toString() || '',
                    });
                }
            }
        }
    }, [latestFormToolResponse, form]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("category", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    name: res.data.name || '',
                    color: res.data.color || '',
                    group_id: res.data.group_id?.toString() || '',
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
                group_id: data.group_id || null
            };

            if (!id) {
                await viewAPI.create(
                    "category",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Category created successfully",
                });

                if (propOnSuccess) {
                    propOnSuccess();
                } else {
                    navigate('/accounting/categories');
                }
            } else {
                await viewAPI.update(
                    "category",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Category updated successfully",
                });
            }

            if (propOnSuccess) {
                propOnSuccess();
            } else {
                navigate('/accounting/categories');
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
            navigate('/accounting/categories');
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
                            {initialValues ? 'Edit Category' : 'Create Category'}
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
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="color"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Color</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter color" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="group_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Category Group</FormLabel>
                                                <SearchDropDown
                                                    instanceType="category_group"
                                                    instanceSourceKey="group_id"
                                                    instanceKey="id"
                                                    instanceLabel="name"
                                                    instanceValue={initialValues?.category_group}
                                                    onSelectItem={onhandleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="name"
                                                    type="category"
                                                />
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


