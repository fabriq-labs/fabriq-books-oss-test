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
    budget_line: z.string().min(1, { message: 'Budget Line is required' }),
    budget_period_id: z.string().min(1, { message: 'Budget Period is required' }),
    bp_start_date: z.date({ required_error: 'BP Start Date is required' }),
    bp_end_date: z.date({ required_error: 'BP End Date is required' }),
    // allocated_budget: z.number().min(0, { message: 'Allocated Budget must be a valid positive number' }),
    allocated_budget: z.string().min(1, { message: 'Allocated Budget is required' }).refine(
        (value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0,
        { message: 'Allocated Budget must be a valid positive number' }
    ),
    available_budget: z.number().optional(),
    wip_budget: z.number().optional(),
    utilized_budget: z.number().optional(),
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

export const BudgetLineForm: React.FC<ItemMasterFormProps> = (
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
            budget_line: '',
            budget_period_id: '',
            bp_start_date: undefined,
            bp_end_date: undefined,
            allocated_budget: 0,
            available_budget: 0,
            wip_budget: 0,
            utilized_budget: 0,
        },
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("budget_line", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    budget_line: res.data.budget_line || '',
                    bp_start_date: res.data.bp_start_date ? new Date(res.data.bp_start_date) : undefined,
                    bp_end_date: res.data.bp_end_date ? new Date(res.data.bp_end_date) : undefined,
                    budget_period_id: res.data.budget_period_id?.toString() || '',
                    allocated_budget: res.data.allocated_budget?.toString() || '',
                    available_budget: res.data.available_budget ? parseFloat(res.data.available_budget) : 0,
                    wip_budget: res.data.wip_budget ? parseFloat(res.data.wip_budget) : 0,
                    utilized_budget: res.data.utilized_budget ? parseFloat(res.data.utilized_budget) : 0,
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
                bp_start_date: data.bp_start_date ? data.bp_start_date.toISOString() : null,
                bp_end_date: data.bp_end_date ? data.bp_end_date.toISOString() : null,
                budget_period_id: data.budget_period_id,
                allocated_budget: parseFloat(data.allocated_budget.toString()),
                available_budget: parseFloat(data.available_budget.toString()),
                wip_budget: parseFloat(data.wip_budget.toString()),
                utilized_budget: parseFloat(data.utilized_budget.toString())
            };

            if (!id) {
                await viewAPI.create(
                    "budget_line",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Budget Line created successfully",
                });
                navigate('/accounting/budget-lines');
            } else {
                await viewAPI.update(
                    "budget_line",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Budget Line  updated successfully",
                });
            }
            navigate('/accounting/budget-lines');
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


    const handleAllocatedBudgetChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        onChange: (value: any) => void
    ) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            onChange(value); // ✅ tell RHF about the change
        }
    };
    const handleAvailableBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('available_budget', value === '' ? 0 : parseFloat(value));
        }
    };
    const handleWipBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('wip_budget', value === '' ? 0 : parseFloat(value));
        }
    };
    const handleUtilizedBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('utilized_budget', value === '' ? 0 : parseFloat(value));
        }
    };


    const handleCancel = () => {
        navigate('/accounting/budget-lines');

    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Budget Line Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Budget Line' : 'Create New Budget Line'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/accounting/budget-lines')}
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
                                        name="budget_line"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Budget Line  <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Budget Line" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="bp_start_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>BP Start Date  <span className="text-red-500">*</span></FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        // Convert the selected date to a proper Date object
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="BP Start Date"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="bp_end_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>BP End Date  <span className="text-red-500">*</span></FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        // Convert the selected date to a proper Date object
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="Bp End Date"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="allocated_budget"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Allocated Budget  <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Allocated Budget"
                                                        value={field.value || ''} // keep in sync
                                                        onChange={(e) => handleAllocatedBudgetChange(e, field.onChange)}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="available_budget"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Available Budget</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Available Budget"
                                                        {...field}
                                                        onChange={handleAvailableBudgetChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="wip_budget"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Wip Budget</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Wip Budget"
                                                        {...field}
                                                        onChange={handleWipBudgetChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="utilized_budget"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Utilized Budget</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Utilized Budget"
                                                        {...field}
                                                        onChange={handleUtilizedBudgetChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="budget_period_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Budget Period  <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="budget_period"
                                                    instanceSourceKey="budget_period_id"
                                                    instanceKey="id"
                                                    instanceLabel="budget_period"
                                                    instanceValue={
                                                        initialValues?.budget_period
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="budget_period"
                                                    type="buget_line"
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