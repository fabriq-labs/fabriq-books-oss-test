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
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchDropDown } from '../../search_dropdown/dropdown';
import { constructObject } from '../../utils/helper';

const supplierItemSchema = z.object({
    supplier_id: z.string().min(1, { message: 'Supplier is required' }),
    item_id: z.string().min(1, { message: 'Item  is required' }),
});

type ItemCategoryFormValues = z.infer<typeof supplierItemSchema>;

const SupplierItemsForm = () => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [initialValues, setInitialValues] = useState<any>();
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ItemCategoryFormValues>({
        resolver: zodResolver(supplierItemSchema),
        defaultValues: {
            supplier_id: '',
            item_id: '',
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("supplier_items", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    supplier_id: res.data.supplier_id,
                    item_id: res.data.item_id,
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

            if (!id) {
                await viewAPI.create(
                    "supplier_items",
                    viewId,
                    data
                );
                toast({
                    title: "Success",
                    description: "Item category created successfully",
                });
                navigate('/master/procurement/supplier-items');
            } else {
                await viewAPI.update(
                    "supplier_items",
                    id,
                    viewId,
                    data
                );
                toast({
                    title: "Success",
                    description: "Item category updated successfully",
                });
                navigate('/master/procurement/supplier-items');
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

    const handleSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key], { shouldValidate: true }); // ✅ trigger validation
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '', { shouldValidate: true }); // ✅ trigger validation
    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Supplier Item</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Supplier Items' : 'Create New Supplier Items'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    onClick={() =>
                        navigate('/master/procurement/supplier-items')
                    }
                    className="flex items-center gap-2 text-muted-foreground"
                >
                    <ArrowLeft size={16} />
                    Back to list
                </Button>
            </div>
            <Card>
                <CardHeader>
                    {/* <CardTitle>{initialValues ? 'Edit Item Category' : 'Create Item Category'}</CardTitle> */}
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
                                        name="supplier_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Supplier <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="supplier"
                                                    instanceSourceKey="supplier_id"
                                                    instanceKey="id"
                                                    instanceLabel="supplier_name"
                                                    instanceValue={initialValues?.supplier}
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('supplier_id')}
                                                    limit="10"
                                                    searchParams="supplier_name"
                                                    type="supplier_items"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="item_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Item <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="item_master"
                                                    instanceSourceKey="item_id"
                                                    instanceKey="id"
                                                    instanceLabel="item_name"
                                                    instanceValue={initialValues?.item_master}
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('item_id')}
                                                    limit="10"
                                                    searchParams="item_name"
                                                    type="supplier_items"
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
                                        onClick={() =>
                                            navigate('/master/procurement/supplier-items')
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

export default SupplierItemsForm;