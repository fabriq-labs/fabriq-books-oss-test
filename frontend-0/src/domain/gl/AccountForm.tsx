import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';

const LIST_PATH = '/accounting/accounts';

const CLASSIFICATIONS = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

const schema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  code: z.string().optional(),
  account_number: z.string().optional(),
  classification: z.string().optional(),
  account_types: z.string().optional(),
  sub_type: z.string().optional(),
  status: z.string().optional(),
  balance: z.string().optional(),
  credit_limit: z.string().optional(),
  is_active: z.boolean(),
  parent_account_id: z.string().optional(),
  currency_id: z.string().optional(),
  entity_id: z.string().optional(),
  extraction_notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  code: '',
  account_number: '',
  classification: '',
  account_types: '',
  sub_type: '',
  status: '',
  balance: '',
  credit_limit: '',
  is_active: true,
  parent_account_id: '',
  currency_id: '',
  entity_id: '',
  extraction_notes: '',
};

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function decimalOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export const AccountForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [searchParams] = useSearchParams();
  const duplicateOf = searchParams.get('duplicateOf');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parentAccount, setParentAccount] = useState<Record<string, unknown> | null>(null);
  const [currency, setCurrency] = useState<Record<string, unknown> | null>(null);
  const [entity, setEntity] = useState<Record<string, unknown> | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    const sourceId = id || duplicateOf;
    if (!sourceId || !viewId) return;
    setIsLoading(true);
    viewAPI
      .getById('account', sourceId, viewId)
      .then((res: any) => {
        const row = res.data ?? {};
        const types = Array.isArray(row.account_types) ? row.account_types.join(', ') : '';
        form.reset({
          name: row.name || '',
          code: row.code || '',
          account_number: row.account_number || '',
          classification: row.classification || '',
          account_types: types,
          sub_type: row.sub_type || '',
          status: row.status || '',
          balance: row.balance != null ? String(row.balance) : '',
          credit_limit: row.credit_limit != null ? String(row.credit_limit) : '',
          is_active: row.is_active !== false,
          parent_account_id: row.parent_account_id || '',
          currency_id: row.currency_id || '',
          entity_id: row.entity_id || '',
          extraction_notes: row.extraction_notes || '',
        });
        setParentAccount(row.parent_account ?? null);
        setCurrency(row.currency ?? null);
        setEntity(row.entity ?? null);
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load account' });
      })
      .finally(() => setIsLoading(false));
  }, [id, duplicateOf, viewId]);

  const handleSelectChange = (sourceKey: string, key: string, value: any) => {
    form.setValue(sourceKey as keyof FormValues, value[key]);
    if (sourceKey === 'parent_account_id') setParentAccount(value.item ?? { id: value[key], name: value.name });
    if (sourceKey === 'currency_id') setCurrency(value.item ?? { id: value[key], code: value.code });
    if (sourceKey === 'entity_id') setEntity(value.item ?? { id: value[key], name: value.name });
  };

  const handleSelectClear = (sourceKey: string) => {
    form.setValue(sourceKey as keyof FormValues, '');
    if (sourceKey === 'parent_account_id') setParentAccount(null);
    if (sourceKey === 'currency_id') setCurrency(null);
    if (sourceKey === 'entity_id') setEntity(null);
  };

  const handleSubmit = async (data: FormValues) => {
    if (!viewId) return;
    const types = (data.account_types || '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    const payload = {
      name: data.name.trim(),
      code: blank(data.code),
      account_number: blank(data.account_number),
      classification: blank(data.classification),
      account_types: types,
      sub_type: blank(data.sub_type),
      status: blank(data.status),
      balance: decimalOrNull(data.balance),
      credit_limit: decimalOrNull(data.credit_limit),
      is_active: data.is_active,
      parent_account_id: blank(data.parent_account_id),
      currency_id: blank(data.currency_id),
      entity_id: blank(data.entity_id),
      extraction_notes: blank(data.extraction_notes),
    };
    try {
      setIsSubmitting(true);
      if (id) {
        await viewAPI.update('account', id, viewId, payload);
        toast({ title: 'Saved', description: 'Account updated' });
      } else {
        await viewAPI.create('account', viewId, payload);
        toast({ title: 'Saved', description: 'Account created' });
      }
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
          <h1 className="text-2xl font-bold text-gray-900">Account</h1>
          <p className="text-sm text-gray-600 mt-1">{id ? 'Edit account' : 'Create account'}</p>
        </div>
        <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Edit account' : 'New account'}</CardTitle>
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
                        <FormLabel>Code</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                        <FormLabel>Account number</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={field.value || ''}
                            onChange={field.onChange}
                          >
                            <option value="">Select</option>
                            {CLASSIFICATIONS.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="account_types"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Types</FormLabel>
                        <FormControl>
                          <Input placeholder="bank, cash" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sub_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sub type</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="credit_limit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credit limit</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="parent_account_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>Parent account</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="account"
                            instanceKey="id"
                            instanceSourceKey="parent_account_id"
                            instanceLabel="name"
                            instanceValue={parentAccount}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit={10}
                            searchParams="name"
                            type="account"
                            isShowSearch={true}
                            excludeIds={id ? [id] : []}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="entity_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>Entity</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="entity"
                            instanceKey="id"
                            instanceSourceKey="entity_id"
                            instanceLabel="name"
                            instanceValue={entity}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit={10}
                            searchParams="name"
                            type="entity"
                            isShowSearch={true}
                            placeholder="Select an entity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="currency_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="currency"
                            instanceKey="id"
                            instanceSourceKey="currency_id"
                            instanceLabel="code"
                            instanceValue={currency}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit={10}
                            searchParams="code"
                            type="currency"
                            isShowSearch={true}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
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
                <FormField
                  control={form.control}
                  name="extraction_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Extraction notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Hints for reading this account's statements"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
