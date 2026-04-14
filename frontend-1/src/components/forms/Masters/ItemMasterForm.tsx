/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '@/components/utils/helper';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Modal } from 'antd';
import { RequiredFormLabel } from '@/utils/formUtils';
import { useDataGraphAndSchema } from '@/hooks/useDataGraphAndSchema';

interface ItemMasterFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    uomOptions?: any[];
    itemCategoryOptions?: any[];
    supplierOptions?: any[];
}

export const ItemMasterForm: React.FC<ItemMasterFormProps> = (
) => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    // Use hook to fetch data graph and build schema
    const model = 'item_master';
    const view = viewId;
    const { dataGraph, schema: dynamicSchema, isLoading: isLoadingDataGraph } = useDataGraphAndSchema(model, view, setIsLoading);
    const [supplierItems, setSupplierItems] = useState<any[]>([]);
    const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
    const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
    const [availableSuppliers, setAvailableSuppliers] = useState<any[]>([]);
    const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
    const [supplierSearchTerm, setSupplierSearchTerm] = useState<string>('');

    type ItemMasterValues = z.infer<typeof dynamicSchema>;

    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(dynamicSchema),
        defaultValues: initialValues || {},
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])


    // Update form resolver when schema changes
    useEffect(() => {
        if (dynamicSchema && !isLoadingDataGraph) {
            form.clearErrors();
            // Re-validate form with new schema
            const currentValues = form.getValues();
            form.reset(currentValues, { keepValues: true });
        }
    }, [dynamicSchema, isLoadingDataGraph]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("item_master", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                setSupplierItems(res.data.supplier_items || []);

                // Foreign key fields that should use null instead of empty string
                const foreignKeyFields = ['item_category_id', 'supplier_id', 'uom_id', 'sales_account_id', 'purchase_account_id', 'tax_master_id', 'tax_rate_intra_id', 'currency_id'];

                // Build form values dynamically from response data
                const formValues: Record<string, any> = {};
                if (res.data) {
                    Object.keys(res.data).forEach((key) => {
                        // For foreign key fields: use null instead of empty string
                        if (foreignKeyFields.includes(key)) {
                            formValues[key] = res.data[key] || null;
                        } else if (res.data[key] !== null && res.data[key] !== undefined) {
                            // Convert values to strings for other form fields
                            if (typeof res.data[key] === 'number') {
                                formValues[key] = res.data[key].toString();
                            } else {
                                formValues[key] = res.data[key] || '';
                            }
                        } else {
                            formValues[key] = '';
                        }
                    });
                }

                form.reset(formValues as any);
                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };

    const handleSubmit = async (data: ItemMasterValues) => {
        try {
            setIsSubmitting(true);

            const submissionData: Record<string, any> = {
                ...(data as Record<string, any>),
            };

            delete submissionData.id;

            // Prisma rejects "" for Float? and optional FKs — use null or omit
            const rawPrice = submissionData.unit_price;
            if (rawPrice === '' || rawPrice === null || rawPrice === undefined) {
                submissionData.unit_price = null;
            } else {
                submissionData.unit_price = parseFloat(String(rawPrice));
            }

            // Foreign key fields in item_master (must match zeiv.prisma `item_master`, e.g. currency_id not currency_master_id)
            const foreignKeyFields = ['item_category_id', 'supplier_id', 'uom_id', 'sales_account_id', 'purchase_account_id', 'tax_master_id', 'tax_rate_intra_id', 'currency_id'];

            foreignKeyFields.forEach((field) => {
                if (submissionData[field] === '' || submissionData[field] === undefined) {
                    submissionData[field] = null;
                }
            });

            if (!id) {
                // For creates: remove null foreign key fields (don't send them - backend will use defaults)
                foreignKeyFields.forEach((field) => {
                    if (submissionData[field] === null || submissionData[field] === undefined) {
                        delete submissionData[field];
                    }
                });
                if (submissionData.unit_price === null) {
                    delete submissionData.unit_price;
                }
                await viewAPI.create(
                    "item_master",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Item master created successfully",
                });
                navigate('/masters/items');
            } else {
                // For updates: null values are kept so backend can clear existing foreign key values
                // (Fields should already be null, not empty string, due to input field logic)
                await viewAPI.update(
                    "item_master",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Item master updated successfully",
                });
            }
            navigate('/masters/items');
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

    // const handleSelectChange = (
    //     sourceKey: any,
    //     key: string,
    //     value: any,
    //     fields: any
    // ) => {
    //     const lookupData = constructObject(value.item, fields);
    //     form.setValue(sourceKey, value[key]);
    // };

    // const handleSelectClear = (sourceKey: any) => {
    //     form.setValue(sourceKey, '');
    // };
    const handleSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
        const lookupData = constructObject(value.item, fields);
        // Ensure we never set empty string - use null if value is empty/undefined
        const fieldValue = value[key] || null;
        form.setValue(sourceKey, fieldValue, { shouldValidate: true }); // ✅ trigger validation
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, null, { shouldValidate: true }); // ✅ trigger validation - set to null instead of empty string
    };


    // const handleUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    //     const value = e.target.value;
    //     if (value === '' || /^\d*\.?\d*$/.test(value)) {
    //         form.setValue('unit_price', value);
    //     }
    // };
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
        navigate('/masters/items');
    };

    const fetchAvailableSuppliers = async () => {
        setIsLoadingSuppliers(true);
        try {
            const response: any = await viewAPI.search("supplier", "supplier_view", 1, 100, supplierSearchTerm || undefined);
            const existingSupplierIds = supplierItems.map((si: any) => si.supplier_id).filter(Boolean);
            // Filter out already added suppliers
            const filtered = (response?.data || []).filter((supplier: any) => !existingSupplierIds.includes(supplier.id));
            setAvailableSuppliers(filtered);
        } catch (error) {
            console.error("Error fetching suppliers:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to fetch suppliers",
            });
        } finally {
            setIsLoadingSuppliers(false);
        }
    };

    useEffect(() => {
        if (isAddSupplierModalOpen) {
            fetchAvailableSuppliers();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddSupplierModalOpen, supplierSearchTerm]);

    const handleAddSupplier = async () => {
        if (!selectedSupplierIds.length || !id) return;

        try {
            // Prepare array of child objects to add
            // addChild accepts both single objects and arrays - backend handles arrays automatically
            const children = selectedSupplierIds.map(supplierId => ({ supplier_id: supplierId }));

            // Add multiple suppliers at once using addChild with array
            await viewAPI.addChild("item_master", id, viewId, "supplier_items", children);
            toast({
                title: "Success",
                description: `${selectedSupplierIds.length} supplier(s) added successfully`,
            });
            setIsAddSupplierModalOpen(false);
            setSelectedSupplierIds([]);
            setSupplierSearchTerm('');
            // Refresh item_master data
            fetchingDetails(id);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to add suppliers",
            });
        }
    };

    const handleToggleSupplierSelection = (supplierId: string) => {
        setSelectedSupplierIds(prev =>
            prev.includes(supplierId)
                ? prev.filter(id => id !== supplierId)
                : [...prev, supplierId]
        );
    };

    const handleDeleteSupplier = async (supplierItemId: string) => {
        if (!id) return;

        Modal.confirm({
            title: "Are you sure you want to remove this supplier?",
            content: "This action cannot be undone.",
            okText: "Yes, Remove",
            okType: "danger",
            cancelText: "Cancel",
            onOk: async () => {
                try {
                    await viewAPI.deleteChild("item_master", id, viewId, "supplier_items", supplierItemId);
                    toast({
                        title: "Success",
                        description: "Supplier removed successfully",
                    });
                    // Refresh item_master data
                    fetchingDetails(id);
                } catch (error: any) {
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: error.message || "Failed to remove supplier",
                    });
                }
            },
        });
    };

    return (
        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Item</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Item' : 'Create New Item'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/masters/items')}
                >
                    <ArrowLeft size={16} />
                    Back to list
                </Button>
            </div>
            {id ? (
                <Tabs defaultValue="details" className="w-full">
                    <TabsList>
                        <TabsTrigger value="details">Details</TabsTrigger>
                        <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
                    </TabsList>
                    <TabsContent value="details">
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
                                                    name="item_name"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="item_name" dataGraph={dataGraph}>Item Name</RequiredFormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter item name" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="item_shortname"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="item_shortname" dataGraph={dataGraph}>Item Short Name</RequiredFormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter item shortname" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="item_description"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="item_description" dataGraph={dataGraph}>Item Description</RequiredFormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter item description" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="item_type"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="item_type" dataGraph={dataGraph}>Item Type</RequiredFormLabel>
                                                            <Select
                                                                onValueChange={field.onChange}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select item type" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="Goods">Goods</SelectItem>
                                                                    <SelectItem value="Services">Services</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                {/* <FormField
                                        control={form.control}
                                        name="unit_price"
                                        render={({ field }) => (
                                            <FormItem>
                                                <RequiredFormLabel fieldName="unit_price" dataGraph={dataGraph}>Unit Price</RequiredFormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter unit price"
                                                        {...field}
                                                        onChange={handleUnitPriceChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    /> */}
                                                <FormField
                                                    control={form.control}
                                                    name="unit_price"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                Unit Price <span className="text-red-500">*</span>
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Enter unit price"
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
                                                    name="uom_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="uom_id" dataGraph={dataGraph}>UOM</RequiredFormLabel>
                                                            <SearchDropDown
                                                                instanceType="uom"
                                                                instanceSourceKey="uom_id"
                                                                instanceKey="id"
                                                                instanceLabel="name"
                                                                instanceValue={initialValues?.uom}
                                                                onSelectItem={handleSelectChange}
                                                                onClear={() => handleSelectClear('uom_id')}
                                                                limit="10"
                                                                searchParams="name"
                                                                type="item_master"
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />

                                                <FormField
                                                    control={form.control}
                                                    name="item_category_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="item_category_id" dataGraph={dataGraph}>Item Category</RequiredFormLabel>
                                                            <SearchDropDown
                                                                instanceType="item_category"
                                                                instanceSourceKey="item_category_id"
                                                                instanceKey="id"
                                                                instanceLabel="item_category"
                                                                instanceValue={initialValues?.item_category}
                                                                onSelectItem={handleSelectChange}
                                                                onClear={() => handleSelectClear('item_category_id')}
                                                                limit="10"
                                                                searchParams="item_category"
                                                                type="item_master"
                                                            // rest={
                                                            //     { instanceSubLabel: "item_category" }
                                                            // }
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />

                                                <FormField
                                                    control={form.control}
                                                    name="supplier_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="supplier_id" dataGraph={dataGraph}>Supplier</RequiredFormLabel>
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
                                                                type="item_master"
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="tax_master_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="tax_master_id" dataGraph={dataGraph}>Tax Rate</RequiredFormLabel>
                                                            <SearchDropDown
                                                                instanceType="tax_master"
                                                                instanceSourceKey="tax_master_id"
                                                                instanceKey="id"
                                                                instanceLabel="tax_rate"
                                                                instanceValue={initialValues?.tax_master}
                                                                onSelectItem={handleSelectChange}
                                                                onClear={() => handleSelectClear('tax_master_id')}
                                                                limit="10"
                                                                searchParams="tax_rate"
                                                                type="item_master"
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="stockable"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="stockable" dataGraph={dataGraph}>Stockable</RequiredFormLabel>
                                                            <Select
                                                                onValueChange={field.onChange}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select stockable" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="Yes">Yes</SelectItem>
                                                                    <SelectItem value="No">No</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="item_status"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <RequiredFormLabel fieldName="item_status" dataGraph={dataGraph}>Item Status</RequiredFormLabel>
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
                    </TabsContent>
                    <TabsContent value="suppliers">
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>Suppliers</CardTitle>
                                    <Button onClick={() => setIsAddSupplierModalOpen(true)}>
                                        <Plus size={16} className="mr-2" />
                                        Add Supplier
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {supplierItems.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        No suppliers added yet. Click "Add Supplier" to add suppliers.
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Supplier Name</TableHead>
                                                <TableHead>Primary Email</TableHead>
                                                <TableHead>Primary Phone</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {supplierItems.map((supplierItem: any) => {
                                                const supplier = supplierItem.supplier;
                                                if (!supplier) return null;
                                                return (
                                                    <TableRow key={supplierItem.id}>
                                                        <TableCell>{supplier.supplier_name || '-'}</TableCell>
                                                        <TableCell>{supplier.primary_email || '-'}</TableCell>
                                                        <TableCell>{supplier.primary_phone || '-'}</TableCell>
                                                        <TableCell>{supplier.status || '-'}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-500 hover:text-red-600"
                                                                onClick={() => handleDeleteSupplier(supplierItem.id)}
                                                            >
                                                                <Trash2 size={16} />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            ) : (
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
                                            name="item_name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Item Name <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter item name" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="item_shortname"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="item_shortname" dataGraph={dataGraph}>Item Short Name</RequiredFormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter item shortname" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="item_description"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="item_description" dataGraph={dataGraph}>Item Description</RequiredFormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter item description" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="item_type"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="item_type" dataGraph={dataGraph}>Item Type</RequiredFormLabel>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select item type" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="Goods">Goods</SelectItem>
                                                            <SelectItem value="Services">Services</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="unit_price"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="unit_price" dataGraph={dataGraph}>Unit Price</RequiredFormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="text"
                                                            placeholder="Enter unit price"
                                                            value={field.value || ''}
                                                            onChange={(e) => handleUnitPriceChange(e, field.onChange)}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="uom_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="uom_id" dataGraph={dataGraph}>UOM</RequiredFormLabel>
                                                    <SearchDropDown
                                                        instanceType="uom"
                                                        instanceSourceKey="uom_id"
                                                        instanceKey="id"
                                                        instanceLabel="name"
                                                        instanceValue={initialValues?.uom}
                                                        onSelectItem={handleSelectChange}
                                                        onClear={() => handleSelectClear('uom_id')}
                                                        limit="10"
                                                        searchParams="name"
                                                        type="item_master"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )} />

                                        <FormField
                                            control={form.control}
                                            name="item_category_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="item_category_id" dataGraph={dataGraph}>Item Category</RequiredFormLabel>
                                                    <SearchDropDown
                                                        instanceType="item_category"
                                                        instanceSourceKey="item_category_id"
                                                        instanceKey="id"
                                                        instanceLabel="item_category"
                                                        instanceValue={initialValues?.item_category}
                                                        onSelectItem={handleSelectChange}
                                                        onClear={() => handleSelectClear('item_category_id')}
                                                        limit="10"
                                                        searchParams="item_category"
                                                        type="item_master"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )} />

                                        <FormField
                                            control={form.control}
                                            name="supplier_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="supplier_id" dataGraph={dataGraph}>Supplier</RequiredFormLabel>
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
                                                        type="item_master"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="stockable"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="stockable" dataGraph={dataGraph}>Stockable</RequiredFormLabel>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select stockable" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="Yes">Yes</SelectItem>
                                                            <SelectItem value="No">No</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="item_status"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <RequiredFormLabel fieldName="item_status" dataGraph={dataGraph}>Item Status</RequiredFormLabel>
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
            )}

            {/* Add Supplier Modal */}
            <Dialog open={isAddSupplierModalOpen} onOpenChange={(open) => {
                setIsAddSupplierModalOpen(open);
                if (!open) {
                    setSelectedSupplierIds([]);
                    setSupplierSearchTerm('');
                }
            }}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Select Supplier to Add</DialogTitle>
                        <DialogDescription>
                            Choose a supplier from the list below to add to this item.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4">
                        <div className="mb-4">
                            <Input
                                placeholder="Search suppliers..."
                                value={supplierSearchTerm}
                                onChange={(e) => setSupplierSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        fetchAvailableSuppliers();
                                    }
                                }}
                            />
                        </div>
                        {isLoadingSuppliers ? (
                            <div className="space-y-2">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12"></TableHead>
                                        <TableHead>Supplier Name</TableHead>
                                        <TableHead>Primary Email</TableHead>
                                        <TableHead>Primary Phone</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {availableSuppliers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                No suppliers available to add.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        availableSuppliers.map((supplier: any) => (
                                            <TableRow
                                                key={supplier.id}
                                                className={selectedSupplierIds.includes(supplier.id) ? "bg-muted" : "cursor-pointer"}
                                                onClick={() => handleToggleSupplierSelection(supplier.id)}
                                            >
                                                <TableCell>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSupplierIds.includes(supplier.id)}
                                                        onChange={() => handleToggleSupplierSelection(supplier.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="cursor-pointer"
                                                    />
                                                </TableCell>
                                                <TableCell>{supplier.supplier_name || '-'}</TableCell>
                                                <TableCell>{supplier.primary_email || '-'}</TableCell>
                                                <TableCell>{supplier.primary_phone || '-'}</TableCell>
                                                <TableCell>{supplier.status || '-'}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <div className="flex justify-between items-center mt-4">
                        <div className="text-sm text-muted-foreground">
                            {selectedSupplierIds.length > 0 && `${selectedSupplierIds.length} supplier(s) selected`}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => {
                                setIsAddSupplierModalOpen(false);
                                setSelectedSupplierIds([]);
                                setSupplierSearchTerm('');
                            }}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAddSupplier}
                                disabled={selectedSupplierIds.length === 0}
                            >
                                Add Selected Suppliers ({selectedSupplierIds.length})
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};