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
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';

const LIST_PATH = '/accounting/transactions';

const KINDS = ['opening', 'journal', 'reversal', 'sales_invoice', 'closing', 'duplicate'] as const;
const STATUSES = ['active', 'reversed'] as const;
const RECONCILIATION = ['unmatched', 'suggested', 'matched', 'confirmed'] as const;

const schema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  category_name: z.string().optional(),
  account_name: z.string().optional(),
  value_date: z.string().optional(),
  posting_date: z.string().optional(),
  amount: z.string().optional(),
  kind: z.string().optional(),
  status: z.string().optional(),
  reconciliation_status: z.string().optional(),
  debit_account_id: z.string().optional(),
  credit_account_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  description: '',
  notes: '',
  category_name: '',
  account_name: '',
  value_date: '',
  posting_date: '',
  amount: '',
  kind: 'journal',
  status: 'active',
  reconciliation_status: '',
  debit_account_id: '',
  credit_account_id: '',
};

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function isoDate(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  return trimmed;
}

function dateInput(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

export const PostingForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [debitAccount, setDebitAccount] = useState<Record<string, unknown> | null>(null);
  const [creditAccount, setCreditAccount] = useState<Record<string, unknown> | null>(null);
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
      .getById('posting', id, viewId)
      .then((res: any) => {
        const row = res.data ?? {};
        form.reset({
          name: row.name || '',
          description: row.description || '',
          notes: row.notes || '',
          category_name: row.category_name || '',
          account_name: row.account_name || '',
          value_date: dateInput(row.value_date),
          posting_date: dateInput(row.posting_date),
          amount: row.amount != null ? String(row.amount) : '',
          kind: row.kind || '',
          status: row.status || 'active',
          reconciliation_status: row.reconciliation_status || '',
          debit_account_id: row.debit_account_id || '',
          credit_account_id: row.credit_account_id || '',
        });
        setDebitAccount(row.debit_account ?? null);
        setCreditAccount(row.credit_account ?? null);
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load transaction' });
      })
      .finally(() => setIsLoading(false));
  }, [id, viewId]);

  const handleSelectChange = (sourceKey: string, key: string, value: any) => {
    form.setValue(sourceKey as keyof FormValues, value[key]);
    const item = value.item ?? { id: value[key], name: value.name };
    if (sourceKey === 'debit_account_id') setDebitAccount(item);
    if (sourceKey === 'credit_account_id') setCreditAccount(item);
  };

  const handleSelectClear = (sourceKey: string) => {
    form.setValue(sourceKey as keyof FormValues, '');
    if (sourceKey === 'debit_account_id') setDebitAccount(null);
    if (sourceKey === 'credit_account_id') setCreditAccount(null);
  };

  const handleSubmit = async (data: FormValues) => {
    if (!viewId) return;
    const payload = {
      name: blank(data.name),
      description: blank(data.description),
      notes: blank(data.notes),
      category_name: blank(data.category_name),
      account_name: blank(data.account_name),
      value_date: isoDate(data.value_date),
      posting_date: isoDate(data.posting_date),
      amount: blank(data.amount),
      kind: blank(data.kind),
      status: blank(data.status) || 'active',
      reconciliation_status: blank(data.reconciliation_status),
      debit_account_id: blank(data.debit_account_id),
      credit_account_id: blank(data.credit_account_id),
    };
    try {
      setIsSubmitting(true);
      if (id) {
        await viewAPI.update('posting', id, viewId, payload);
        toast({ title: 'Saved', description: 'Transaction updated' });
      } else {
        await viewAPI.create('posting', viewId, payload);
        toast({ title: 'Saved', description: 'Transaction created' });
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
          <h1 className="text-2xl font-bold text-gray-900">Transaction</h1>
          <p className="text-sm text-gray-600 mt-1">{id ? 'Edit transaction' : 'Create transaction'}</p>
        </div>
        <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Edit transaction' : 'New transaction'}</CardTitle>
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
                    name="value_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Value date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
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
                        <FormLabel>Posting date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="kind"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kind</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={field.value || ''}
                            onChange={field.onChange}
                          >
                            <option value="">Select</option>
                            {KINDS.map((value) => (
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
                    name="debit_account_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>Debit account</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="account"
                            instanceKey="id"
                            instanceSourceKey="debit_account_id"
                            instanceLabel="name"
                            instanceValue={debitAccount}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit={10}
                            searchParams="name"
                            type="account"
                            isShowSearch={true}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="credit_account_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>Credit account</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="account"
                            instanceKey="id"
                            instanceSourceKey="credit_account_id"
                            instanceLabel="name"
                            instanceValue={creditAccount}
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit={10}
                            searchParams="name"
                            type="account"
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
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={field.value || 'active'}
                            onChange={field.onChange}
                          >
                            {STATUSES.map((value) => (
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
                    name="reconciliation_status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reconciliation</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={field.value || ''}
                            onChange={field.onChange}
                          >
                            <option value="">Select</option>
                            {RECONCILIATION.map((value) => (
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
                    name="category_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
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
