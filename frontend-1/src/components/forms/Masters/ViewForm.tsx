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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeEditor } from '@/components/ui/code-editor';

import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DatagraphBuilder } from './DatagraphBuilder';
import { DatagraphConfig } from './DatagraphBuilder/types';

const viewSchema = z.object({
    name: z.string().optional(),
    model_name: z.string().optional(),
    description: z.string().min(1, { message: 'Description is required' }),
    data_graph: z.record(z.any()).optional(),
});

type ViewFormValues = z.infer<typeof viewSchema>;

interface ViewFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
}

export const ViewForm: React.FC<ViewFormProps> = () => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
    const [jsonEditorValue, setJsonEditorValue] = useState('');

    const form = useForm<ViewFormValues>({
        resolver: zodResolver(viewSchema),
        defaultValues: {
            name: '',
            model_name: '',
            description: '',
            data_graph: {},
        },
    });

    // Watch model_name for DatagraphBuilder
    const modelName = form.watch('model_name');
    const dataGraph = form.watch('data_graph');

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id]);

    // Sync JSON editor with form data when switching tabs
    useEffect(() => {
        if (editorMode === 'json') {
            setJsonEditorValue(JSON.stringify(dataGraph || {}, null, 2));
        }
    }, [editorMode, dataGraph]);

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        // For view model, viewId is the same as id
        const viewIdToUse = viewId || id;
        viewAPI.getById("view", id, viewIdToUse)
            .then((res: any) => {
                setInitialValues(res.data);
                const dataGraphValue = res.data.data_graph || {};
                form.reset({
                    name: res.data.name || '',
                    model_name: res.data.model_name || '',
                    description: res.data.description || '',
                    data_graph: dataGraphValue,
                });
                setJsonEditorValue(JSON.stringify(dataGraphValue, null, 2));
                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to fetch view details",
                });
            });
    };

    const handleDatagraphChange = (newDatagraph: DatagraphConfig) => {
        form.setValue('data_graph', newDatagraph, { shouldDirty: true });
    };

    const handleJsonEditorChange = (value: string) => {
        setJsonEditorValue(value);
        // Try to parse and update form if valid JSON
        try {
            const parsed = JSON.parse(value);
            form.setValue('data_graph', parsed, { shouldDirty: true });
        } catch {
            // Invalid JSON - don't update form, user is still typing
        }
    };

    const handleSubmit = async (data: ViewFormValues) => {
        try {
            setIsSubmitting(true);

            // If in JSON mode, validate and parse the JSON
            if (editorMode === 'json') {
                try {
                    const parsed = JSON.parse(jsonEditorValue);
                    data.data_graph = parsed;
                } catch (error) {
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: "Invalid JSON in Data Graph field",
                    });
                    setIsSubmitting(false);
                    return;
                }
            }

            // Only include fields with update permission
            const submissionData: any = {};
            if (data.name !== undefined && data.name !== '') {
                submissionData.name = data.name;
            }
            if (data.model_name !== undefined && data.model_name !== '') {
                submissionData.model_name = data.model_name;
            }
            // description is required
            submissionData.description = data.description;
            // Include data_graph if it has any fields
            if (data.data_graph && Object.keys(data.data_graph).length > 0) {
                submissionData.data_graph = data.data_graph;
            }

            if (!id) {
                // Create new view
                const viewIdToUse = viewId || 'view';
                await viewAPI.create(
                    "view",
                    viewIdToUse,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "View created successfully",
                });
                navigate('/settings/views');
            } else {
                // Update existing view
                // For view model, viewId is the same as id
                const viewIdToUse = viewId || id;
                await viewAPI.update(
                    "view",
                    id,
                    viewIdToUse,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "View updated successfully",
                });
            }
            navigate('/settings/views');
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

    const handleCancel = () => {
        navigate('/settings/views');
    };

    return (
        <div className="mx-auto w-[90%] max-w-6xl">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">View Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit View' : 'Create New View'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/settings/views')}
                >
                    <ArrowLeft size={16} />
                    Back to list
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>
                        {initialValues ? 'Edit View' : 'Create New View'}
                    </CardTitle>
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
                                <Skeleton className="h-24 w-full" />
                            </div>
                            <div>
                                <Skeleton className="h-4 w-[120px] mb-2" />
                                <Skeleton className="h-32 w-full" />
                            </div>
                            <div className="flex justify-end space-x-2">
                                <Skeleton className="h-10 w-[100px]" />
                                <Skeleton className="h-10 w-[100px]" />
                            </div>
                        </div>
                    ) : (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Name</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="Enter name"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="model_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Model Name</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="Enter model name (e.g., supplier)"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                <p className="text-xs text-muted-foreground">
                                                    Enter the Prisma model name to enable the visual datagraph builder.
                                                </p>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description <span className="text-red-500">*</span></FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Enter description"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="data_graph"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Data Graph</FormLabel>
                                            <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as 'visual' | 'json')}>
                                                <TabsList className="mb-2">
                                                    <TabsTrigger value="visual">Visual Editor</TabsTrigger>
                                                    <TabsTrigger value="json">JSON Editor</TabsTrigger>
                                                </TabsList>
                                                <TabsContent value="visual" className="mt-0">
                                                    <FormControl>
                                                        <DatagraphBuilder
                                                            modelName={modelName || ''}
                                                            value={field.value || {}}
                                                            onChange={handleDatagraphChange}
                                                        />
                                                    </FormControl>
                                                </TabsContent>
                                                <TabsContent value="json" className="mt-0">
                                                    <FormControl>
                                                        <CodeEditor
                                                            value={jsonEditorValue}
                                                            onChange={handleJsonEditorChange}
                                                            language="json"
                                                            placeholder='{"field_name": {"permission": "read", "displayName": "Field Name"}}'
                                                            height="400px"
                                                        />
                                                    </FormControl>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Enter valid JSON format. Switch to Visual Editor for a guided experience.
                                                    </p>
                                                </TabsContent>
                                            </Tabs>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="flex justify-end space-x-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleCancel}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="bg-primary hover:bg-primary/90"
                                    >
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
