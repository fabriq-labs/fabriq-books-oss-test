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
import { SearchDropDown } from "../../search_dropdown/dropdown";
import { constructObject } from "../../utils/helper";
import { viewAPI } from "@/api/api";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import { formatCurrency } from "@/lib/formatters";
const itemMasterSchema = z.object({
  base_currency: z.string().min(1, { message: "Base Currency is required" }),
  from_currency: z.string().min(1, { message: "From Currency is required" }),
  effective_from: z.date({ required_error: "Effective From is required" }),
  currency_value: z
    .string()
    .min(1, { message: "Currency Value is required" })
    .refine((value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0, {
      message: "Currency Value must be a valid positive number",
    }),
  status: z.string().min(1, { message: "Status is required" }),
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

export const CurrencyMasterForm: React.FC<ItemMasterFormProps> = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [initialValues, setInitialValues] = useState<any>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const form = useForm<ItemMasterValues>({
    resolver: zodResolver(itemMasterSchema),
    defaultValues: initialValues || {
      base_currency: "",
      from_currency: "",
      currency_value: "",
      status: "",
      effective_from: "",
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
      .getById("currency_master", id, viewId)
      .then((res: any) => {
        setInitialValues(res.data);
        form.reset({
          base_currency: res.data.base_currency,
          from_currency: res.data.from_currency,
          currency_value: res.data.currency_value?.toString() || "",
          status: res.data.status || "",

          effective_from: res.data.effective_from
            ? new Date(res.data.effective_from)
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
        currency_value: parseFloat(data.currency_value),
        effective_from: data.effective_from
          ? data.effective_from.toISOString()
          : null,
      };

      if (!id) {
        await viewAPI.create("currency_master", viewId, submissionData);
        toast({
          title: "Success",
          description: "Currency Master created successfully",
        });
        navigate("/accounting/currency-master");
      } else {
        await viewAPI.update("currency_master", id, viewId, submissionData);
        toast({
          title: "Success",
          description: "Currency Master updated successfully",
        });
      }
      navigate("/accounting/currency-master");
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
    fields: any,
  ) => {
    const lookupData = constructObject(value.item, fields);
    form.setValue(sourceKey, value[key]);
  };

  const handleSelectClear = (sourceKey: any) => {
    form.setValue(sourceKey, "");
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

  const handleCancel = () => {
    navigate("/accounting/currency-master");
  };

  return (
    <div className="mx-auto w-[70%]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Currency Master</h1>
          <p className="text-sm text-gray-600 mt-1">
            {initialValues ? "Edit Currency" : "Create New Currency"}
          </p>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground"
          onClick={() => navigate("/accounting/currency-master")}
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
                    name="base_currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Base Currency <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Enter Base Currency" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="from_currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          From Currency <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter item shortname"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="effective_from"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Effective Form <span className="text-red-500">*</span>
                        </FormLabel>
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
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Status <span className="text-red-500">*</span>
                        </FormLabel>
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
                    name="currency_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Currency Value <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Enter Currency Value"
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
