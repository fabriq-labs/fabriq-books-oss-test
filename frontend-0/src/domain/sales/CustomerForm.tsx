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

const LIST_PATH = '/sales/customers';

const schema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  legal_name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postal_code: z.string().optional(),
  website: z.string().optional(),
  currency_id: z.string().optional(),
  entity_id: z.string().optional(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  legal_name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postal_code: '',
  website: '',
  currency_id: '',
  entity_id: '',
  is_active: true,
};

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export const CustomerForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currency, setCurrency] = useState<Record<string, unknown> | null>(null);
  const [entity, setEntity] = useState<Record<string, unknown> | null>(null);
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
      .getById('customer', id, viewId)
      .then((res: any) => {
        const row = res.data ?? {};
        form.reset({
          name: row.name || '',
          legal_name: row.legal_name || '',
          email: row.email || '',
          phone: row.phone || '',
          address: row.address || '',
          city: row.city || '',
          state: row.state || '',
          country: row.country || '',
          postal_code: row.postal_code || '',
          website: row.website || '',
          currency_id: row.currency_id || '',
          entity_id: row.entity_id || '',
          is_active: row.is_active !== false,
        });
        setCurrency(row.currency ?? null);
        setEntity(row.entity ?? null);
        setSourceLabel(row.source_system_id ? `Synced · ${row.source_record_id ?? ''}` : null);
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load customer' });
      })
      .finally(() => setIsLoading(false));
  }, [id, viewId, form, toast]);

  const handleSubmit = async (data: FormValues) => {
    if (!viewId) return;
    const payload = {
      name: data.name.trim(),
      legal_name: blank(data.legal_name),
      email: blank(data.email),
      phone: blank(data.phone),
      address: blank(data.address),
      city: blank(data.city),
      state: blank(data.state),
      country: blank(data.country),
      postal_code: blank(data.postal_code),
      website: blank(data.website),
      currency_id: blank(data.currency_id),
      entity_id: blank(data.entity_id),
      is_active: data.is_active,
    };
    try {
      setIsSubmitting(true);
      if (id) await viewAPI.update('customer', id, viewId, payload);
      else await viewAPI.create('customer', viewId, payload);
      toast({ title: 'Saved', description: id ? 'Customer updated' : 'Customer created' });
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
          <h1 className="text-2xl font-bold text-foreground">Customer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sourceLabel || (id ? 'Edit customer' : 'Create customer')}
          </p>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground"
          onClick={() => navigate(LIST_PATH)}
        >
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Edit customer' : 'New customer'}</CardTitle>
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
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
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
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
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
                        <FormLabel>Currency</FormLabel>
                        <FormControl>
                          <SearchDropDown
                            instanceType="currency"
                            instanceKey="id"
                            instanceSourceKey="currency_id"
                            instanceLabel="code"
                            instanceValue={currency}
                            onSelectItem={(_source, key, value) => {
                              form.setValue('currency_id', value?.[key] || '');
                              setCurrency(
                                value?.item ?? (value?.[key] ? { id: value[key], code: value.code } : null)
                              );
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
                            onSelectItem={(_source, key, value) => {
                              form.setValue('entity_id', value?.[key] || '');
                              setEntity(
                                value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null)
                              );
                            }}
                            onClear={() => {
                              form.setValue('entity_id', '');
                              setEntity(null);
                            }}
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

export default CustomerForm;
