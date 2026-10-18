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
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';

const LIST_PATH = '/accounting/exchange-rates';
const RATE_TYPES = ['spot', 'closing', 'average'] as const;

const schema = z.object({
  from_currency_id: z.string().min(1, { message: 'From currency is required' }),
  to_currency_id: z.string().min(1, { message: 'To currency is required' }),
  effective_date: z.string().min(1, { message: 'Effective date is required' }),
  rate: z.string().min(1, { message: 'Rate is required' }),
  rate_type: z.string().min(1, { message: 'Type is required' }),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  from_currency_id: '',
  to_currency_id: '',
  effective_date: '',
  rate: '',
  rate_type: 'spot',
};

function dateInput(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

export const ExchangeRateForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fromCurrency, setFromCurrency] = useState<Record<string, unknown> | null>(null);
  const [toCurrency, setToCurrency] = useState<Record<string, unknown> | null>(null);
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
      .getById('exchange_rate', id, viewId)
      .then((res: any) => {
        const row = res.data ?? {};
        form.reset({
          from_currency_id: row.from_currency_id || '',
          to_currency_id: row.to_currency_id || '',
          effective_date: dateInput(row.effective_date),
          rate: row.rate != null ? String(row.rate) : '',
          rate_type: row.rate_type || 'spot',
        });
        setFromCurrency(row.from_currency ?? null);
        setToCurrency(row.to_currency ?? null);
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load exchange rate' });
      })
      .finally(() => setIsLoading(false));
  }, [id, viewId]);

  const handleSubmit = async (data: FormValues) => {
    if (!viewId) return;
    if (data.from_currency_id === data.to_currency_id) {
      toast({ variant: 'destructive', title: 'Error', description: 'From and to currency must differ' });
      return;
    }
    const payload = {
      from_currency_id: data.from_currency_id,
      to_currency_id: data.to_currency_id,
      effective_date: `${data.effective_date}T00:00:00.000Z`,
      rate: data.rate.trim(),
      rate_type: data.rate_type,
    };
    try {
      setIsSubmitting(true);
      if (id) await viewAPI.update('exchange_rate', id, viewId, payload);
      else await viewAPI.create('exchange_rate', viewId, payload);
      toast({ title: 'Saved', description: id ? 'Exchange rate updated' : 'Exchange rate created' });
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
          <h1 className="text-2xl font-bold text-gray-900">Exchange rate</h1>
          <p className="text-sm text-gray-600 mt-1">{id ? 'Edit rate' : 'Create rate'}</p>
        </div>
        <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Edit exchange rate' : 'New exchange rate'}</CardTitle>
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
                    name="from_currency_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>From currency</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="currency"
                            instanceKey="id"
                            instanceSourceKey="from_currency_id"
                            instanceLabel="code"
                            instanceValue={fromCurrency}
                            onSelectItem={(_source, key, value) => {
                              form.setValue('from_currency_id', value?.[key] || '');
                              setFromCurrency(value?.item ?? null);
                            }}
                            onClear={() => {
                              form.setValue('from_currency_id', '');
                              setFromCurrency(null);
                            }}
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
                    name="to_currency_id"
                    render={() => (
                      <FormItem>
                        <FormLabel>To currency</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="currency"
                            instanceKey="id"
                            instanceSourceKey="to_currency_id"
                            instanceLabel="code"
                            instanceValue={toCurrency}
                            onSelectItem={(_source, key, value) => {
                              form.setValue('to_currency_id', value?.[key] || '');
                              setToCurrency(value?.item ?? null);
                            }}
                            onClear={() => {
                              form.setValue('to_currency_id', '');
                              setToCurrency(null);
                            }}
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
                    name="effective_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Effective date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rate_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={field.value}
                            onChange={field.onChange}
                          >
                            {RATE_TYPES.map((value) => (
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
                    name="rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rate</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.000001" {...field} />
                        </FormControl>
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
