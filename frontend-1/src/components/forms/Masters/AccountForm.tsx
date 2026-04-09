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
import { Select } from 'antd';
import { useTool } from '@/contexts/ToolContext';
import { SearchDropDown } from '../../search_dropdown/dropdown';

enum AccountClassification {
    Assets = "Assets",
    Liabilities = "Liabilities",
    Income = "Income",
    Expense = "Expense",
    Equity = "Equity"
}

const itemMasterSchema = z.object({
    balance: z.string().optional(),
    name: z.string().min(1, { message: 'Name is required' }),
    classification: z.nativeEnum(AccountClassification, {
        errorMap: () => ({ message: 'Classification type is required' })
    }),
    parent_account_id: z.string().optional(),
    hq_account_id: z.string().optional(),
    type: z.array(z.string()).optional(),
    currency: z.string().optional(),
    code: z.string().optional(),
    frequency: z.string().optional(),
    legal_entity_id: z.string().optional(),
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

export const AccountForm: React.FC<ItemMasterFormProps> = ({
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
            balance: '',
            name: '',
            classification: '',
            parent_account_id: '',
            hq_account_id: '',
            type: [],
            code: '',
            currency: '',
            frequency: '',
            legal_entity_id: '',
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("account", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    name: res.data.name || '',
                    balance: res.data.balance || '',
                    classification: res.data.classification || '',
                    type: Array.isArray(res.data.type) ? res.data.type : (res.data.type ? [res.data.type] : []),
                    code: res.data.code?.toString() || '',
                    parent_account_id: res.data.parent_account_id?.toString() || '',
                    hq_account_id: res.data.hq_account_id?.toString() || '',
                    currency: res.data.currency?.toString() || '',
                    frequency: res.data.frequency?.toString() || '',
                    legal_entity_id: res.data.legal_entity_id?.toString() || '',
                });
                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };

    const selectedClassification = form.watch('classification');

    useEffect(() => {
        if (!selectedClassification) {
            form.setValue('type', [] as string[]);
        }
    }, [selectedClassification, form]);

    // Handle latest form tool response updates
    useEffect(() => {
        if (latestFormToolResponse && latestFormToolResponse.result && latestFormToolResponse.result.model === 'account') {
            console.log('Latest form tool response:', latestFormToolResponse);

            if (latestFormToolResponse.result.data) {
                const toolResultData = latestFormToolResponse.result.data;
                if (toolResultData.id) {
                    setInitialValues(toolResultData);
                    form.reset({
                        name: toolResultData.name || '',
                        balance: toolResultData.balance || '',
                        classification: toolResultData.classification || '',
                        type: Array.isArray(toolResultData.type) ? toolResultData.type : (toolResultData.type ? [toolResultData.type] : []),
                        code: toolResultData.code?.toString() || '',
                        parent_account_id: toolResultData.parent_account_id?.toString() || '',
                        hq_account_id: toolResultData.hq_account_id?.toString() || '',
                        currency: toolResultData.currency?.toString() || '',
                        frequency: toolResultData.frequency?.toString() || '',
                        legal_entity_id: toolResultData.legal_entity_id?.toString() || '',
                    });
                }
            }
        }
    }, [latestFormToolResponse, form]);

    const handleSubmit = async (data: ItemMasterValues) => {
        try {
            setIsSubmitting(true);

            const submissionData = {
                ...data,
                balance: parseFloat(data.balance || '0'),
                parent_account_id: data.parent_account_id || null,
                hq_account_id: data.hq_account_id || null
            };

            if (!id) {
                await viewAPI.create(
                    "account",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Account created successfully",
                });

                if (propOnSuccess) {
                    propOnSuccess();
                } else {
                    navigate('/accounting/accounts');
                }
            } else {
                await viewAPI.update(
                    "account",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Account updated successfully",
                });
            }

            if (propOnSuccess) {
                propOnSuccess();
            } else {
                navigate('/accounting/accounts');
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

    const handleUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('balance', value);
        }
    };

    const handleCancel = () => {
        if (propOnCancel) {
            propOnCancel();
        } else {
            navigate('/accounting/accounts');
        }
    };

    const getTypeOptions = (classification: string) => {
        if (classification === AccountClassification.Assets) {
            return [
                { value: "Long term", label: "Long term" },
                { value: "Medium term", label: "Medium term" },
                { value: "Short term", label: "Short term" },
                { value: "Debt", label: "Debt" },
                { value: "Equity", label: "Equity" },
                { value: "Real estate", label: "Real estate" },
                { value: "Commodity", label: "Commodity" },
                { value: "DA", label: "Depreciation Asset" }
            ];
        }
        if (classification === AccountClassification.Liabilities) {
            return [
                { value: "Secured", label: "Secured" },
                { value: "Unsecured", label: "Unsecured" }
            ];
        }
        if (classification === AccountClassification.Income) {
            return [
                { value: "Time", label: "Time" },
                { value: "Capital", label: "Capital" },
                { value: "Investments", label: "Investments" }
            ];
        }
        if (classification === AccountClassification.Expense) {
            return [
                { value: "Core", label: "Core" },
                { value: "Discretionary", label: "Discretionary" },
                { value: "Obligation", label: "Obligation" }
            ];
        }
        return [];
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
                            {initialValues ? 'Edit Account' : 'Create Account'}
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
                                        name="balance"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Balance</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="Enter Balance"
                                                        {...field}
                                                        onChange={handleUnitPriceChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="classification"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Classification</FormLabel>
                                                <FormControl>
                                                    <Select
                                                        value={field.value}
                                                        placeholder="Select Classification"
                                                        style={{ width: '100%' }}
                                                        size="large"
                                                        onChange={field.onChange}
                                                        options={[
                                                            { value: AccountClassification.Assets, label: 'Assets' },
                                                            { value: AccountClassification.Liabilities, label: 'Liabilities' },
                                                            { value: AccountClassification.Equity, label: 'Equity' },
                                                            { value: AccountClassification.Income, label: 'Income' },
                                                            { value: AccountClassification.Expense, label: 'Expense' }
                                                        ]}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="currency"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Currency</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Currency"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Type</FormLabel>
                                                <FormControl>
                                                    <Select
                                                        mode="tags"
                                                        showSearch
                                                        value={Array.isArray(field.value) ? field.value : []}
                                                        placeholder="Select account types..."
                                                        style={{ width: '100%' }}
                                                        size="large"
                                                        defaultActiveFirstOption={false}
                                                        suffixIcon={null}
                                                        filterOption={false}
                                                        onChange={field.onChange}
                                                        notFoundContent={null}
                                                        disabled={!selectedClassification}
                                                        maxTagCount={10}
                                                        options={getTypeOptions(selectedClassification).map((option) => ({
                                                            value: option.value,
                                                            label: option.label,
                                                        }))}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="code"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Code</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Code"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="frequency"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Frequency</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Frequency"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="parent_account_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Parent Account</FormLabel>
                                                <SearchDropDown
                                                    instanceType="account"
                                                    instanceSourceKey="parent_account_id"
                                                    instanceKey="id"
                                                    instanceLabel="name"
                                                    instanceValue={initialValues?.parent_account}
                                                    onSelectItem={onhandleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="name"
                                                    type="posting"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="hq_account_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>HQ Account</FormLabel>
                                                <SearchDropDown
                                                    instanceType="account"
                                                    instanceSourceKey="hq_account_id"
                                                    instanceKey="id"
                                                    instanceLabel="name"
                                                    instanceValue={initialValues?.hq_account}
                                                    onSelectItem={onhandleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="name"
                                                    type="posting"
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
                                                <FormLabel>Legal Entity</FormLabel>
                                                <SearchDropDown
                                                    instanceType="entity"
                                                    instanceSourceKey="legal_entity_id"
                                                    instanceKey="id"
                                                    instanceLabel="legal_name"
                                                    instanceValue={initialValues?.legal_entity}
                                                    onSelectItem={onhandleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="legal_name"
                                                    type="account"
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


