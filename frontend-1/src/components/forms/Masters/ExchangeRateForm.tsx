import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { viewAPI } from "@/api/api";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import { SearchDropDown } from "@/components/search_dropdown/dropdown";
import { constructObject } from "@/components/utils/helper";
const itemMasterSchema = z.object({
    to_currency_id: z.string().min(1, { message: "To Currency is required" }),
    from_currency_id: z.string().min(1, { message: "From Currency is required" }),
    effective_date: z.date({ required_error: "Effective Date is required" }),
    rate: z
        .string()
        .min(1, { message: "Rate is required" })
        .refine((value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0, {
            message: "Rate must be a valid positive number",
        }),
    rate_type: z.string().min(1, { message: "Rate Type is required" }),
    source: z.string().optional(),
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

export const ExchangeRateForm: React.FC<ItemMasterFormProps> = () => {
    const { id, viewId } = useParams<{ id: string; viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: initialValues || {
            to_currency_id: "",
            from_currency_id: "",
            rate: "",
            rate_type: "",
            source: "",
            effective_date: undefined,
        },
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI
            .getById("exchange_rate", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    to_currency_id: res.data.to_currency_id || "",
                    from_currency_id: res.data.from_currency_id,
                    rate: res.data.rate?.toString() || "",
                    rate_type: res.data.rate_type || "",
                    source: res.data.source || "",

                    effective_date: res.data.effective_date
                        ? new Date(res.data.effective_date)
                        : undefined,
                });
                setIsLoading(false);
            })
            .catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };

    const handleSubmit = async (data: ItemMasterValues) => {
        try {
            setIsSubmitting(true);

            const submissionData = {
                ...data,
                rate: parseFloat(data.rate),
                source: data.source || null,
                effective_date: data.effective_date
                    ? data.effective_date.toISOString()
                    : null,
            };

            if (!id) {
                await viewAPI.create("exchange_rate", viewId, submissionData);
                toast({
                    title: "Success",
                    description: "Exchange Rate created successfully",
                });
                navigate("/accounting/exchange-rates");
            } else {
                await viewAPI.update("exchange_rate", id, viewId, submissionData);
                toast({
                    title: "Success",
                    description: "Exchange Rate updated successfully",
                });
            }
            navigate("/accounting/exchange-rates");
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

    const handleUnitPriceChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        onChange: (value: any) => void,
    ) => {
        const value = e.target.value;
        if (value === "" || /^\d*\.?\d*$/.test(value)) {
            onChange(value); // ✅ tell RHF about the change
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
    const handleCancel = () => {
        navigate("/accounting/exchange-rates");
    };

    return (
        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Exchange Rate</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? "Edit Exchange Rate" : "Create New Exchange Rate"}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate("/accounting/exchange-rates")}
                >
                    <ArrowLeft size={16} />
                    Back to list
                </Button>
            </div>
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
                            <form
                                onSubmit={form.handleSubmit(handleSubmit)}
                                className="space-y-6"
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="from_currency_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>From Currency</FormLabel>
                                                <SearchDropDown
                                                    instanceType="currency"
                                                    instanceSourceKey="from_currency_id"
                                                    instanceKey="id"
                                                    instanceLabel="code"
                                                    instanceValue={
                                                        initialValues?.from_currency
                                                    }
                                                    onSelectItem={onhandleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="code"
                                                    type="holding"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="to_currency_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>To Currency</FormLabel>
                                                <SearchDropDown
                                                    instanceType="currency"
                                                    instanceSourceKey="to_currency_id"
                                                    instanceKey="id"
                                                    instanceLabel="code"
                                                    instanceValue={
                                                        initialValues?.to_currency
                                                    }
                                                    onSelectItem={onhandleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="code"
                                                    type="holding"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="effective_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Effective Date <span className="text-red-500">*</span>
                                                </FormLabel>
                                                <DatePicker
                                                    style={{ width: "100%" }}
                                                    value={field.value ? dayjs(field.value) : null}
                                                    onChange={(date) => {
                                                        field.onChange(date ? date.toDate() : null);
                                                    }}
                                                    format="DD-MM-YYYY"
                                                    placeholder="Effective Date"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="rate_type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Rate Type <span className="text-red-500">*</span>
                                                </FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value || ""}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select Rate Type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="SPOT">SPOT</SelectItem>
                                                        <SelectItem value="CLOSING">CLOSING</SelectItem>
                                                        <SelectItem value="AVERAGE">AVERAGE</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="rate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Rate <span className="text-red-500">*</span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter Exchange Rate"
                                                        value={field.value || ""} // keep in sync
                                                        onChange={(e) =>
                                                            handleUnitPriceChange(e, field.onChange)
                                                        }
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {/* <FormField
                                        control={form.control}
                                        name="source"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Source</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="manual / api:openexchangerates"
                                                        value={field.value || ""}
                                                        onChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    /> */}
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
                        </Form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
