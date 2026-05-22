import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Copy, CalendarDays } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '../../utils/helper';
import { Select } from 'antd';
import { useTool } from '@/contexts/ToolContext';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';
import { SearchDropDown } from '../../search_dropdown/dropdown';
import { formatCurrency } from '@/lib/formatters';
import dayjs from 'dayjs';

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
    base_currency_id: z.string().optional(),
    code: z.string().optional(),
    frequency: z.string().optional(),
    legal_entity_id: z.string().optional(),
    extraction_notes: z.string().max(2000).optional(),
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
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const duplicateOfId = searchParams.get("duplicateOf");
    const id = propId || paramId;
    const viewId = propViewId || paramViewId;
    const isDuplicateMode = !id && !!duplicateOfId;
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const { latestFormToolResponse } = useTool();
    const { setPageContext } = useChatContext();

    // Opening balance from OPENING_BALANCE posting (read-only display)
    const [openingPosting, setOpeningPosting] = useState<{ amount: number; posting_date: string; account_id: string; credit_account_id: string } | null>(null);

    useEffect(() => {
        if (!id) return;
        viewAPI.search('posting', 'posting_view', 1, 1, undefined, {
            OR: [{ account_id: id }, { credit_account_id: id }],
            posting_type: 'OPENING_BALANCE',
        } as any).then((res: any) => {
            const row = Array.isArray(res?.data) ? res.data[0] : null;
            if (row) {
                setOpeningPosting({
                    amount: Number(row.amount),
                    posting_date: row.value_date ?? row.posting_date ?? '',
                    account_id: row.account_id ?? '',
                    credit_account_id: row.credit_account_id ?? '',
                });
            }
        }).catch(() => { /* non-critical — silently ignore */ });
    }, [id]);

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
            base_currency_id: '',
            frequency: '',
            legal_entity_id: '',
            extraction_notes: '',
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        } else if (duplicateOfId) {
            fetchingDetails(duplicateOfId, true);
        }
    }, [id, duplicateOfId]);

    const watchedName = form.watch('name');
    const watchedCode = form.watch('code');
    const watchedLegalEntityId = form.watch('legal_entity_id');

    useEffect(() => {
        const modelName = 'account';
        const accountName = watchedName || initialValues?.name;
        const accountCode = watchedCode || initialValues?.code;
        const legalEntityId =
            watchedLegalEntityId ||
            initialValues?.legal_entity_id?.toString() ||
            undefined;
        setPageContext({
            modelName,
            viewName: getViewName(modelName),
            recordId: id || null,
            stateId: null,
            viewId: viewId || null,
            modelDisplayName: getModelDisplayName(modelName),
            currentPath: location.pathname,
            modelContext: {
                accountName: accountName || undefined,
                accountCode: accountCode || undefined,
                legal_entity_id: legalEntityId,
                currencyCode: initialValues?.currency?.code || undefined,
            },
        });

        return () => {
            setPageContext(null);
        };
    }, [
        id,
        viewId,
        location.pathname,
        setPageContext,
        initialValues?.name,
        initialValues?.code,
        initialValues?.legal_entity_id,
        initialValues?.currency?.code,
        watchedName,
        watchedCode,
        watchedLegalEntityId,
    ]);

    const addCopySuffix = (value: string) => value ? `${value} copy` : value;

    const getDuplicateValues = (source: any) => ({
        name: addCopySuffix(source.name || ''),
        balance: source.balance || '',
        classification: source.classification || '',
        type: Array.isArray(source.type) ? source.type : (source.type ? [source.type] : []),
        code: addCopySuffix(source.code?.toString() || ''),
        parent_account_id: source.parent_account_id?.toString() || '',
        hq_account_id: source.hq_account_id?.toString() || '',
        base_currency_id: source.base_currency_id?.toString() || '',
        frequency: source.frequency?.toString() || '',
        legal_entity_id: source.legal_entity_id?.toString() || '',
        extraction_notes: source.extraction_notes || '',
    });

    const getEditValues = (source: any) => ({
        name: source.name || '',
        balance: source.balance || '',
        classification: source.classification || '',
        type: Array.isArray(source.type) ? source.type : (source.type ? [source.type] : []),
        code: source.code?.toString() || '',
        parent_account_id: source.parent_account_id?.toString() || '',
        hq_account_id: source.hq_account_id?.toString() || '',
        base_currency_id: source.base_currency_id?.toString() || '',
        frequency: source.frequency?.toString() || '',
        legal_entity_id: source.legal_entity_id?.toString() || '',
        extraction_notes: source.extraction_notes || '',
    });

    const fetchingDetails = (id: any, duplicate = false) => {
        setIsLoading(true);
        viewAPI.getById("account", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset(duplicate ? getDuplicateValues(res.data) : getEditValues(res.data));
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
                        base_currency_id: toolResultData.base_currency_id?.toString() || '',
                        frequency: toolResultData.frequency?.toString() || '',
                        legal_entity_id: toolResultData.legal_entity_id?.toString() || '',
                        extraction_notes: toolResultData.extraction_notes || '',
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

            if (!id || isDuplicateMode) {
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

    const handleDuplicate = () => {
        if (!id || !viewId) return;
        window.open(`/account/view/${viewId}?duplicateOf=${id}`, "_blank");
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
                            {isDuplicateMode ? 'Duplicate Account' : initialValues ? 'Edit Account' : 'Create Account'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* Opening balance banner — shown in edit mode only when a migration posting exists */}
                        {id && openingPosting && (() => {
                            const classification = form.watch('classification') || initialValues?.classification || '';
                            const onDebitLeg = openingPosting.account_id === id;
                            const debitNormal = ['Assets', 'Expense'].includes(classification);
                            const displayBalance = (onDebitLeg === debitNormal)
                                ? openingPosting.amount
                                : -openingPosting.amount;
                            const dateLabel = openingPosting.posting_date
                                ? dayjs(openingPosting.posting_date).format('DD MMM YYYY')
                                : '';
                            return (
                                <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
                                    <CalendarDays className="h-4 w-4 text-blue-600 shrink-0" />
                                    <span className="text-blue-800">
                                        <span className="font-medium">Opening Balance</span>
                                        {dateLabel && <span className="text-blue-600 ml-1">as of {dateLabel}</span>}
                                        <span className="mx-2 text-blue-300">·</span>
                                        <span className="font-semibold font-mono">{formatCurrency(displayBalance)}</span>
                                        <span className="ml-2 text-blue-500 text-xs">{onDebitLeg ? 'Dr' : 'Cr'}</span>
                                    </span>
                                </div>
                            );
                        })()}

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
                                        name="base_currency_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Base Currency</FormLabel>
                                                <SearchDropDown
                                                    instanceType="currency"
                                                    instanceSourceKey="base_currency_id"
                                                    instanceKey="id"
                                                    instanceLabel="code"
                                                    instanceValue={
                                                        initialValues?.currency
                                                    }
                                                    onSelectItem={onhandleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="code"
                                                    type="account"
                                                />
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

                                    <FormField
                                        control={form.control}
                                        name="extraction_notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Bank Statement Extraction Notes</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        placeholder="Describe any account-specific quirks that help the AI interpret transaction descriptions. Example: 'EBA prefix means a transfer to/from ICICI Direct trading account.'"
                                                        className="resize-y min-h-[100px]"
                                                        maxLength={2000}
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    These notes are injected into the AI prompt when importing bank statements for this account. Max 2000 characters.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="flex justify-end space-x-2">
                                        {!!id && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleDuplicate}
                                                className="flex items-center gap-2"
                                            >
                                                <Copy size={14} />
                                                Duplicate
                                            </Button>
                                        )}
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


