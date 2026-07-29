import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchDropDown } from '../../search_dropdown/dropdown';

const taxGroupSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  code: z.string().min(1, { message: 'Code is required' }),
  country_code: z.string().optional(),
  status: z.string().optional(),
});

type TaxGroupValues = z.infer<typeof taxGroupSchema>;

type ComponentRow = {
  id?: string;
  tax_master_id: string;
  tax_master_label?: string;
  sequence: number;
};

const VIEW = 'tax_group_view';

export const TaxGroupForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const activeView = viewId || VIEW;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [components, setComponents] = useState<ComponentRow[]>([]);

  const form = useForm<TaxGroupValues>({
    resolver: zodResolver(taxGroupSchema),
    defaultValues: {
      name: '',
      code: '',
      country_code: '',
      status: 'Active',
    },
  });

  useEffect(() => {
    if (id) {
      void load(id);
    }
  }, [id]);

  const load = async (groupId: string) => {
    setIsLoading(true);
    try {
      const res = await viewAPI.getById('tax_group', groupId, activeView);
      const data = res.data;
      form.reset({
        name: data.name || '',
        code: data.code || '',
        country_code: data.country_code || '',
        status: data.status || 'Active',
      });
      const rows = (data.tax_group_component || []).map((c: any) => ({
        id: c.id,
        tax_master_id: c.tax_master_id,
        tax_master_label: c.tax_master?.tax_name || c.tax_master_id,
        sequence: c.sequence ?? 1,
      }));
      setComponents(rows.sort((a: ComponentRow, b: ComponentRow) => a.sequence - b.sequence));
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to load tax group',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (values: TaxGroupValues) => {
    setIsSubmitting(true);
    try {
      let groupId = id;
      if (id) {
        await viewAPI.update('tax_group', id, activeView, values);
      } else {
        const created = await viewAPI.create('tax_group', activeView, values);
        groupId = created.data?.id || created.id;
      }

      if (groupId) {
        const existingRes = await viewAPI.getById('tax_group', groupId, activeView);
        const existingComponents = existingRes.data?.tax_group_component || [];
        const existingIds = new Set(existingComponents.map((c: any) => c.id as string));
        const keepIds = new Set(components.filter((c) => c.id).map((c) => c.id as string));

        for (const existingId of existingIds) {
          if (!keepIds.has(existingId)) {
            await viewAPI.deleteChild(
              'tax_group',
              groupId,
              activeView,
              'tax_group_component',
              existingId
            );
          }
        }

        for (let i = 0; i < components.length; i++) {
          const row = components[i];
          if (!row.tax_master_id) continue;
          const payload = {
            tax_master_id: row.tax_master_id,
            sequence: i + 1,
          };
          if (row.id) {
            await viewAPI.updateChild(
              'tax_group',
              groupId,
              activeView,
              'tax_group_component',
              row.id,
              payload
            );
          } else {
            await viewAPI.addChild(
              'tax_group',
              groupId,
              activeView,
              'tax_group_component',
              payload
            );
          }
        }
      }

      toast({ title: 'Saved', description: 'Tax group saved successfully' });
      navigate('/accounting/tax-groups');
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to save tax group',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <Button variant="ghost" onClick={() => navigate('/accounting/tax-groups')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Edit Tax Group' : 'New Tax Group'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="GST 18% (CGST+SGST)" />
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
                      <Input {...field} placeholder="GST18" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="country_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="IN" />
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
                        <Input {...field} placeholder="Active" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel>Components</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setComponents((prev) => [
                        ...prev,
                        { tax_master_id: '', sequence: prev.length + 1 },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
                {components.map((row, index) => (
                  <div key={row.id || `new-${index}`} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <SearchDropDown
                        instanceType="tax_master"
                        instanceKey="id"
                        instanceSourceKey="tax_master_id"
                        instanceLabel="tax_name"
                        searchParams="tax_name"
                        type="tax_master"
                        instanceValue={
                          row.tax_master_id
                            ? { id: row.tax_master_id, tax_name: row.tax_master_label }
                            : undefined
                        }
                        onSelectItem={(value: any) => {
                          const item = value?.item || value;
                          setComponents((prev) => {
                            const next = [...prev];
                            next[index] = {
                              ...next[index],
                              tax_master_id: item?.id || value?.id || '',
                              tax_master_label: item?.tax_name || value?.tax_name || '',
                            };
                            return next;
                          });
                        }}
                        onClear={() => {
                          setComponents((prev) => {
                            const next = [...prev];
                            next[index] = {
                              ...next[index],
                              tax_master_id: '',
                              tax_master_label: '',
                            };
                            return next;
                          });
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setComponents((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};
