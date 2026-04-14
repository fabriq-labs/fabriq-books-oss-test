import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { OrganizationFormData } from '@/models/Organization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { viewAPI } from '@/api/api';
import { useTool } from '@/contexts/ToolContext';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const itemCategorySchema = z.object({
    item_category: z.string().min(1, { message: 'Item category is required' }),
    item_subcategory: z.string().optional(),
});

type ItemCategoryFormValues = z.infer<typeof itemCategorySchema>;

const ItemCategoryForm = () => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { getToolData, toolData } = useTool();
    const [initialValues, setInitialValues] = useState<any>();
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ItemCategoryFormValues>({
        resolver: zodResolver(itemCategorySchema),
        defaultValues: {
            item_category: '',
            item_subcategory: '',
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    useEffect(() => {
        const toolData = getToolData('createInvoice');
        console.log('toolData', toolData);
    }, [toolData, getToolData]); // Add toolData to dependencies

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("item_category", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    item_category: res.data.item_category,
                    item_subcategory: res.data.item_subcategory
                });
                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to fetch item category details",
                });
                console.log(err);
            });
    };

    const handleSubmit = async (data: ItemCategoryFormValues) => {
        try {
            setIsSubmitting(true);

            const submitData = {
                ...data,
            };

            if (!id) {
                await viewAPI.create(
                    "item_category",
                    viewId,
                    submitData
                );
                toast({
                    title: "Success",
                    description: "Item category created successfully",
                });
                navigate('/masters/item-categories');
            } else {
                await viewAPI.update(
                    "item_category",
                    id,
                    viewId,
                    submitData
                );
                toast({
                    title: "Success",
                    description: "Item category updated successfully",
                });
                navigate('/masters/item-categories');
            }
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

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Item Category</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Item Category' : 'Create New Item Category'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    onClick={() =>
                        navigate('/masters/item-categories')
                    }
                    className="flex items-center gap-2 text-muted-foreground"
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
                                        name="item_category"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Item Category <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Item Category" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="item_subcategory"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Item Sub Category </FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Item Sub Category" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="flex justify-end space-x-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            navigate('/masters/item-categories')
                                        }
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="bg-primary hover:bg-primary/90"
                                    >
                                        {isSubmitting ? 'Saving...' : 'Save'}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    )}
                </CardContent>
            </Card>
        </div>

    );
};

export default ItemCategoryForm;