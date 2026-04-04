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

const currencySchema = z.object({
  code: z
    .string()
    .min(3, { message: "Currency Code must be at least 3 characters" })
    .max(3, { message: "Currency Code must be 3 characters" }),
  name: z.string().min(1, { message: "Currency Name is required" }),
  symbol: z.string().optional(),
  decimal_places: z
    .string()
    .min(1, { message: "Decimal Places is required" })
    .refine((value) => /^\d+$/.test(value), {
      message: "Decimal Places must be a valid number",
    }),
  is_active: z.string().min(1, { message: "Status is required" }),
});

type CurrencyFormValues = z.infer<typeof currencySchema>;

export const CurrencyForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [initialValues, setInitialValues] = useState<any>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<CurrencyFormValues>({
    resolver: zodResolver(currencySchema),
    defaultValues: {
      code: "",
      name: "",
      symbol: "",
      decimal_places: "2",
      is_active: "true",
    },
  });

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    viewAPI
      .getById("currency", id, viewId)
      .then((res: any) => {
        setInitialValues(res.data);
        form.reset({
          code: res.data.code || "",
          name: res.data.name || "",
          symbol: res.data.symbol || "",
          decimal_places: (res.data.decimal_places ?? 2).toString(),
          is_active: res.data.is_active ? "true" : "false",
        });
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setIsLoading(false));
  }, [id, viewId, form]);

  const handleSubmit = async (data: CurrencyFormValues) => {
    try {
      setIsSubmitting(true);
      const submissionData = {
        ...data,
        code: data.code.toUpperCase(),
        symbol: data.symbol || null,
        decimal_places: parseInt(data.decimal_places, 10),
        is_active: data.is_active === "true",
      };

      if (!id) {
        await viewAPI.create("currency", viewId, submissionData);
        toast({
          title: "Success",
          description: "Currency created successfully",
        });
      } else {
        await viewAPI.update("currency", id, viewId, submissionData);
        toast({
          title: "Success",
          description: "Currency updated successfully",
        });
      }
      navigate("/accounting/currency");
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

  const handleCancel = () => {
    navigate("/accounting/currency");
  };

  return (
    <div className="mx-auto w-[70%]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Currency</h1>
          <p className="mt-1 text-sm text-gray-600">
            {initialValues ? "Edit Currency" : "Create New Currency"}
          </p>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground"
          onClick={() => navigate("/accounting/currency")}
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
                <Skeleton className="mb-2 h-4 w-[120px]" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div>
                <Skeleton className="mb-2 h-4 w-[120px]" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Currency Code <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            maxLength={3}
                            placeholder="Enter ISO Code (e.g. USD)"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Currency Name <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Enter Currency Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="symbol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Symbol</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter Symbol (e.g. $)" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="decimal_places"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Decimal Places <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Enter Decimal Places" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_active"
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
                            <SelectItem value="true">Active</SelectItem>
                            <SelectItem value="false">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={handleCancel}>
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
