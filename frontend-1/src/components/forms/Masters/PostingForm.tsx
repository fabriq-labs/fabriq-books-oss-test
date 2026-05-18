import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, ExternalLink, Sparkles, Loader2, FileCheck, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { viewAPI, agentAPI } from '@/api/api';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '../../utils/helper';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { TradeCreationModal } from './TradeCreationModal';
import { useTool } from '@/contexts/ToolContext';
import { Attachment } from '../../attachment/Attachment';
import { SearchDropDown } from '../../search_dropdown/dropdown';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { useEntity } from '@/contexts/EntityContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';
import { Badge } from '@/components/ui/badge';

const itemMasterSchema = z.object({
    account_name: z.string().optional(),
    category_name: z.string().optional(),
    notes:z.string().optional(),
    description: z.string().min(1, { message: 'Description is required' }),
    posting_type: z.string().optional(),
    account_id: z.string().min(1, { message: 'Account is required' }),
    amount: z.string().min(1, { message: 'Amount is required' }).refine(
        (value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0,
        { message: 'Amount must be a valid positive number' }
    ),
    credit_account_id: z.string().optional(),
    holding_id: z.string().optional(),
    income_type: z.string().optional(),
    income_source: z.string().optional(),
    value_date: z.date().optional(),
    posting_date: z.date().optional(),
});

type ItemMasterValues = z.infer<typeof itemMasterSchema>;

interface ItemMasterFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    id?: string;
    viewId?: string;
    onSuccess?: (updatedData?: any) => void;
}

export const PostingForm: React.FC<ItemMasterFormProps> = ({
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
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [linkedTrade, setLinkedTrade] = useState<any>(null);
    const [showTradeSection, setShowTradeSection] = useState(false);
    const [showIncomeSection, setShowIncomeSection] = useState(false);
    const [Id, setId] = useState<any>();
    const [isReconciling, setIsReconciling] = useState(false);
    const [reconciliationResult, setReconciliationResult] = useState<{
        status: 'SUGGESTED' | 'UNMATCHED' | 'SKIPPED' | 'MATCHED';
        best_match: {
            type: 'payment_receipt' | 'invoice';
            id: string;
            reference: string;
            amount: number;
            date: string;
            customer: string | null;
            confidence: 'high' | 'medium' | 'low';
        } | null;
        alternatives: Array<{
            type: 'payment_receipt' | 'invoice';
            id: string;
            reference: string;
            amount: number;
            date: string;
            customer: string | null;
            confidence: 'high' | 'medium' | 'low';
        }>;
    } | null>(null);
    const [showAlternatives, setShowAlternatives] = useState(false);
    const [isConfirmingMatch, setIsConfirmingMatch] = useState(false);
    const [lastPredictedField, setLastPredictedField] = useState<'account_id' | 'credit_account_id' | null>(null);
    const { latestFormToolResponse } = useTool();
    const location = useLocation();
    const { setPageContext } = useChatContext();
    const { currentEntityId } = useEntity();
    const accountAdditionalFilters = currentEntityId
        ? { legal_entity_id: { eq: currentEntityId } }
        : undefined;

    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: initialValues || {
            account_name: '',
            notes: '',
            posting_type: '',
            description: '',
            amount: '',
            account_id: '',
            credit_account_id: '',
            holding_id: '',
            income_type: '',
            income_source: '',
            value_date: '',
            posting_date: '',
            category_name: ''
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
            checkLinkedTrade(id);
        }
        setLastPredictedField(null);
    }, [id]);

    useEffect(() => {
        const modelName = 'posting';
        setPageContext({
            modelName,
            viewName: getViewName(modelName),
            recordId: id || null,
            stateId: null,
            viewId: viewId || null,
            modelDisplayName: getModelDisplayName(modelName),
            currentPath: location.pathname
        });

        return () => {
            setPageContext(null);
        };
    }, [id, viewId, location.pathname, setPageContext]);

    // Handle latest form tool response updates
    useEffect(() => {
        if (latestFormToolResponse && latestFormToolResponse.result && latestFormToolResponse.result.model === 'posting') {
            console.log('Latest form tool response:', latestFormToolResponse);

            if (latestFormToolResponse.result.data) {
                const toolResultData = latestFormToolResponse.result.data;
                if (toolResultData.id) {
                    setInitialValues(toolResultData);
                    form.reset({
                        account_name: toolResultData?.account?.name || '',
                        notes: toolResultData?.notes || '',
                        posting_type: toolResultData?.posting_type || '',
                        description: toolResultData?.description || '',
                        account_id: toolResultData?.account_id || undefined,
                        amount: toolResultData?.amount,
                        credit_account_id: toolResultData?.credit_account_id || undefined,
                        holding_id: toolResultData?.holding_id || undefined,
                        income_type: toolResultData?.income_type || undefined,
                        income_source: toolResultData?.income_source || undefined,
                        value_date: toolResultData?.value_date ? new Date(toolResultData.value_date) : undefined,
                        posting_date: toolResultData?.posting_date ? new Date(toolResultData.posting_date) : undefined,
                        category_name: toolResultData?.category?.name || '',
                    });
                }
            }
        }
    }, [latestFormToolResponse, form]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("posting", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    account_name: res.data?.account?.name || '',
                    notes: res.data?.notes || '',
                    posting_type: res.data?.posting_type || '',
                    description: res.data?.description || '',
                    account_id: res.data?.account_id || undefined,
                    amount: res.data?.amount,
                    credit_account_id: res.data?.credit_account_id || undefined,
                    holding_id: res.data?.holding_id || undefined,
                    income_type: res.data?.income_type || undefined,
                    income_source: res.data?.income_source || undefined,
                    value_date: res.data?.value_date ? new Date(res.data.value_date) : undefined,
                    posting_date: res.data?.posting_date ? new Date(res.data.posting_date) : undefined,
                    category_name: res.data?.category?.name || '',
                });
                if (res.data?.reconciliation_status === 'MATCHED' && res.data?.payment_receipt) {
                    const pr = res.data.payment_receipt;
                    setReconciliationResult({
                        status: 'MATCHED',
                        best_match: {
                            type: 'payment_receipt' as const,
                            id: pr.id,
                            reference: pr.receipt_number || pr.id,
                            amount: pr.amount ?? 0,
                            date: pr.receipt_date ?? '',
                            customer: pr.invoice?.customers?.customer_name ?? null,
                            confidence: 'high',
                        },
                        alternatives: [],
                    });
                }
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
                amount: parseFloat(data.amount),
                credit_account_id: data.credit_account_id || null,
                holding_id: data.holding_id || null,
                income_type: data.income_type || null,
                income_source: data.income_source || null,
                posting_type: data.posting_type || null
            };

            let postingId: string;

            if (!id) {
                const result = await viewAPI.create(
                    "posting",
                    viewId,
                    submissionData
                );
                postingId = (result as any).data.id;
                setId(postingId);
                toast({
                    title: "Success",
                    description: "Posting created successfully",
                });
            } else {
                await viewAPI.update(
                    "posting",
                    id,
                    viewId,
                    submissionData
                );
                postingId = id;
                setId(postingId);
                toast({
                    title: "Success",
                    description: "Posting updated successfully",
                });
            }

            await checkLinkedTrade(postingId);

            if (propOnSuccess) {
                if (id) {
                    try {
                        const updatedRecord = await viewAPI.getById("posting", id, viewId);
                        propOnSuccess((updatedRecord as any).data);
                    } catch (error) {
                        console.error("Failed to fetch updated record:", error);
                        propOnSuccess(submissionData);
                    }
                } else {
                    propOnSuccess(submissionData);
                }
            } else {
                navigate('/accounting/transactions');
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

    const checkLinkedTrade = async (postingId: string) => {
        try {
            const posting = await viewAPI.getById("posting", postingId, viewId);
            if ((posting as any).data?.trade) {
                setLinkedTrade((posting as any).data.trade);
            }
        } catch (error) {
            console.error("Failed to fetch posting details:", error);
        }
    };

    const handleTradeCreated = async (tradeId: string) => {
        try {
            if (id) {
                await checkLinkedTrade(id);
                const updatedPosting = await viewAPI.getById("posting", id, viewId);
                setInitialValues((updatedPosting as any).data);
            }
            setShowTradeModal(false);
        } catch (error) {
            console.error("Failed to refresh posting data:", error);
        }
    };

    const handleSelectChange = (
        sourceKey: any,
        key: string,
        value: any,
        fields: any
    ) => {
        if (sourceKey === lastPredictedField) setLastPredictedField(null);
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key], { shouldValidate: true });
    };

    const handleSelectClear = (sourceKey: any) => {
        if (sourceKey === lastPredictedField) setLastPredictedField(null);
        form.setValue(sourceKey, '', { shouldValidate: true });
    };

    const handleUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            form.setValue('amount', value);
        }
    };

    const handleCancel = () => {
        if (propOnCancel) {
            propOnCancel();
        } else {
            navigate('/accounting/transactions');
        }
    };

    const toggleTradeSection = () => {
        setShowTradeSection(!showTradeSection);
        if (showIncomeSection) {
            setShowIncomeSection(false);
        }
    };

    const toggleIncomeSection = () => {
        setShowIncomeSection(!showIncomeSection);
        if (showTradeSection) {
            setShowTradeSection(false);
        }
    };

    const handleReconcile = async () => {
        if (!id) {
            toast({
                title: "Cannot reconcile",
                description: "Please save the posting first",
                variant: "destructive",
            });
            return;
        }

        const description = form.getValues('description');
        if (!description) {
            toast({
                title: "Cannot reconcile",
                description: "Please add a description to the transaction",
                variant: "destructive",
            });
            return;
        }

        setIsReconciling(true);
        setReconciliationResult(null);
        setShowAlternatives(false);
        try {
            const result = await agentAPI.reconcileTransaction({
                posting_ids: [id],
            });

            if (result.success && result.data?.results?.length) {
                const entry = result.data.results[0];

                // Store reconciliation suggestions for the panel
                if (entry.reconciliation) {
                    setReconciliationResult(entry.reconciliation);
                }

                // Which account did the pipeline update? (so we can highlight it after refresh)
                const posting = entry.posting as { account_id?: string; credit_account_id?: string } | undefined;
                const prevAccountId = form.getValues('account_id');
                const prevCreditId = form.getValues('credit_account_id');
                if (posting) {
                    if (posting.account_id !== prevAccountId) setLastPredictedField('account_id');
                    else if (posting.credit_account_id !== prevCreditId) setLastPredictedField('credit_account_id');
                    else setLastPredictedField(null);
                }

                // Refresh posting data — the pipeline already updated the posting in DB
                await fetchingDetails(id);

                // Show toast based on reconciliation status
                const recon = entry.reconciliation;
                if (recon?.status === 'SUGGESTED' && recon.best_match) {
                    const matchType = recon.best_match.type === 'payment_receipt' ? 'Receipt' : 'Invoice';
                    toast({
                        title: "Transaction classified",
                        description: `Matched to ${matchType} ${recon.best_match.reference} (${recon.best_match.confidence} confidence)`,
                    });
                } else if (recon?.status === 'UNMATCHED') {
                    toast({
                        title: "Transaction categorized",
                        description: "Categorization applied. No matching invoice or receipt found.",
                    });
                } else {
                    toast({
                        title: "Transaction categorized",
                        description: "Categorization applied successfully.",
                    });
                }
            } else {
                throw new Error(result.error || 'Reconciliation failed');
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Classification failed",
                description: error.message || "Unable to classify this transaction. Please try again.",
            });
        } finally {
            setIsReconciling(false);
        }
    };

    const handleConfirmMatch = async () => {
        if (!id) return;
        setIsConfirmingMatch(true);
        try {
            const result = await agentAPI.confirmReconciliation({ posting_id: id });
            if (!result.success || !result.data) {
                throw new Error((result as any).error || 'Confirm failed');
            }
            await fetchingDetails(id);
            setReconciliationResult((prev) =>
                prev ? { ...prev, status: 'MATCHED' as const } : null
            );
            toast({
                title: "Match confirmed",
                description: "This transaction is now linked to the receipt and marked as reconciled.",
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Failed to confirm match",
                description: error.message || "Please try again.",
            });
        } finally {
            setIsConfirmingMatch(false);
        }
    };

    const renderTradeSection = () => {
        if (!showTradeSection) return null;

        return (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Trade Details</h3>

                {linkedTrade ? (
                    <div className="p-4 border rounded-lg bg-muted/50">
                        <div className="flex items-center justify-between">
                            <h4 className="text-md font-semibold">Linked Trade</h4>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    type='button'
                                    size="sm"
                                    onClick={() => {
                                        setShowTradeModal(true);
                                    }}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Edit Trade
                                </Button>
                                <Button
                                    variant="outline"
                                    type='button'
                                    size="sm"
                                    onClick={() => window.open(`/trade/${linkedTrade.id}/view/default`, '_blank')}
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    View Trade
                                </Button>
                            </div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                            {linkedTrade.isin} - {linkedTrade.quantity} shares @ ${linkedTrade.price}
                        </div>
                    </div>
                ) : (
                    <Button
                        type="button"
                        onClick={() => {
                            setShowTradeModal(true);
                        }}
                        className="w-full"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Trade Entry
                    </Button>
                )}
            </div>
        );
    };

    const renderIncomeSection = () => {
        if (!showIncomeSection) return null;

        return (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Income Details</h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="income_type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Income Type</FormLabel>
                                <FormControl>
                                    <select
                                        {...field}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <option value="">Select Income Type</option>
                                        <option value="DIVIDEND">Dividend</option>
                                        <option value="INTEREST">Interest</option>
                                        <option value="CAPITAL_GAIN">Capital Gain</option>
                                        <option value="RENTAL_INCOME">Rental Income</option>
                                        <option value="ROYALTY">Royalty</option>
                                        <option value="OTHER_INVESTMENT_INCOME">Other Investment Income</option>
                                    </select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="income_source"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Income Source</FormLabel>
                                <FormControl>
                                    <select
                                        {...field}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <option value="">Select Income Source</option>
                                        <option value="STOCK">Stock</option>
                                        <option value="BOND">Bond</option>
                                        <option value="MUTUAL_FUND">Mutual Fund</option>
                                        <option value="ETF">ETF</option>
                                        <option value="DEPOSIT">Deposit</option>
                                        <option value="REAL_ESTATE">Real Estate</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="holding_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Holding (for Investment Income)</FormLabel>
                            <SearchDropDown
                                instanceType="holding"
                                instanceSourceKey="holding_id"
                                instanceKey="id"
                                instanceLabel="name"
                                instanceValue={initialValues?.holding}
                                onSelectItem={handleSelectChange}
                                onClear={handleSelectClear}
                                limit="10"
                                searchParams="name"
                                type="posting"
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        );
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
                            {initialValues ? 'Edit Posting' : 'Create Posting'}
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
                                    {/* Amount and Posting Date Row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="amount"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Amount</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="text"
                                                            placeholder="Enter Amount"
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
                                            name="posting_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Posting Date</FormLabel>
                                                    <DatePicker
                                                        className="w-full h-10 px-3 py-2 border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                        style={{ width: "100%" }}
                                                        value={field.value ? dayjs(field.value) : null}
                                                        onChange={(date) => {
                                                            field.onChange(date ? date.toDate() : null);
                                                        }}
                                                        format="DD-MM-YYYY"
                                                        placeholder="Posting Date"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Debit Account and Credit Account Row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="account_id"
                                            render={({ field }) => (
                                                <FormItem className={lastPredictedField === 'account_id' ? 'rounded-md bg-primary/10 dark:bg-primary/20 p-3 -mx-1 transition-colors' : ''}>
                                                    <FormLabel>Debit Account</FormLabel>
                                                    <SearchDropDown
                                                        instanceType="account"
                                                        instanceSourceKey="account_id"
                                                        instanceKey="id"
                                                        instanceLabel="name"
                                                        instanceValue={initialValues?.account}
                                                        onSelectItem={handleSelectChange}
                                                        onClear={handleSelectClear}
                                                        limit="10"
                                                        searchParams="name"
                                                        type="posting"
                                                        additionalFilters={accountAdditionalFilters}
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="credit_account_id"
                                            render={({ field }) => (
                                                <FormItem className={lastPredictedField === 'credit_account_id' ? 'rounded-md bg-primary/10 dark:bg-primary/20 p-3 -mx-1 transition-colors' : ''}>
                                                    <FormLabel>Credit Account</FormLabel>
                                                    <SearchDropDown
                                                        instanceType="account"
                                                        instanceSourceKey="credit_account_id"
                                                        instanceKey="id"
                                                        instanceLabel="name"
                                                        instanceValue={initialValues?.credit_account}
                                                        onSelectItem={handleSelectChange}
                                                        onClear={handleSelectClear}
                                                        limit="10"
                                                        searchParams="name"
                                                        type="posting"
                                                        additionalFilters={accountAdditionalFilters}
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Value Date and Description Row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="value_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Value Date</FormLabel>
                                                    <DatePicker
                                                        className="w-full h-10 px-3 py-2 border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                        style={{ width: "100%" }}
                                                        value={field.value ? dayjs(field.value) : null}
                                                        onChange={(date) => {
                                                            field.onChange(date ? date.toDate() : null);
                                                        }}
                                                        format="DD-MM-YYYY"
                                                        placeholder="Value Date"
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="description"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Description</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter Description" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Notes - Full Width */}
                                    <FormField
                                        control={form.control}
                                        name="notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notes</FormLabel>
                                                <FormControl>
                                                    <textarea
                                                        placeholder="Enter Notes"
                                                        {...field}
                                                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                        rows={3}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Attachments */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            Attachments
                                        </label>
                                        <Attachment
                                            model="posting"
                                            id={Id || id}
                                        />
                                    </div>

                                    {/* Form Actions */}
                                    <div className="flex justify-end space-x-2 pt-4 border-t">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={handleCancel}
                                        >
                                            Cancel
                                        </Button>
                                        {/* Reconcile button - categorize + reconcile */}
                                        {id && (
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={handleReconcile}
                                                disabled={
                                                    isReconciling ||
                                                    isSubmitting ||
                                                    !form.watch('description') ||
                                                    (!!initialValues?.payment_receipt && !!form.watch('account_id') && !!form.watch('credit_account_id'))
                                                }
                                            >
                                                {isReconciling ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        Reconciling...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="w-4 h-4 mr-2" />
                                                        Reconcile
                                                    </>
                                                )}
                                            </Button>
                                        )}
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

                        {/* Reconciliation Suggestions Panel - hide when linked receipt already matches the suggestion */}
                        {reconciliationResult &&
                            reconciliationResult.status === 'SUGGESTED' &&
                            reconciliationResult.best_match &&
                            !(
                                initialValues?.payment_receipt &&
                                reconciliationResult.best_match.type === 'payment_receipt' &&
                                reconciliationResult.best_match.id === initialValues.payment_receipt.id
                            ) && (
                                <div className="mt-6 border rounded-lg overflow-hidden">
                                    <div className="bg-muted/50 px-4 py-3 border-b">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <FileCheck className="w-4 h-4 text-primary" />
                                                <span className="font-medium text-sm">Reconciliation Match</span>
                                                <Badge variant={
                                                    reconciliationResult.best_match.confidence === 'high' ? 'default' :
                                                        reconciliationResult.best_match.confidence === 'medium' ? 'secondary' : 'outline'
                                                }>
                                                    {reconciliationResult.best_match.confidence}
                                                </Badge>
                                            </div>
                                            {reconciliationResult.status === 'MATCHED' ? (
                                                <Badge className="text-xs bg-green-600 hover:bg-green-600">
                                                    Confirmed
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-xs">
                                                    SUGGESTED
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    {/* Best Match */}
                                    <div className="px-4 py-3 bg-primary/5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-1 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4 text-primary" />
                                                    <span className="font-medium text-sm">
                                                        {reconciliationResult.best_match.type === 'payment_receipt' ? 'Payment Receipt' : 'Invoice'}: {reconciliationResult.best_match.reference}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-muted-foreground ml-6 space-y-0.5">
                                                    <div>Amount: {reconciliationResult.best_match.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</div>
                                                    {reconciliationResult.best_match.date && (
                                                        <div>Date: {new Date(reconciliationResult.best_match.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                                    )}
                                                    {reconciliationResult.best_match.customer && (
                                                        <div>Customer: {reconciliationResult.best_match.customer}</div>
                                                    )}
                                                </div>
                                            </div>
                                            {reconciliationResult.status === 'SUGGESTED' && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="shrink-0"
                                                    onClick={handleConfirmMatch}
                                                    disabled={isConfirmingMatch}
                                                >
                                                    {isConfirmingMatch ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                            Confirming...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                                            Confirm match
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Alternatives Toggle */}
                                    {reconciliationResult.alternatives.length > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 flex items-center justify-center gap-1 border-t transition-colors"
                                                onClick={() => setShowAlternatives(!showAlternatives)}
                                            >
                                                {showAlternatives ? (
                                                    <>
                                                        <ChevronUp className="w-3 h-3" />
                                                        Hide {reconciliationResult.alternatives.length} other suggestion{reconciliationResult.alternatives.length > 1 ? 's' : ''}
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="w-3 h-3" />
                                                        Show {reconciliationResult.alternatives.length} other suggestion{reconciliationResult.alternatives.length > 1 ? 's' : ''}
                                                    </>
                                                )}
                                            </button>

                                            {/* Alternatives List */}
                                            {showAlternatives && (
                                                <div className="border-t divide-y">
                                                    {reconciliationResult.alternatives.map((alt, idx) => (
                                                        <div key={idx} className="px-4 py-2.5 hover:bg-muted/20 transition-colors">
                                                            <div className="flex items-start justify-between">
                                                                <div className="space-y-0.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm text-muted-foreground">
                                                                            {alt.type === 'payment_receipt' ? 'Receipt' : 'Invoice'}: {alt.reference}
                                                                        </span>
                                                                        <Badge variant="outline" className="text-xs">
                                                                            {alt.confidence}
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {alt.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                                        {alt.customer && ` - ${alt.customer}`}
                                                                        {alt.date && ` - ${new Date(alt.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                        {/* Unmatched status indicator */}
                        {reconciliationResult && reconciliationResult.status === 'UNMATCHED' && (
                            <div className="mt-6 border rounded-lg px-4 py-3 bg-muted/30">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <XCircle className="w-4 h-4" />
                                    <span className="text-sm">No matching invoice or payment receipt found. Transaction has been categorized.</span>
                                </div>
                            </div>
                        )}

                        {/* Linked receipt (when posting is already matched to a receipt) */}
                        {initialValues?.payment_receipt && (
                            <div className="mt-6 border rounded-lg overflow-hidden">
                                <div className="bg-muted/50 px-4 py-3 border-b flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-primary" />
                                    <span className="font-medium text-sm">Linked Receipt</span>
                                    <Badge className="text-xs bg-green-600 hover:bg-green-600">Confirmed</Badge>
                                </div>
                                <div className="px-4 py-3 space-y-2">
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                        <span className="font-medium">Receipt:</span>
                                        <span>{initialValues.payment_receipt.receipt_number ?? initialValues.payment_receipt.id}</span>
                                        <span>Amount: {Number(initialValues.payment_receipt.amount ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                                        {initialValues.payment_receipt.receipt_date && (
                                            <span>Date: {new Date(initialValues.payment_receipt.receipt_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                        )}
                                    </div>
                                    {initialValues.payment_receipt.invoice && (
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground pl-4 border-l-2 border-muted">
                                            <span className="font-medium">Invoice:</span>
                                            <span>{initialValues.payment_receipt.invoice.invoice_number ?? initialValues.payment_receipt.invoice.id}</span>
                                            <span>Total: {Number(initialValues.payment_receipt.invoice.invoice_total ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                                            {initialValues.payment_receipt.invoice.invoice_date && (
                                                <span>Date: {new Date(initialValues.payment_receipt.invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                            )}
                                            {initialValues.payment_receipt.invoice.customers?.customer_name && (
                                                <span>Customer: {initialValues.payment_receipt.invoice.customers.customer_name}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Trade Creation Modal */}
                        <TradeCreationModal
                            isOpen={showTradeModal}
                            onClose={() => setShowTradeModal(false)}
                            postingData={initialValues || {
                                id: id,
                                account_id: id ? undefined : '',
                                value_date: undefined,
                                amount: undefined,
                                credit_account_id: id ? undefined : '',
                            }}
                            existingTrade={linkedTrade}
                            onTradeCreated={handleTradeCreated}
                        />
                    </CardContent>
                </Card>
            </div>
        </>
    );
};



