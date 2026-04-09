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
    project_code: z.string().min(1, { message: 'Project Code is required' }),
    project_name: z.string().min(1, { message: 'Project Name is required' }),
    legal_entity_id: z.string().min(1, { message: 'Legal Entity is required' }),
    project_start_date: z
        .union([z.string(), z.date()])
        .transform((val) => {
            if (!val) return undefined;
            if (val instanceof Date) return val;
            const parsed = new Date(val);
            return isNaN(parsed.getTime()) ? undefined : parsed;
        })
        .refine((date) => date instanceof Date && !isNaN(date.getTime()), {
            message: 'Project start date is required',
        }),
    project_end_date: z
        .union([z.string(), z.date(), z.null(), z.undefined()])
        .transform((val) => {
            if (!val) return undefined;
            if (val instanceof Date) return val;
            const parsed = new Date(val);
            return isNaN(parsed.getTime()) ? undefined : parsed;
        })
        .optional(),
    budget_line_id: z.string().optional(),
    account_id: z.string().optional(),
    available_budget: z.string().optional(),
    account_name: z.string().optional(),
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

export const ProjectMasterForm: React.FC<ItemMasterFormProps> = (
) => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: {
            project_code: '',
            project_name: '',
            project_start_date: undefined,
            project_end_date: undefined,
            available_budget: '',
            budget_line_id: '',
            legal_entity_id: '',
            account_id: '',
            account_name: '',
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("project_master", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    project_code: res.data.project_code || '',
                    project_name: res.data.project_name || '',
                    available_budget: res.data.available_budget || '',
                    project_start_date: res.data.project_start_date ? new Date(res.data.project_start_date) : undefined,
                    project_end_date: res.data.project_end_date ? new Date(res.data.project_end_date) : undefined,
                    legal_entity_id: res.data.legal_entity_id?.toString() || '',
                    budget_line_id: res.data.budget_line_id?.toString() || '',
                    account_id: res.data.account_id?.toString() || '',
                    account_name: res.data.account_name || '',
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
                available_budget: data.available_budget ? parseFloat(data.available_budget) : null,
                project_end_date: data.project_end_date ? data.project_end_date.toISOString() : null,
                project_start_date: data.project_start_date ? data.project_start_date.toISOString() : null,
                budget_line_id: data.budget_line_id || undefined,
                account_id: data.account_id || undefined,
            };

            if (!id) {
                await viewAPI.create(
                    "project_master",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Project Master created successfully",
                });
                navigate('/masters/projects');
            } else {
                await viewAPI.update(
                    "project_master",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Project Master updated successfully",
                });
            }
            navigate('/masters/projects');
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
        form.trigger(sourceKey); // Trigger validation after setting value
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '');
        form.trigger(sourceKey); // Trigger validation after clearing value
    };

    const handleUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('available_budget', value);
        }
    };

    const onhandleSelectChange = (
        sourceKey: any,
        key: any,
        value: any,
        fields: any
    ) => {
        const lookupData = constructObject(value.item, fields);
        console.log(value)
        form.setValue(sourceKey, value[key]);
        form.setValue("account_name", value.item.name || '');
        form.trigger(sourceKey); // Trigger validation after setting value
    };

    const onhandleSelectChangeforBudgetLine = (
        sourceKey: any,
        key: any,
        value: any,
        fields: any
    ) => {
        const lookupData = constructObject(value.item, fields);
        console.log(value)
        form.setValue(sourceKey, value[key]);
        form.setValue("available_budget", value.item.available_budget?.toString() || '');
        form.trigger(sourceKey); // Trigger validation after setting value
    };

    const handleCancel = () => {
        navigate(`/masters/projects`);
    };

    return (
        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Project Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Project' : 'Create New Project'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate(`/masters/projects`)}
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
                                        name="project_code"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Project Code  <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Project Code" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="project_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Project Name  <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Project Name" {...field} />
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
                                                    <Input placeholder="Enter Available Budget" {...field} disabled />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="project_start_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Project Start Date  <span className="text-red-500">*</span></FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="Project Start Date"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="project_end_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Project End Date</FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="Project End Date"
                                                />
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
                                                <FormControl>
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
                                                        type="project_master"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    <FormField
                                        control={form.control}
                                        name="budget_line_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Budget Line</FormLabel>
                                                <FormControl>
                                                    <SearchDropDown
                                                        instanceType="budget_line"
                                                        instanceSourceKey="budget_line_id"
                                                        instanceKey="id"
                                                        instanceLabel="budget_line"
                                                        instanceValue={initialValues?.budget_line}

                                                        onSelectItem={onhandleSelectChangeforBudgetLine}
                                                        onClear={handleSelectClear}
                                                        limit="10"
                                                        searchParams="budget_line"
                                                        type="project_master"
                                                        lookup_id_name="budget_line_id"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    <FormField
                                        control={form.control}
                                        name="account_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Account Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter account name" {...field} disabled />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="account_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>COA</FormLabel>
                                                <FormControl>
                                                    <SearchDropDown
                                                        instanceType="account"
                                                        instanceSourceKey="account_id"
                                                        instanceKey="id"
                                                        instanceLabel="name"
                                                        instanceValue={initialValues?.account}
                                                        onSelectItem={onhandleSelectChange}
                                                        onClear={handleSelectClear}
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