import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  fetchModelToolConfig,
  fetchToolCatalog,
  saveModelToolConfig,
  type ToolCatalogEntry,
} from '@/api/agentModelToolsApi';

const schema = z.object({
  display_name: z.string().min(1, 'Display name is required'),
  description: z.string().optional(),
  model_tools: z.array(z.string()),
  include_analytics_tools: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().min(0),
});

type FormValues = z.infer<typeof schema>;

const CATEGORY_LABELS: Record<string, string> = {
  crud: 'CRUD',
  search: 'Search',
  analytics: 'Analytics',
  finance: 'Finance',
  erp: 'ERP',
  session: 'Session',
  other: 'Other',
};

export const AgentModelToolsForm: React.FC = () => {
  const { modelName: modelNameParam } = useParams<{ modelName: string }>();
  const modelName = modelNameParam ? decodeURIComponent(modelNameParam) : '';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<ToolCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name: '',
      description: '',
      model_tools: [],
      include_analytics_tools: true,
      is_active: true,
      sort_order: 0,
    },
  });

  const selectedTools = form.watch('model_tools');

  useEffect(() => {
    if (!modelName) return;
    setIsLoading(true);
    Promise.all([fetchToolCatalog(), fetchModelToolConfig(modelName)])
      .then(([cat, config]) => {
        setCatalog(cat);
        form.reset({
          display_name: config.display_name,
          description: config.description ?? '',
          model_tools: config.model_tools ?? [],
          include_analytics_tools: config.include_analytics_tools,
          is_active: config.is_active,
          sort_order: config.sort_order,
        });
      })
      .catch((err: Error) => {
        toast({ variant: 'destructive', title: 'Error', description: err.message });
      })
      .finally(() => setIsLoading(false));
  }, [modelName, form, toast]);

  const toolsByCategory = useMemo(() => {
    const map = new Map<string, ToolCatalogEntry[]>();
    for (const tool of catalog) {
      const cat = tool.category || 'other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(tool);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const toggleTool = (name: string) => {
    const current = form.getValues('model_tools');
    if (current.includes(name)) {
      form.setValue(
        'model_tools',
        current.filter((t) => t !== name),
        { shouldDirty: true }
      );
    } else {
      form.setValue('model_tools', [...current, name], { shouldDirty: true });
    }
  };

  const handleSubmit = async (data: FormValues) => {
    if (!modelName) return;
    setIsSubmitting(true);
    try {
      await saveModelToolConfig(modelName, {
        display_name: data.display_name,
        description: data.description || null,
        model_tools: data.model_tools,
        include_analytics_tools: data.include_analytics_tools,
        is_active: data.is_active,
        sort_order: data.sort_order,
      });
      toast({ title: 'Saved', description: 'Model tools updated.' });
      navigate('/settings/ai-templates?tab=tools');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Save failed';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Model Tools</h1>
          <p className="text-sm text-gray-600 mt-1 font-mono">{modelName}</p>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground"
          onClick={() => navigate('/settings/ai-templates?tab=tools')}
        >
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
          <CardTitle className="text-xl font-semibold text-gray-900">Tool assignment</CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            Select tools the agent may call when <span className="font-mono">{modelName}</span> is the page model.
            Unified chat also adds analytics tools when enabled below.
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="display_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sort_order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                          />
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
                        <textarea
                          {...field}
                          className="flex min-h-[72px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-wrap gap-6">
                  <FormField
                    control={form.control}
                    name="include_analytics_tools"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-3 rounded-lg border p-4">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div>
                          <FormLabel className="!mt-0">Include analytics tools</FormLabel>
                          <p className="text-xs text-muted-foreground">
                            Adds getAnalyticsContext + analyticsQuery on unified chat
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-3 rounded-lg border p-4">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div>
                          <FormLabel className="!mt-0">Active</FormLabel>
                          <p className="text-xs text-muted-foreground">
                            When off, code defaults are used instead
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <div>
                  <FormLabel className="text-base">Enabled tools ({selectedTools.length})</FormLabel>
                  <p className="text-sm text-gray-500 mb-4">
                    Session tools (createPlan, completeStep) are always added in workbench sessions.
                  </p>
                  <div className="space-y-6">
                    {toolsByCategory.map(([category, tools]) => (
                      <div key={category}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                          {CATEGORY_LABELS[category] ?? category}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {tools.map((tool) => {
                            const checked = selectedTools.includes(tool.name);
                            return (
                              <label
                                key={tool.name}
                                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                                  checked
                                    ? 'border-blue-300 bg-blue-50'
                                    : 'border-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={checked}
                                  onChange={() => toggleTool(tool.name)}
                                />
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{tool.label}</p>
                                  <p className="text-xs font-mono text-gray-400">{tool.name}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">{tool.description}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/settings/ai-templates?tab=tools')}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving…' : 'Save tools'}
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
