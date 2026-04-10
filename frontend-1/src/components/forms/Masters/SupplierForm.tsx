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
import { SearchDropDown } from '../../search_dropdown/dropdown';
import { constructObject } from '../../utils/helper';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker, Modal } from 'antd';
import dayjs from 'dayjs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Master from '@/pages/Master';
const itemMasterSchema = z.object({
    supplier_name: z.string().min(1, { message: 'Supplier name is required' }),
    supplier_address: z.string().min(1, { message: 'Supplier Address is required' }),
    city: z.string().min(1, { message: 'City is required' }),
    state: z.string().min(1, { message: 'State is required' }),
    country: z.string().min(1, { message: 'Country is required' }),
    zip_code: z.string().min(1, { message: 'Zip Code is required' }),
    primary_phone: z.string().min(1, { message: 'Primary Phone is required' }),
    primary_email: z.string().email({ message: 'Valid primary email is required' }),
    alternative_phone: z.string().optional(),
    secondary_email: z.string().email({ message: 'Valid secondary email format' }).optional(),
    po_email: z.string().optional(),
    status: z.string().min(1, { message: 'Status is required' }),
    industry: z.string().min(1, { message: 'Industry is required' }),
    website: z.string().optional(),
    employee_count: z.string().optional(),
    legal_name: z.string().min(1, { message: 'Legal Name is required' }),
    legal_registration_number: z.string().optional(),
    business_classification: z.string().min(1, { message: 'Business Classification is required' }),
    duns_number: z.string().optional(),
    payment_term_id: z.string().optional(),
    shipping_term_id: z.string().optional(),
    shipping_method_id: z.string().optional(),
    preferred_currency_id: z.string().optional(),
    buyer_review_added: z.string().min(1, { message: 'Buyer Review is required' }),
    onboarded_date: z.date({ required_error: 'Onboarded Date is required' }),
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

export const SupplierForm: React.FC<ItemMasterFormProps> = (
) => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [supplierItems, setSupplierItems] = useState<any[]>([]);
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [availableItems, setAvailableItems] = useState<any[]>([]);
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [itemSearchTerm, setItemSearchTerm] = useState<string>('');
    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: initialValues || {
            supplier_name: '',
            supplier_address: '',
            city: '',
            state: '',
            country: '',
            zip_code: '',
            primary_phone: '',
            primary_email: '',
            po_email: '',
            industry: '',
            website: '',
            business_classification: '',
            buyer_review_added: '',
            onboarded_date: '',
            payment_term_id: '',
            shipping_term_id: '',
            shipping_method_id: '',
            preferred_currency_id: '',
            legal_name: ''
        },
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("supplier", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                setSupplierItems(res.data.supplier_items || []);
                form.reset({
                    supplier_name: res.data.supplier_name || '',
                    supplier_address: res.data.supplier_address || '',
                    city: res.data.city || '',
                    state: res.data.state || '',
                    country: res.data.country || '',
                    zip_code: res.data.zip_code || '',
                    primary_phone: res.data.primary_phone || '',
                    primary_email: res.data.primary_email || '',
                    website: res.data.website || '',
                    po_email: res.data.po_email || '',
                    industry: res.data.industry || '',
                    business_classification: res.data.business_classification || '',
                    status: res.data.status || '',
                    buyer_review_added: res.data.business_classification || '',
                    onboarded_date: res.data.onboarded_date ? new Date(res.data.onboarded_date) : undefined,
                    payment_term_id: res.data.payment_term_id?.toString() || '',
                    shipping_term_id: res.data.shipping_term_id?.toString() || '',
                    shipping_method_id: res.data.shipping_method_id?.toString() || '',
                    preferred_currency_id: res.data.preferred_currency_id || '',
                    legal_name: res.data.legal_name || ''

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
                onboarded_date: data.onboarded_date ? data.onboarded_date.toISOString() : null,
                payment_term_id: data.payment_term_id || undefined,
                shipping_term_id: data.shipping_term_id || undefined,
                shipping_method_id: data.shipping_method_id || undefined,
                preferred_currency_id: data.preferred_currency_id || undefined,
            };

            if (!id) {
                await viewAPI.create(
                    "supplier",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Supplier created successfully",
                });
                navigate('/purchases/suppliers');
            } else {
                await viewAPI.update(
                    "supplier",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Supplier updated successfully",
                });
            }
            navigate('/purchases/suppliers');
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

    const handleSelectChange = (
        sourceKey: any,
        key: string,
        value: any,
        fields: any
    ) => {
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key]);
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '');
    };



    const handleCancel = () => {
        navigate('/purchases/suppliers');
    };

    const fetchAvailableItems = async () => {
        setIsLoadingItems(true);
        try {
            const response: any = await viewAPI.search("item_master", "item_master_view", 1, 100, itemSearchTerm || undefined);
            const existingItemIds = supplierItems.map((si: any) => si.item_id).filter(Boolean);
            // Filter out already added items
            const filtered = (response?.data || []).filter((item: any) => !existingItemIds.includes(item.id));
            setAvailableItems(filtered);
        } catch (error) {
            console.error("Error fetching items:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to fetch items",
            });
        } finally {
            setIsLoadingItems(false);
        }
    };

    useEffect(() => {
        if (isAddItemModalOpen) {
            fetchAvailableItems();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddItemModalOpen, itemSearchTerm]);

    const handleAddItem = async () => {
        if (!selectedItemIds.length || !id) return;

        try {
            // Prepare array of child objects to add
            // addChild accepts both single objects and arrays - backend handles arrays automatically
            const children = selectedItemIds.map(itemId => ({ item_id: itemId }));

            // Add multiple items at once using addChild with array
            await viewAPI.addChild("supplier", id, viewId, "supplier_items", children);
            toast({
                title: "Success",
                description: `${selectedItemIds.length} item(s) added successfully`,
            });
            setIsAddItemModalOpen(false);
            setSelectedItemIds([]);
            setItemSearchTerm('');
            // Refresh supplier data
            fetchingDetails(id);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to add items",
            });
        }
    };

    const handleToggleItemSelection = (itemId: string) => {
        setSelectedItemIds(prev =>
            prev.includes(itemId)
                ? prev.filter(id => id !== itemId)
                : [...prev, itemId]
        );
    };

    const handleDeleteItem = async (supplierItemId: string) => {
        if (!id) return;

        Modal.confirm({
            title: "Are you sure you want to remove this item?",
            content: "This action cannot be undone.",
            okText: "Yes, Remove",
            okType: "danger",
            cancelText: "Cancel",
            onOk: async () => {
                try {
                    await viewAPI.deleteChild("supplier", id, viewId, "supplier_items", supplierItemId);
                    toast({
                        title: "Success",
                        description: "Item removed successfully",
                    });
                    // Refresh supplier data
                    fetchingDetails(id);
                } catch (error: any) {
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: error.message || "Failed to remove item",
                    });
                }
            },
        });
    };

    const existingItemIds = supplierItems.map((si: any) => si.item_id).filter(Boolean);

    return (
        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Supplier Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Supplier' : 'Create New Supplier'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/purchases/suppliers')}
                >
                    <ArrowLeft size={16} />
                    Back to list
                </Button>
            </div>
            {id ? (
                <Tabs defaultValue="details" className="w-full">
                    <TabsList>
                        <TabsTrigger value="details">Details</TabsTrigger>
                        <TabsTrigger value="items">Items</TabsTrigger>
                    </TabsList>
                    <TabsContent value="details">
                        <Card>
                            <CardHeader>
                                <CardTitle></CardTitle>
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
                                                    name="supplier_name"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Supplier Name <span className="text-red-500">*</span></FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter item name" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="supplier_address"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Supplier Address <span className="text-red-500">*</span></FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter item shortname" {...field} />
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
                                                                <Input placeholder="Enter item description" {...field} />
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
                                                            <FormLabel>State <span className="text-red-500">*</span></FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter item description" {...field} />
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
                                                            <FormLabel>Country <span className="text-red-500">*</span></FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter item description" {...field} />
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
                                                                <Input placeholder="Enter item description" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="legal_name"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Legal Name <span className="text-red-500">*</span></FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter Legal Name" {...field} />
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
                                                                <Input placeholder="Enter item description" {...field} />
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
                                                                <Input placeholder="Enter item description" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="po_email"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>PO Email</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter item description" {...field} />
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
                                                                <Input placeholder="Enter item description" {...field} />
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
                                                                <Input placeholder="Enter item description" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="onboarded_date"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>On Boarded Date <span className="text-red-500">*</span></FormLabel>
                                                            <DatePicker
                                                                style={{ width: "100%" }}
                                                                value={field.value ? dayjs(field.value) : null}
                                                                onChange={(date) => {
                                                                    // Convert the selected date to a proper Date object
                                                                    field.onChange(date ? date.toDate() : null);
                                                                }}
                                                                format="DD-MM-YYYY"
                                                                placeholder="Onboarded Date"
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="business_classification"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Business Classification <span className="text-red-500">*</span></FormLabel>
                                                            <Select
                                                                onValueChange={field.onChange}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select Business Classification" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="yes">Yes</SelectItem>
                                                                    <SelectItem value="no">No</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
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
                                                                        <SelectValue placeholder="Select Status" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="Active">Active</SelectItem>
                                                                    <SelectItem value="InActive">In Active</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="buyer_review_added"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Buyer Review Added <span className="text-red-500">*</span></FormLabel>
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
                                                                    <SelectItem value="yes">Yes</SelectItem>
                                                                    <SelectItem value="no">No</SelectItem>
                                                                </SelectContent>
                                                            </Select>
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
                                                                instanceValue={
                                                                    initialValues?.payment_terms
                                                                }
                                                                onSelectItem={handleSelectChange}
                                                                onClear={handleSelectClear}
                                                                limit="10"
                                                                searchParams="payment_terms"
                                                                type="supplier"
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />

                                                <FormField
                                                    control={form.control}
                                                    name="shipping_term_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Shipping Terms</FormLabel>

                                                            <SearchDropDown
                                                                instanceType="shipping_terms"
                                                                instanceSourceKey="shipping_term_id"
                                                                instanceKey="id"
                                                                instanceLabel="shipping_terms"
                                                                instanceValue={
                                                                    initialValues?.shipping_terms
                                                                }
                                                                onSelectItem={handleSelectChange}
                                                                onClear={() => handleSelectClear('shipping_term_id')}
                                                                limit="10"
                                                                searchParams="shipping_terms"
                                                                type="supplier"
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />

                                                <FormField
                                                    control={form.control}
                                                    name="shipping_method_id"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Shipping Method</FormLabel>

                                                            <SearchDropDown
                                                                instanceType="shipping_method"
                                                                instanceSourceKey="shipping_method_id"
                                                                instanceKey="id"
                                                                instanceLabel="shipping_method"
                                                                instanceValue={
                                                                    initialValues?.shipping_method
                                                                }
                                                                onSelectItem={handleSelectChange}
                                                                onClear={() => handleSelectClear('shipping_method')}
                                                                limit="10"
                                                                searchParams="shipping_method"
                                                                type="supplier"
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
                                                                instanceValue={
                                                                    initialValues?.currency
                                                                }
                                                                onSelectItem={handleSelectChange}
                                                                onClear={() => handleSelectClear('code')}
                                                                limit="10"
                                                                searchParams="code"
                                                                type="supplier"
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
                                    </Form>)}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="items">
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>Items Supplied</CardTitle>
                                    <Button onClick={() => setIsAddItemModalOpen(true)}>
                                        <Plus size={16} className="mr-2" />
                                        Add Item
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {supplierItems.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        No items added yet. Click "Add Item" to add items.
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item Code</TableHead>
                                                <TableHead>Item Name</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Unit Price</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {supplierItems.map((supplierItem: any) => {
                                                const item = supplierItem.item_master;
                                                if (!item) return null;
                                                return (
                                                    <TableRow key={supplierItem.id}>
                                                        <TableCell>{item.item_code || '-'}</TableCell>
                                                        <TableCell>{item.item_name || '-'}</TableCell>
                                                        <TableCell>{item.item_description || '-'}</TableCell>
                                                        <TableCell>{item.unit_price ? `$${item.unit_price}` : '-'}</TableCell>
                                                        <TableCell>{item.item_status || '-'}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-500 hover:text-red-600"
                                                                onClick={() => handleDeleteItem(supplierItem.id)}
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
                                            name="supplier_name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Supplier Name <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter item name" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="supplier_address"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Supplier Address <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter item shortname" {...field} />
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
                                                        <Input placeholder="Enter item description" {...field} />
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
                                                    <FormLabel>State <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter item description" {...field} />
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
                                                    <FormLabel>Country <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter item description" {...field} />
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
                                                        <Input placeholder="Enter item description" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="legal_name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Legal Name <span className="text-red-500">*</span></FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter Legal Name" {...field} />
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
                                                        <Input placeholder="Enter item description" {...field} />
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
                                                        <Input placeholder="Enter item description" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="po_email"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>PO Email</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter item description" {...field} />
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
                                                        <Input placeholder="Enter item description" {...field} />
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
                                                        <Input placeholder="Enter item description" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="onboarded_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>On Boarded Date <span className="text-red-500">*</span></FormLabel>
                                                    <DatePicker
                                                        style={{ width: "100%" }}
                                                        value={field.value ? dayjs(field.value) : null}
                                                        onChange={(date) => {
                                                            field.onChange(date ? date.toDate() : null);
                                                        }}
                                                        format="DD-MM-YYYY"
                                                        placeholder="Onboarded Date"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="business_classification"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Business Classification <span className="text-red-500">*</span></FormLabel>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select Business Classification" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="yes">Yes</SelectItem>
                                                            <SelectItem value="no">No</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
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
                                                                <SelectValue placeholder="Select Status" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="Active">Active</SelectItem>
                                                            <SelectItem value="InActive">In Active</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="buyer_review_added"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Buyer Review Added <span className="text-red-500">*</span></FormLabel>
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
                                                            <SelectItem value="yes">Yes</SelectItem>
                                                            <SelectItem value="no">No</SelectItem>
                                                        </SelectContent>
                                                    </Select>
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
                                                        instanceValue={
                                                            initialValues?.payment_terms
                                                        }
                                                        onSelectItem={handleSelectChange}
                                                        onClear={handleSelectClear}
                                                        limit="10"
                                                        searchParams="payment_terms"
                                                        type="supplier"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )} />

                                        <FormField
                                            control={form.control}
                                            name="shipping_term_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Shipping Terms</FormLabel>

                                                    <SearchDropDown
                                                        instanceType="shipping_terms"
                                                        instanceSourceKey="shipping_term_id"
                                                        instanceKey="id"
                                                        instanceLabel="shipping_terms"
                                                        instanceValue={
                                                            initialValues?.shipping_terms
                                                        }
                                                        onSelectItem={handleSelectChange}
                                                        onClear={() => handleSelectClear('shipping_term_id')}
                                                        limit="10"
                                                        searchParams="shipping_terms"
                                                        type="supplier"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )} />

                                        <FormField
                                            control={form.control}
                                            name="shipping_method_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Shipping Method</FormLabel>

                                                    <SearchDropDown
                                                        instanceType="shipping_method"
                                                        instanceSourceKey="shipping_method_id"
                                                        instanceKey="id"
                                                        instanceLabel="shipping_method"
                                                        instanceValue={
                                                            initialValues?.shipping_method
                                                        }
                                                        onSelectItem={handleSelectChange}
                                                        onClear={() => handleSelectClear('shipping_method')}
                                                        limit="10"
                                                        searchParams="shipping_method"
                                                        type="supplier"
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
                                                        instanceLabel="base_currency"
                                                        instanceValue={
                                                            initialValues?.currency
                                                        }
                                                        onSelectItem={handleSelectChange}
                                                        onClear={() => handleSelectClear('base_currency')}
                                                        limit="10"
                                                        searchParams="base_currency"
                                                        type="supplier"
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
                            </Form>)}
                    </CardContent>
                </Card>
            )}

            {/* Add Item Modal */}
            <Dialog open={isAddItemModalOpen} onOpenChange={(open) => {
                setIsAddItemModalOpen(open);
                if (!open) {
                    setSelectedItemIds([]);
                    setItemSearchTerm('');
                }
            }}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Select Item to Add</DialogTitle>
                        <DialogDescription>
                            Choose an item from the list below to add to this supplier.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4">
                        <div className="mb-4">
                            <Input
                                placeholder="Search items..."
                                value={itemSearchTerm}
                                onChange={(e) => setItemSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        fetchAvailableItems();
                                    }
                                }}
                            />
                        </div>
                        {isLoadingItems ? (
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
                                        <TableHead>Item Code</TableHead>
                                        <TableHead>Item Name</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Unit Price</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {availableItems.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                No items available to add.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        availableItems.map((item: any) => (
                                            <TableRow
                                                key={item.id}
                                                className={selectedItemIds.includes(item.id) ? "bg-muted" : "cursor-pointer"}
                                                onClick={() => handleToggleItemSelection(item.id)}
                                            >
                                                <TableCell>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItemIds.includes(item.id)}
                                                        onChange={() => handleToggleItemSelection(item.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="cursor-pointer"
                                                    />
                                                </TableCell>
                                                <TableCell>{item.item_code || '-'}</TableCell>
                                                <TableCell>{item.item_name || '-'}</TableCell>
                                                <TableCell>{item.item_description || '-'}</TableCell>
                                                <TableCell>{item.unit_price ? `$${item.unit_price}` : '-'}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <div className="flex justify-between items-center mt-4">
                        <div className="text-sm text-muted-foreground">
                            {selectedItemIds.length > 0 && `${selectedItemIds.length} item(s) selected`}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => {
                                setIsAddItemModalOpen(false);
                                setSelectedItemIds([]);
                                setItemSearchTerm('');
                            }}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAddItem}
                                disabled={selectedItemIds.length === 0}
                            >
                                Add Selected Items ({selectedItemIds.length})
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};