import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Bot } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { CodeEditor } from '@/components/ui/code-editor';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { constructObject } from '@/components/utils/helper';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getViewName } from '@/utils/modelDisplayNames';
import { appId } from '@/config/brand';

const promptTemplateSchema = z.object({
    view_id: z.string().min(1, { message: 'View/Model is required' }),
    prompt_type: z.string().min(1, { message: 'Prompt type is required' }),
    prompt_text: z.string().min(1, { message: 'Prompt text is required' }),
    is_default: z.boolean().default(false),
    version: z.number().min(1, { message: 'Version must be at least 1' }),
    priority: z.number().min(0, { message: 'Priority must be at least 0' }),
    context: z.string().optional(),
});

type PromptTemplateValues = z.infer<typeof promptTemplateSchema>;

interface PromptTemplateFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
}

export const PromptTemplateForm: React.FC<PromptTemplateFormProps> = () => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const { setPageContext, toggleChat, isChatOpen } = useChatContext();
    const [isLoading, setIsLoading] = useState(false);
    const [testRecordId, setTestRecordId] = useState<string>('');
    const [currentViewInfo, setCurrentViewInfo] = useState<{ modelName: string; viewName: string } | null>(null);
    const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
    const [dialogRecordId, setDialogRecordId] = useState<string>('');

    const form = useForm<PromptTemplateValues>({
        resolver: zodResolver(promptTemplateSchema),
        defaultValues: {
            view_id: '',
            prompt_type: '',
            prompt_text: '',
            is_default: false,
            version: 1,
            priority: 0,
            context: '',
        },
    });

    // Helper function to update page context
    const updatePageContext = useCallback((modelName: string, viewName: string, recordId: string | null) => {
        if (modelName && viewName) {
            setPageContext({
                modelName: modelName || '',
                viewName: viewName || '',
                recordId: recordId || null,
                modelDisplayName: null
            });
        }
    }, [setPageContext]);

    const fetchingDetails = useCallback((id: string) => {
        setIsLoading(true);
        viewAPI.getById("prompt_template", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);

                form.reset({
                    view_id: res.data.view.id || '',
                    prompt_type: res.data.prompt_type || '',
                    prompt_text: res.data.prompt_text || '',
                    is_default: res.data.is_default || false,
                    version: res.data.version || 1,
                    priority: res.data.priority || 0,
                    context: res.data.context || '',
                });

                // Set chat page context based on the view information
                if (res.data.view) {
                    const modelName = res.data.view.model_name;
                    const viewName = res.data.view.name || getViewName(modelName);
                    setCurrentViewInfo({ modelName, viewName });
                    // Use the testRecordId from state or the id from params
                    const recordIdToUse = testRecordId || id || null;
                    updatePageContext(modelName, viewName, recordIdToUse);
                }

                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to fetch prompt template details",
                });
            });
    }, [viewId, form, toast, testRecordId, updatePageContext]);

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }

        return () => {
            setPageContext(null);
        };
    }, [id, fetchingDetails, setPageContext]);

    const handleSubmit = async (data: PromptTemplateValues) => {
        try {
            setIsSubmitting(true);

            const submissionData = {
                ...data,
                app_name: appId,
            };

            if (!submissionData.view_id) {
                throw new Error('View/Model is required');
            }

            if (!id) {
                await viewAPI.create(
                    "prompt_template",
                    submissionData.view_id,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Prompt template created successfully",
                });
                navigate('/settings/prompt-templates');
            } else {
                await viewAPI.update(
                    "prompt_template",
                    id,
                    submissionData.view_id,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Prompt template updated successfully",
                });
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Something went wrong",
            });
            console.error("Error:", error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSelectChange = (
        sourceKey: any,
        key: string,
        value: any,
        fields: any
    ) => {
        // const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key]);

        // Set page context when view is selected (for new prompt templates)
        if (sourceKey === 'view_id' && value.item) {
            const modelName = value.item.model_name;
            const viewName = value.item.name;
            if (modelName && viewName) {
                setCurrentViewInfo({ modelName, viewName });
                updatePageContext(modelName, viewName, testRecordId || null);
            }
        }
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '');
        // Clear page context when view is cleared
        if (sourceKey === 'view_id') {
            setCurrentViewInfo(null);
            setPageContext(null);
        }
    };

    // Update context when view info or record ID changes
    useEffect(() => {
        if (currentViewInfo) {
            const recordId = testRecordId || id || null;
            updatePageContext(currentViewInfo.modelName, currentViewInfo.viewName, recordId);
        }
    }, [testRecordId, id, currentViewInfo, updatePageContext]);

    const handleCancel = () => {
        navigate('/settings/prompt-templates');
    };

    const handleTestAIClick = () => {
        // Set dialog record ID from current test record ID (not the prompt template id)
        setDialogRecordId(testRecordId || '');
        setIsTestDialogOpen(true);
    };

    const handleTestAIConfirm = () => {
        // Record ID is optional - update context with or without it
        if (currentViewInfo) {
            // Update page context with the record ID (optional)
            updatePageContext(currentViewInfo.modelName, currentViewInfo.viewName, dialogRecordId.trim() || null);
            setTestRecordId(dialogRecordId.trim());
        } else if (initialValues?.view) {
            // For edit mode, use the view from initialValues
            const modelName = initialValues.view.model_name;
            const viewName = initialValues.view.name || getViewName(modelName);

            updatePageContext(modelName, viewName, dialogRecordId.trim() || null);
            setTestRecordId(dialogRecordId.trim());
        } else {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please select a view first",
            });
            return;
        }

        // Close dialog and open chat (only if not already open)
        setIsTestDialogOpen(false);
        if (!isChatOpen) {
            toggleChat();
        }
    };

    // Get current page context info
    const getCurrentContextInfo = () => {
        if (currentViewInfo) {
            return {
                modelName: currentViewInfo.modelName,
                viewName: currentViewInfo.viewName,
                recordId: dialogRecordId || testRecordId || null
            };
        } else if (initialValues?.view) {
            return {
                modelName: initialValues.view.model_name,
                viewName: initialValues.view.name || getViewName(initialValues.view.model_name),
                recordId: dialogRecordId || testRecordId || null
            };
        }
        return null;
    };

    const contextInfo = getCurrentContextInfo();

    return (
        <div className="w-full">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Prompt Template</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Prompt Template' : 'Create New Prompt Template'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {id && (
                        <Button
                            variant="outline"
                            className="flex items-center gap-2"
                            onClick={handleTestAIClick}
                        >
                            <Bot size={16} />
                            Test AI
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        className="flex items-center gap-2 text-muted-foreground"
                        onClick={() => navigate('/settings/prompt-templates')}
                    >
                        <ArrowLeft size={16} />
                        Back to list
                    </Button>
                </div>
            </div>

            <Card className="shadow-sm border-gray-200">
                <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
                    <CardTitle className="text-xl font-semibold text-gray-900">Template Details</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                        Configure your prompt template with proper formatting and variables
                    </p>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-6">
                            <div>
                                <Skeleton className="h-4 w-[100px] mb-2" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                            <div>
                                <Skeleton className="h-4 w-[120px] mb-2" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                            <div>
                                <Skeleton className="h-4 w-[100px] mb-2" />
                                <Skeleton className="h-32 w-full" />
                            </div>
                            <div className="flex justify-end space-x-2">
                                <Skeleton className="h-10 w-[100px]" />
                                <Skeleton className="h-10 w-[100px]" />
                            </div>
                        </div>
                    ) : (
                        <Form {...form}>
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="view_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>View/Model</FormLabel>
                                                <SearchDropDown
                                                    instanceType="view"
                                                    instanceSourceKey="view_id"
                                                    instanceKey="id"
                                                    instanceLabel="name"
                                                    instanceValue={initialValues?.view}
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('view_id')}
                                                    limit="10"
                                                    searchParams="name"
                                                    type="prompt_template"
                                                    rest={{
                                                        instanceSubLabel: "model_name"
                                                    }}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="prompt_type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm font-medium text-gray-700">Prompt Type</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder="e.g., Email, Chat, Analysis, etc."
                                                        className="focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="version"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm font-medium text-gray-700">Version</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        {...field}
                                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                                        placeholder="1"
                                                        className="focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="priority"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm font-medium text-gray-700">Priority</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        {...field}
                                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                                        placeholder="0"
                                                        className="focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="prompt_text"
                                    render={({ field }) => (
                                        <FormItem>
                                            <div className="mb-3">
                                                <FormLabel className="text-base font-medium text-gray-900">Prompt Template</FormLabel>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    Enter your prompt template as plain text. Use variables like {'{{variable_name}}'} for dynamic content.
                                                </p>
                                            </div>
                                            <FormControl>
                                                <CodeEditor
                                                    value={field.value || ''}
                                                    onChange={field.onChange}
                                                    language="plaintext"
                                                    placeholder="Enter your prompt template here... You can use variables like {{variable_name}} for dynamic content."
                                                    className="w-full"
                                                    height="400px"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                                    Tips for creating effective prompts:
                                                </h4>
                                                <ul className="text-xs text-blue-800 space-y-1">
                                                    <li>• Use <strong>variables</strong> like <code className="bg-blue-100 px-1 rounded text-xs">&#123;&#123;variable_name&#125;&#125;</code> for dynamic content</li>
                                                    <li>• Structure your prompt with clear sections and line breaks for better readability</li>
                                                    <li>• Use plain text formatting - line breaks and indentation will be preserved</li>
                                                    <li>• The editor supports syntax highlighting and code editing features</li>
                                                </ul>
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="context"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-medium text-gray-700">Context (Optional)</FormLabel>
                                            <FormControl>
                                                <textarea
                                                    {...field}
                                                    placeholder="Add any notes, description, or usage instructions for this template..."
                                                    className="flex min-h-[100px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="is_default"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-base">Default Template</FormLabel>
                                                <div className="text-sm text-muted-foreground">
                                                    Mark this template as the default for its type
                                                </div>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />


                                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleCancel}
                                        disabled={isSubmitting}
                                        className="px-6 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={form.handleSubmit(handleSubmit)}
                                        className="px-6 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                    >
                                        {isSubmitting ? 'Saving...' : (initialValues ? 'Update Template' : 'Create Template')}
                                    </Button>
                                </div>
                            </div>
                        </Form>
                    )}
                </CardContent>
            </Card>

            {/* Test AI Dialog */}
            <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Test AI Chat</DialogTitle>
                        <DialogDescription>
                            Review and configure the page context for testing the AI chat. The chat sidebar will open after confirmation.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {contextInfo ? (
                            <>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <span className="text-sm font-medium text-gray-700">Model Name:</span>
                                        <span className="text-sm text-gray-900">{contextInfo.modelName}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <span className="text-sm font-medium text-gray-700">View Name:</span>
                                        <span className="text-sm text-gray-900">{contextInfo.viewName}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <span className="text-sm font-medium text-gray-700">Record ID:</span>
                                        <span className="text-sm text-gray-900">{contextInfo.recordId || 'Not set'}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">
                                        Record ID (Optional)
                                    </label>
                                    <Input
                                        type="text"
                                        placeholder="Enter record ID for testing (optional)"
                                        value={dialogRecordId}
                                        onChange={(e) => setDialogRecordId(e.target.value)}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500">
                                        Optional: Enter a record ID from the model to test the chat with a specific record. Leave empty to test without a specific record context.
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-sm text-yellow-800">
                                    Please select a view first to set up the page context.
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsTestDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleTestAIConfirm}
                            disabled={!contextInfo}
                        >
                            Confirm & Open Chat
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}; 