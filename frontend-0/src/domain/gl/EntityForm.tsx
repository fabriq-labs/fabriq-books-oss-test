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
};

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export const EntityForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currency, setCurrency] = useState<Record<string, unknown> | null>(null);
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
        });
        setCurrency(row.currency ?? null);
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
