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

const LIST_PATH = '/masters/entity';

const ACCOUNT_FIELDS = [
  {
    name: 'default_receivable_account_id' as const,
    relation: 'default_receivable_account',
    label: 'Default AR account',
  },
  {
    name: 'default_income_account_id' as const,
    relation: 'default_income_account',
    label: 'Default income account',
  },
  {
    name: 'default_undeposited_funds_account_id' as const,
    relation: 'default_undeposited_funds_account',
    label: 'Default undeposited funds',
  },
  {
    name: 'default_fx_gain_loss_account_id' as const,
    relation: 'default_fx_gain_loss_account',
    label: 'Default FX gain/loss',
  },
  {
    name: 'default_discount_account_id' as const,
    relation: 'default_discount_account',
    label: 'Default discount account',
  },
] as const;

type AccountFieldName = (typeof ACCOUNT_FIELDS)[number]['name'];

const schema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  legal_name: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postal_code: z.string().optional(),
  currency_id: z.string().optional(),
  is_headquarters: z.boolean(),
  default_receivable_account_id: z.string().optional(),
  default_income_account_id: z.string().optional(),
  default_undeposited_funds_account_id: z.string().optional(),
  default_fx_gain_loss_account_id: z.string().optional(),
  default_discount_account_id: z.string().optional(),
  ledger_start_date: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  legal_name: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postal_code: '',
  currency_id: '',
  is_headquarters: false,
  default_receivable_account_id: '',
  default_income_account_id: '',
  default_undeposited_funds_account_id: '',
  default_fx_gain_loss_account_id: '',
  default_discount_account_id: '',
  ledger_start_date: '',
};

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function dateInput(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function datePayload(value: string | undefined): string | null {
  const day = blank(value);
  return day ? `${day}T00:00:00.000Z` : null;
}

export const EntityForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currency, setCurrency] = useState<Record<string, unknown> | null>(null);
  const [accounts, setAccounts] = useState<Partial<Record<AccountFieldName, Record<string, unknown> | null>>>({});
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
      .getById('entity', id, viewId)
      .then((res: any) => {
        const row = res.data ?? {};
        form.reset({
          name: row.name || '',
          legal_name: row.legal_name || '',
          address: row.address || '',
          city: row.city || '',
          state: row.state || '',
          country: row.country || '',
          postal_code: row.postal_code || '',
          currency_id: row.currency_id || '',
          is_headquarters: row.is_headquarters === true,
          default_receivable_account_id: row.default_receivable_account_id || '',
          default_income_account_id: row.default_income_account_id || '',
          default_undeposited_funds_account_id: row.default_undeposited_funds_account_id || '',
          default_fx_gain_loss_account_id: row.default_fx_gain_loss_account_id || '',
          default_discount_account_id: row.default_discount_account_id || '',
          ledger_start_date: dateInput(row.ledger_start_date),
        });
        setCurrency(row.currency ?? null);
        const next: Partial<Record<AccountFieldName, Record<string, unknown> | null>> = {};
        for (const field of ACCOUNT_FIELDS) {
          next[field.name] = (row[field.relation] as Record<string, unknown> | null) ?? null;
        }
        setAccounts(next);
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load entity' });
      })
      .finally(() => setIsLoading(false));
  }, [id, viewId]);

  const handleSubmit = async (data: FormValues) => {
    if (!viewId) return;
    const payload = {
      name: data.name.trim(),
      legal_name: blank(data.legal_name),
      address: blank(data.address),
      city: blank(data.city),
      state: blank(data.state),
      country: blank(data.country),
      postal_code: blank(data.postal_code),
      currency_id: blank(data.currency_id),
      is_headquarters: data.is_headquarters,
      default_receivable_account_id: blank(data.default_receivable_account_id),
      default_income_account_id: blank(data.default_income_account_id),
      default_undeposited_funds_account_id: blank(data.default_undeposited_funds_account_id),
      default_fx_gain_loss_account_id: blank(data.default_fx_gain_loss_account_id),
      default_discount_account_id: blank(data.default_discount_account_id),
      ledger_start_date: datePayload(data.ledger_start_date),
    };
    try {
      setIsSubmitting(true);
      if (id) await viewAPI.update('entity', id, viewId, payload);
      else await viewAPI.create('entity', viewId, payload);
      toast({ title: 'Saved', description: id ? 'Entity updated' : 'Entity created' });
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
          <h1 className="text-2xl font-bold text-gray-900">Entity</h1>
          <p className="text-sm text-gray-600 mt-1">{id ? 'Edit entity' : 'Create entity'}</p>
        </div>
        <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Edit entity' : 'New entity'}</CardTitle>
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
                    name="legal_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legal name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="postal_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal code</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                        <FormLabel>Functional currency</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="currency"
                            instanceKey="id"
                            instanceSourceKey="currency_id"
                            instanceLabel="code"
                            instanceValue={currency}
                            onSelectItem={(_source, key, value) => {
                              form.setValue('currency_id', value?.[key] || '');
                              setCurrency(value?.item ?? (value?.[key] ? { id: value[key], code: value.code } : null));
                            }}
                            onClear={() => {
                              form.setValue('currency_id', '');
                              setCurrency(null);
                            }}
                            limit={10}
                            searchParams="code"
                            type="currency"
                            isShowSearch={true}
                            placeholder="Select a currency"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_headquarters"
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
                        <FormLabel>Headquarters</FormLabel>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Ledger defaults</h2>
                    <p className="text-sm text-gray-600">
                      Used by Phase 4 posting. Leave blank to fill later or via CoA prefill.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {ACCOUNT_FIELDS.map((field) => (
                      <FormField
                        key={field.name}
                        control={form.control}
                        name={field.name}
                        render={() => (
                          <FormItem>
                            <FormLabel>{field.label}</FormLabel>
                            <FormControl>
                              <SearchDropDown
                                instanceType="account"
                                instanceKey="id"
                                instanceSourceKey={field.name}
                                instanceLabel="name"
                                instanceValue={accounts[field.name] ?? null}
                                onSelectItem={(_source, key, value) => {
                                  form.setValue(field.name, value?.[key] || '');
                                  setAccounts((prev) => ({
                                    ...prev,
                                    [field.name]:
                                      value?.item ??
                                      (value?.[key] ? { id: value[key], name: value.name } : null),
                                  }));
                                }}
                                onClear={() => {
                                  form.setValue(field.name, '');
                                  setAccounts((prev) => ({ ...prev, [field.name]: null }));
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
                    ))}
                    <FormField
                      control={form.control}
                      name="ledger_start_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ledger start date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
