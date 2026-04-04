import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { CodeEditor } from '@/components/ui/code-editor';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import Cookies from 'js-cookie';

const API_URL = import.meta.env.VITE_API_BASE_URL || '';

const GOAL_MODELS = [
  { value: '', label: 'General (no specific model)' },
  { value: 'posting', label: 'Posting' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'purchase_requisition', label: 'Purchase Requisition' },
  { value: 'payment_receipt', label: 'Payment Receipt' },
];

const MODES = [
  { value: 'supervised', label: 'Supervised — agent proposes, human approves every action' },
  { value: 'semi_auto', label: 'Semi-Auto — high-confidence actions run automatically' },
  { value: 'autonomous', label: 'Autonomous — agent executes without review' },
];

const agentTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  icon: z.string().min(1, 'Icon name is required'),
  goal_model: z.string(),
  system_prompt: z.string().min(1, 'System prompt is required'),
  user_hint: z.string().min(1, 'User hint is required'),
  default_mode: z.enum(['supervised', 'semi_auto', 'autonomous']),
  is_active: z.boolean(),
  sort_order: z.number().min(0),
});

type AgentTemplateValues = z.infer<typeof agentTemplateSchema>;

async function agentTemplateAPI(path: string, options: RequestInit = {}) {
  const token = Cookies.get('__session');
  const res = await fetch(`${API_URL}/api/agent/admin/templates${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(err.message || 'Request failed');
  }
  return res.json();
}

export const AgentTemplateForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(!!id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!id;

  const form = useForm<AgentTemplateValues>({
    resolver: zodResolver(agentTemplateSchema),
    defaultValues: {
      name: '',
      description: '',
      icon: 'bot',
      goal_model: '',
      system_prompt: '',
      user_hint: '',
      default_mode: 'supervised',
      is_active: true,
      sort_order: 0,
    },
  });

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    agentTemplateAPI(`/${id}`)
      .then((res) => {
        const t = res.data;
        form.reset({
          name: t.name ?? '',
          description: t.description ?? '',
          icon: t.icon ?? 'bot',
          goal_model: t.goal_model ?? '',
          system_prompt: t.system_prompt ?? '',
          user_hint: t.user_hint ?? '',
          default_mode: t.default_mode ?? 'supervised',
          is_active: t.is_active ?? true,
          sort_order: t.sort_order ?? 0,
        });
      })
      .catch((err) => toast({ variant: 'destructive', title: 'Error', description: err.message }))
      .finally(() => setIsLoading(false));
  }, [id, form, toast]);

  const handleSubmit = async (data: AgentTemplateValues) => {
    setIsSubmitting(true);
    try {
      const body = { ...data, goal_model: data.goal_model || null };
      if (isEditing) {
        await agentTemplateAPI(`/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast({ title: 'Saved', description: 'Agent template updated.' });
      } else {
        await agentTemplateAPI('', { method: 'POST', body: JSON.stringify(body) });
        toast({ title: 'Created', description: 'Agent template created.' });
        navigate('/settings/ai-templates?tab=agent');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Template</h1>
          <p className="text-sm text-gray-600 mt-1">
            {isEditing ? 'Edit agent template' : 'Create new agent template'}
          </p>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground"
          onClick={() => navigate('/settings/ai-templates?tab=agent')}
        >
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
          <CardTitle className="text-xl font-semibold text-gray-900">Template Details</CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            Configure the template shown in the Workbench goal-setter
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-6">
              {[...Array(5)].map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <Form {...form}>
              <div className="space-y-6">

                {/* Row 1: Name + Icon */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Reconcile Transactions" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="icon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Icon</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Lucide icon name, e.g. arrow-right-left" />
                        </FormControl>
                        <p className="text-xs text-gray-400 mt-1">
                          Any icon name from{' '}
                          <span className="font-mono">lucide.dev</span>, e.g. <span className="font-mono">tag</span>, <span className="font-mono">receipt</span>, <span className="font-mono">bot</span>
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <textarea
                          {...field}
                          placeholder="One sentence shown on the template card in GoalSetter"
                          className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-y"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Row 2: Goal Model + Default Mode */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="goal_model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Goal Model</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                          >
                            {GOAL_MODELS.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </FormControl>
                        <p className="text-xs text-gray-400 mt-1">
                          Determines which tools the agent receives
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="default_mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Mode</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                          >
                            {MODES.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* User Hint */}
                <FormField
                  control={form.control}
                  name="user_hint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>User Hint</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Reconcile all unmatched HDFC transactions for March" />
                      </FormControl>
                      <p className="text-xs text-gray-400 mt-1">
                        Placeholder text shown in the goal input box when this template is selected
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* System Prompt */}
                <FormField
                  control={form.control}
                  name="system_prompt"
                  render={({ field }) => (
                    <FormItem>
                      <div className="mb-2">
                        <FormLabel className="text-base font-medium text-gray-900">System Prompt</FormLabel>
                        <p className="text-sm text-gray-500 mt-1">
                          Prepended to the base system prompt for every session using this template.
                          Describe the task context, which tools to use, and any domain-specific rules.
                        </p>
                      </div>
                      <FormControl>
                        <CodeEditor
                          value={field.value || ''}
                          onChange={field.onChange}
                          language="plaintext"
                          placeholder="You are helping with..."
                          className="w-full"
                          height="380px"
                        />
                      </FormControl>
                      <FormMessage />
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <ul className="text-xs text-blue-800 space-y-1">
                          <li>• Explain what "uncategorized" or "unmatched" means for this task</li>
                          <li>• Name the tools the agent should use and in what order</li>
                          <li>• Include broad-search tips (e.g. ILIKE '%keyword%' not exact match)</li>
                          <li>• Remind the agent never to write data directly — always queue actions</li>
                        </ul>
                      </div>
                    </FormItem>
                  )}
                />

                {/* Row 3: Sort Order + Active */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="sort_order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <p className="text-xs text-gray-400 mt-1">Lower numbers appear first in GoalSetter</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 h-fit self-end">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Inactive templates are hidden in GoalSetter
                          </div>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/settings/ai-templates?tab=agent')}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={form.handleSubmit(handleSubmit)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSubmitting ? 'Saving…' : isEditing ? 'Update Template' : 'Create Template'}
                  </Button>
                </div>
              </div>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
