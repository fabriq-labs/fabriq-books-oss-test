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
import { SearchDropDown } from '../../search_dropdown/dropdown';
import { constructObject } from '../../utils/helper';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
const itemMasterSchema = z.object({
    tax_name: z.string().min(1, { message: 'Tax Name is required' }),
    tax_code: z.string().min(1, { message: 'Tax Code is required' }),
    effective_from: z.date({ required_error: 'Effective From is required' }),
    // tax_rate: z.string().min(1, { message: 'Currency Value is required' }).refine(
    //     (value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0,
    //     { message: 'Currency Value must be a valid positive number' }
    // ),
    expires_on: z.date().optional(),
    tax_rate: z
        .string()
        .min(1, { message: 'Tax Rate is required' })
        .refine(
            (value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0,
            { message: 'Tax Rate must be a valid positive number' }
        )
        .transform((value) => parseFloat(value)), // converts to number

    status: z.string().min(1, { message: 'Status is required' }),
    geo: z.string().min(1, { message: 'Geo is required' }),
    component_type: z.string().optional(),
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

export const TaxMasterForm: React.FC<ItemMasterFormProps> = (
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
            tax_name: '',
            tax_code: '',
            tax_rate: '',
            status: '',
            geo: '',
            component_type: '',
            effective_from: undefined,
            expires_on: undefined,
        },
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("tax_master", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    tax_name: res.data.tax_name || '',
                    tax_code: res.data.tax_code || '',
                    geo: res.data.geo || '',
                    tax_rate: res.data.tax_rate?.toString() || '',
                    status: res.data.status || '',
                    component_type: res.data.component_type || '',
                    effective_from: res.data.effective_from ? new Date(res.data.effective_from) : undefined,
                    expires_on: res.data.expires_on ? new Date(res.data.expires_on) : undefined,
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
                tax_rate: data.tax_rate, // This will be a number due to schema transformation
                effective_from: data.effective_from ? data.effective_from.toISOString() : null,
                expires_on: data.expires_on ? data.expires_on.toISOString() : null
            };

            if (!id) {
                await viewAPI.create(
                    "tax_master",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Tax Master created successfully",
                });
                navigate('/accounting/tax');
            } else {
                await viewAPI.update(
                    "tax_master",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Tax Master updated successfully",
                });
            }
            navigate('/accounting/tax');
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


    const handleTaxRateChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        onChange: (value: any) => void
    ) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            onChange(value); // Keep as string, let schema transform it
        }
    };

    const handleCancel = () => {
        navigate('/accounting/tax');
    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Tax</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Tax Master' : 'Create New Tax Master'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/accounting/tax')}
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
                                        name="tax_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tax Name<span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Tax Name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="tax_code"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tax Code <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Tax Code" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="geo"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Geo <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Geo" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="component_type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Component Type</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value || undefined}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Optional (cgst, sgst, igst, gst, hst…)" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="cgst">cgst</SelectItem>
                                                        <SelectItem value="sgst">sgst</SelectItem>
                                                        <SelectItem value="igst">igst</SelectItem>
                                                        <SelectItem value="gst">gst</SelectItem>
                                                        <SelectItem value="hst">hst</SelectItem>
                                                        <SelectItem value="pst">pst</SelectItem>
                                                        <SelectItem value="qst">qst</SelectItem>
                                                        <SelectItem value="vat">vat</SelectItem>
                                                        <SelectItem value="sales_tax">sales_tax</SelectItem>
                                                        <SelectItem value="cess">cess</SelectItem>
                                                        <SelectItem value="other">other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="effective_from"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Effective Form <span className="text-red-500">*</span></FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        // Convert the selected date to a proper Date object
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="Effective Form"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="expires_on"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Expires On </FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        // Convert the selected date to a proper Date object
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="Expires On"
                                                />
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
                                        name="tax_rate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tax Rate <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Tax Rate"
                                                        value={field.value || ''} // keep in sync
                                                        onChange={(e) => handleTaxRateChange(e, field.onChange)}
                                                    />
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