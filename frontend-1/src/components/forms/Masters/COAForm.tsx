import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '@/components/utils/helper';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';

// Account classification enum values
const ACCOUNT_CLASSIFICATIONS = ["Assets", "Liabilities", "Income", "Expense", "Equity"] as [string, ...string[]];

// Helper function to map account type to classification
const mapAccountTypeToClassification = (accountType: string): string => {
    const mapping: Record<string, string> = {
        "Asset": "Assets",
        "Liability": "Liabilities",
        "Liabilities": "Liabilities",
        "Income": "Income",
        "Expense": "Expense",
        "Equity": "Equity"
    };
    return mapping[accountType] || "Assets";
};

// Transform form data - Map COA field names to Prisma schema field names
const transformFormDataToAccount = (formData: {
    account_name?: string;
    account_type?: string;
    account_number?: string;
    legal_entity_id?: string;
    status?: string;
    classification?: string;
    currency?: string;
}) => {
    // Map COA field names to Prisma schema field names
    // Prisma expects: name (not account_name), type (array, not account_type)
    const payload: Record<string, unknown> = {};

    // Map account_name → name
    if (formData.account_name) {
        payload.name = formData.account_name;
    }

    // Map account_type → type (convert string to array)
    if (formData.account_type) {
        payload.type = [formData.account_type];
    }

    // Direct fields (no mapping needed)
    if (formData.account_number) {
        payload.account_number = parseInt(formData.account_number);
    }
    if (formData.legal_entity_id) {
        payload.legal_entity_id = formData.legal_entity_id;
    }
    if (formData.status) {
        payload.status = formData.status;
    }
    if (formData.classification) {
        payload.classification = formData.classification;
    }
    if (formData.currency) {
        payload.currency = formData.currency;
    }

    return payload;
};

// Transform account model data to form format - handles both old and new formats
const transformAccountToFormData = (accountData: {
    name?: string;
    account_name?: string;
    type?: string | string[];
    account_type?: string;
    account_number?: number | string;
    legal_entity_id?: string;
    status?: string;
    is_active?: boolean;
    classification?: string;
    code?: string;
    coa_code?: string;
}) => {
    return {
        account_name: accountData.account_name || accountData.name || '',
        account_type: accountData.account_type ||
            (Array.isArray(accountData.type) ? accountData.type[0] : (accountData.type as string)) || '',
        account_number: accountData.account_number?.toString() || '',
        legal_entity_id: accountData.legal_entity_id || '',
        status: accountData.status || (accountData.is_active ? "Active" : "InActive"),
        classification: accountData.classification || mapAccountTypeToClassification(
            accountData.account_type ||
            (Array.isArray(accountData.type) ? accountData.type[0] : (accountData.type as string)) || ""
        ),
    };
};

const itemMasterSchema = z.object({
    account_name: z.string().min(1, { message: 'Account Name is required' }),
    account_type: z.string().min(1, { message: 'Account Type is required' }),
    account_number: z.string().min(1, { message: 'Account Number is required' }).refine(
        (value) => !isNaN(parseFloat(value)) && parseInt(value) >= 0,
        { message: 'Account Number must be a valid positive number' }
    ),
    legal_entity_id: z.string().min(1, { message: 'Legal Entity is required' }),
    status: z.string().min(1, { message: 'Status is required' }),
    classification: z.enum(ACCOUNT_CLASSIFICATIONS, {
        required_error: 'Classification is required',
        invalid_type_error: 'Invalid classification value',
    }).optional(),
    currency: z.string().optional(),
});

type ItemMasterValues = z.infer<typeof itemMasterSchema>;

interface ItemMasterFormProps {
    initialValues?: Record<string, unknown>;
    onSubmit?: (data: ItemMasterValues) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    uomOptions?: unknown[];
    itemCategoryOptions?: unknown[];
    supplierOptions?: unknown[];
}

interface ApiResponse {
    data: {
        name?: string;
        code?: string;
        type?: string | string[];
        classification?: string;
        is_active?: boolean;
        status?: string;
        account_name?: string;
        coa_code?: string;
        account_type?: string;
        [key: string]: unknown;
    };
}

export const COAForm: React.FC<ItemMasterFormProps> = (
) => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<Record<string, unknown>>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: initialValues || {
            account_name: '',
            account_type: '',
            account_number: '',
            legal_entity_id: '',
            status: 'Active',
            classification: 'Assets',
            currency: 'USD',
        },
    });

    const fetchingDetails = useCallback((accountId: string) => {
        if (!viewId) return;
        setIsLoading(true);
        viewAPI.getById("account", accountId, viewId)
            .then((res: ApiResponse) => {
                setInitialValues(res.data);
                // Transform account data to form format (handles both old and new formats)
                const formData = transformAccountToFormData(res.data);
                form.reset(formData);
                setIsLoading(false);
            }).catch((err: unknown) => {
                setIsLoading(false);
                console.log(err);
            });
    }, [viewId, form]);

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id, fetchingDetails]);

    const handleSubmit = async (data: ItemMasterValues) => {
        try {
            setIsSubmitting(true);

            // Backend now accepts COA fields directly - transform and send
            const submissionData = transformFormDataToAccount(data);

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
                navigate('/master/finance/chart-accounts');
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
            navigate('/master/finance/chart-accounts');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Something went wrong";
            toast({
                variant: "destructive",
                title: "Error",
                description: errorMessage,
            });
            console.error("Error:", errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleSelectChange = (sourceKey: string, key: string, value: { item: Record<string, unknown>;[key: string]: unknown }, fields: unknown[]) => {
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey as keyof ItemMasterValues, value[key] as string, { shouldValidate: true });
    };

    const handleSelectClear = (sourceKey: string) => {
        form.setValue(sourceKey as keyof ItemMasterValues, '', { shouldValidate: true });
    };

    const handleUnitPriceChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        onChange: (value: string) => void
    ) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            onChange(value);
        }
    };
    const handleCancel = () => {
        navigate('/master/finance/chart-accounts');
    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Account Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Account' : 'Create New Account'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/master/finance/chart-accounts')}
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
                                        name="account_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Account Name <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Account Name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="account_type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Account Type <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Account Type (e.g., Asset, Liability, Income, Expense, Equity)" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="account_number"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Account Number <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Account Number"
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
                                        name="legal_entity_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Legal Entity <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="organization"
                                                    instanceSourceKey="legal_entity_id"
                                                    instanceKey="id"
                                                    instanceLabel="legal_name"
                                                    instanceValue={
                                                        initialValues?.organization
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="legal_name"
                                                    type="cost_center"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )} />

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
                                                            <SelectValue placeholder="Select status" />
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

                                    <FormField
                                        control={form.control}
                                        name="classification"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Classification</FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select classification" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {ACCOUNT_CLASSIFICATIONS.map((classification) => (
                                                            <SelectItem key={classification} value={classification}>
                                                                {classification}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
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
                                                    <Input placeholder="USD" {...field} />
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