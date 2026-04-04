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
    budget_period: z.string().min(1, { message: 'Budget Period is required' }),
    from_date: z.date({ required_error: 'From Date is required' }),
    to_date: z.date({ required_error: 'To Date is required' }),
    account_id: z.string().min(1, { message: 'COA is required' }),
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

export const BudgetPeriodForm: React.FC<ItemMasterFormProps> = (
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
            budget_period: '',
            account_id: '',
            from_date: '',
            to_date: '',
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
        viewAPI.getById("budget_period", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    budget_period: res.data.budget_period || '',
                    status: res.data.status || '',
                    to_date: res.data.to_date ? new Date(res.data.to_date) : undefined,
                    from_date: res.data.from_date ? new Date(res.data.from_date) : undefined,
                    account_id: res.data.account_id?.toString() || '',
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
                from_date: data.from_date ? data.from_date.toISOString() : null,
                to_date: data.to_date ? data.to_date.toISOString() : null
            };

            if (!id) {
                await viewAPI.create(
                    "budget_period",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Budget Period created successfully",
                });
                navigate('/accounting/budget-periods');
            } else {
                await viewAPI.update(
                    "budget_period",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Budget Period  updated successfully",
                });
            }
            navigate('/accounting/budget-periods');
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
        navigate('/accounting/budget-periods');

    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Budget Period Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Budget Period' : 'Create New Budget Period'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/accounting/budget-periods')}
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
                                        name="budget_period"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Budget Period <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Budget Period" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="from_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>From Date  <span className="text-red-500">*</span></FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        // Convert the selected date to a proper Date object
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="From  Date"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="to_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>To Date  <span className="text-red-500">*</span></FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        // Convert the selected date to a proper Date object
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="To  Date"
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
                                                <FormLabel>Status  <span className="text-red-500">*</span></FormLabel>
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