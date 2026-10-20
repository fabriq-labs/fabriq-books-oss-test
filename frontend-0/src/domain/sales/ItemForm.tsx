import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { viewAPI } from '@/api/api';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';

const LIST_PATH = '/masters/items';

const schema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  code: z.string().optional(),
  description: z.string().optional(),
  item_type: z.string().optional(),
  unit_price: z.string().optional(),
  sales_account_id: z.string().optional(),
  purchase_account_id: z.string().optional(),
  tax_group_id: z.string().optional(),
  is_stockable: z.boolean(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  code: '',
  description: '',
  item_type: '',
  unit_price: '',
  sales_account_id: '',
  purchase_account_id: '',
  tax_group_id: '',
  is_stockable: false,
  is_active: true,
};

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export const ItemForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [salesAccount, setSalesAccount] = useState<Record<string, unknown> | null>(null);
  const [purchaseAccount, setPurchaseAccount] = useState<Record<string, unknown> | null>(null);
  const [taxGroup, setTaxGroup] = useState<Record<string, unknown> | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!id || !viewId) return;
    setIsLoading(true);
    viewAPI
      .getById('item_master', id, viewId)
      .then((res: any) => {
        const row = res.data ?? {};
        form.reset({
          name: row.name || '',
          code: row.code || '',
          description: row.description || '',
          item_type: row.item_type || '',
          unit_price: row.unit_price != null ? String(row.unit_price) : '',
          sales_account_id: row.sales_account_id || '',
          purchase_account_id: row.purchase_account_id || '',
          tax_group_id: row.tax_group_id || '',
          is_stockable: row.is_stockable === true,
          is_active: row.is_active !== false,
        });
        setSalesAccount(row.sales_account ?? null);
        setPurchaseAccount(row.purchase_account ?? null);
        setTaxGroup(row.tax_group ?? null);
        setSourceLabel(row.source_system_id ? `Synced · ${row.source_record_id ?? ''}` : null);
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load item' });
      })
      .finally(() => setIsLoading(false));
  }, [id, viewId, form, toast]);

  const handleSubmit = async (data: FormValues) => {
    if (!viewId) return;
    const payload = {
      name: data.name.trim(),
      code: blank(data.code),
      description: blank(data.description),
      item_type: blank(data.item_type),
      unit_price: blank(data.unit_price),
      sales_account_id: blank(data.sales_account_id),
      purchase_account_id: blank(data.purchase_account_id),
      tax_group_id: blank(data.tax_group_id),
      is_stockable: data.is_stockable,
      is_active: data.is_active,
    };
    try {
      setIsSubmitting(true);
      if (id) await viewAPI.update('item_master', id, viewId, payload);
      else await viewAPI.create('item_master', viewId, payload);
      toast({ title: 'Saved', description: id ? 'Item updated' : 'Item created' });
      navigate(LIST_PATH);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Something went wrong',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-[70%]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Item</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sourceLabel || (id ? 'Edit item' : 'Create item')}
          </p>
        </div>
        <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Edit item' : 'New item'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                        <FormLabel>Code / SKU</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="item_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="service / goods" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="unit_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit price</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sales_account_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>Sales account</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="account"
                            instanceKey="id"
                            instanceSourceKey="sales_account_id"
                            instanceLabel="name"
                            instanceValue={salesAccount}
                            onSelectItem={(_source, key, value) => {
                              form.setValue('sales_account_id', value?.[key] || '');
                              setSalesAccount(value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null));
                            }}
                            onClear={() => {
                              form.setValue('sales_account_id', '');
                              setSalesAccount(null);
                            }}
                            limit={10}
                            searchParams="name"
                            type="account"
                            isShowSearch={true}
                            placeholder="Select account"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="purchase_account_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>Purchase account</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="account"
                            instanceKey="id"
                            instanceSourceKey="purchase_account_id"
                            instanceLabel="name"
                            instanceValue={purchaseAccount}
                            onSelectItem={(_source, key, value) => {
                              form.setValue('purchase_account_id', value?.[key] || '');
                              setPurchaseAccount(value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null));
                            }}
                            onClear={() => {
                              form.setValue('purchase_account_id', '');
                              setPurchaseAccount(null);
                            }}
                            limit={10}
                            searchParams="name"
                            type="account"
                            isShowSearch={true}
                            placeholder="Select account"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tax_group_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>Tax group</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="tax_group"
                            instanceKey="id"
                            instanceSourceKey="tax_group_id"
                            instanceLabel="name"
                            instanceValue={taxGroup}
                            onSelectItem={(_source, key, value) => {
                              form.setValue('tax_group_id', value?.[key] || '');
                              setTaxGroup(value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null));
                            }}
                            onClear={() => {
                              form.setValue('tax_group_id', '');
                              setTaxGroup(null);
                            }}
                            limit={10}
                            searchParams="name"
                            type="tax_group"
                            isShowSearch={true}
                            placeholder="Select tax group"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_stockable"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 pt-8">
                        <FormControl>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={field.value}
                            onChange={(event) => field.onChange(event.target.checked)}
                          />
                        </FormControl>
                        <FormLabel>Stockable</FormLabel>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 pt-8">
                        <FormControl>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={field.value}
                            onChange={(event) => field.onChange(event.target.checked)}
                          />
                        </FormControl>
                        <FormLabel>Active</FormLabel>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => navigate(LIST_PATH)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save'}
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

export default ItemForm;
