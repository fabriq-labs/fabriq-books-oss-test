import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from 'dayjs';
import { constructObject } from '@/components/utils/helper';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
const businessUnitSchema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
});
type ItemMasterValues = z.infer<typeof businessUnitSchema>;

interface ItemMasterFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    uomOptions?: any[];
    itemCategoryOptions?: any[];
    supplierOptions?: any[];
}

interface View {
    id: string;
    name: string;
    description?: string;
}

interface ViewApiResponse {
    data: View[];
    success?: boolean;
    message?: string;
}

export const UserRolesForm: React.FC<ItemMasterFormProps> = (
) => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [viewOptions, setViewOptions] = useState<View[]>([]);
    const [selectedViews, setSelectedViews] = useState<View[]>([]);
    const [isViewPopoverOpen, setIsViewPopoverOpen] = useState(false);
    const [viewSearchTerm, setViewSearchTerm] = useState('');
    const [isAddingView, setIsAddingView] = useState(false);
    const [isRemovingView, setIsRemovingView] = useState(false);
    const [removingViewId, setRemovingViewId] = useState<string | null>(null);
    const [showRemoveViewConfirmation, setShowRemoveViewConfirmation] = useState(false);
    const [viewToRemove, setViewToRemove] = useState<View | null>(null);
    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(businessUnitSchema),
        defaultValues: initialValues || {
            name: '',
        },
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
        fetchViewOptions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    const fetchViewOptions = async () => {
        try {
            const response = await viewAPI.getAll("view", "view_view", 1, 100, "", "name") as ViewApiResponse;
            setViewOptions(response.data || []);
        } catch (error) {
            console.error("Error fetching views:", error);
            toast({
                title: "Error",
                description: "Failed to fetch views",
                variant: "destructive",
            });
        }
    };

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("role", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    name: res.data.name || '',
                });

                // Set selected views if they exist - extract from role_views array
                if (res.data.role_views && Array.isArray(res.data.role_views)) {
                    const views = res.data.role_views.map((roleView: any) => roleView.view);
                    setSelectedViews(views);
                }

                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };

    const handleSubmit = async (data: ItemMasterValues) => {
        try {
            setIsSubmitting(true);

            const submissionData = {
                ...data,
            };

            if (!id) {
                // Create the role first
                const roleResponse: any = await viewAPI.create(
                    "role",
                    viewId,
                    submissionData
                );

                // Create role_view records for selected views
                if (selectedViews.length > 0 && roleResponse?.data?.id) {
                    const roleId = roleResponse.data.id;
                    for (const view of selectedViews) {
                        try {
                            await viewAPI.create("role_view", viewId || "role_view_view", {
                                role_id: roleId,
                                view_id: view.id
                            });
                        } catch (error: any) {
                            console.error(`Failed to create role_view for view ${view.id}:`, error);
                        }
                    }
                }

                toast({
                    title: "Success",
                    description: "User Role created successfully",
                });
                navigate('/settings/roles');
            } else {
                await viewAPI.update(
                    "role",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "User Role updated successfully",
                });
            }
            navigate('/settings/roles');
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
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key]);
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '');
    };

    const handleAddView = async (view: View) => {
        if (selectedViews.find(v => v.id === view.id)) {
            toast({
                title: "View already added",
                description: "This view is already mapped to the role",
                variant: "destructive",
            });
            return;
        }

        if (!id) {
            // For new roles, just add to local state
            setSelectedViews(prev => [...prev, view]);
            toast({
                title: "View added",
                description: "View will be mapped when role is created",
            });
        } else {
            // For existing roles, create role_view record directly
            setIsAddingView(true);
            try {
                await viewAPI.create("role_view", viewId || "role_view_view", { role_id: id, view_id: view.id });
                setSelectedViews(prev => [...prev, view]);
                toast({
                    title: "View added",
                    description: "View mapped successfully",
                });
            } catch (error: any) {
                toast({
                    title: "Error",
                    description: error.message || "Failed to add view",
                    variant: "destructive",
                });
            } finally {
                setIsAddingView(false);
            }
        }
        setIsViewPopoverOpen(false);
    };

    const handleRemoveView = async (viewId: string) => {
        const view = selectedViews.find(v => v.id === viewId);
        if (view) {
            setViewToRemove(view);
            setShowRemoveViewConfirmation(true);
        }
    };

    const confirmRemoveView = async () => {
        if (!viewToRemove) return;

        if (!id) {
            // For new roles, just remove from local state
            setSelectedViews(prev => prev.filter(v => v.id !== viewToRemove.id));
            toast({
                title: "View removed",
                description: "View will be removed when role is created",
            });
        } else {
            // For existing roles, delete role_view record directly
            setIsRemovingView(true);
            setRemovingViewId(viewToRemove.id);
            try {
                // Find the role_views entry that contains this view
                const roleView = initialValues?.role_views?.find((rv: any) => rv.view.id === viewToRemove.id);
                if (!roleView) {
                    toast({
                        title: "Error",
                        description: "View not found in role's views",
                        variant: "destructive",
                    });
                    return;
                }

                await viewAPI.delete("role_view", roleView.id, viewId || "role_view_view");
                setSelectedViews(prev => prev.filter(v => v.id !== viewToRemove.id));
                toast({
                    title: "View removed",
                    description: "View removed successfully",
                });
            } catch (error: any) {
                toast({
                    title: "Error",
                    description: error.message || "Failed to remove view",
                    variant: "destructive",
                });
            } finally {
                setIsRemovingView(false);
                setRemovingViewId(null);
            }
        }

        setShowRemoveViewConfirmation(false);
        setViewToRemove(null);
    };

    const filteredViewOptions = viewOptions.filter(view =>
        view.name.toLowerCase().includes(viewSearchTerm.toLowerCase()) &&
        !selectedViews.find(v => v.id === view.id)
    );

    const handleCancel = () => {
        navigate('/settings/roles');
    };

    return (
        <>
            <div className="mx-auto w-[70%]">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">User Roles</h1>
                        <p className="text-sm text-gray-600 mt-1">
                            {initialValues ? 'Edit User Role' : 'Create New User Role'}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        className="flex items-center gap-2 text-muted-foreground"
                        onClick={() => navigate('/settings/roles')}
                    >
                        <ArrowLeft size={16} />
                        Back to list
                    </Button>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>

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
                                <div className="flex justify-end space-x-2">
                                    <Skeleton className="h-10 w-[100px]" />
                                    <Skeleton className="h-10 w-[100px]" />
                                </div>
                            </div>
                        ) : (
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Name  <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormItem>
                                        <FormLabel>Views</FormLabel>
                                        <div className="space-y-3">
                                            {/* Selected Views Display */}
                                            {selectedViews.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedViews.map((view) => (
                                                        <Badge
                                                            key={view.id}
                                                            variant="secondary"
                                                            className="px-3 py-1 flex items-center gap-2 bg-blue-100 text-blue-800 hover:bg-blue-200"
                                                        >
                                                            {view.name}
                                                            {isRemovingView && removingViewId === view.id ? (
                                                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                                                            ) : (
                                                                <X
                                                                    className="h-3 w-3 cursor-pointer hover:text-blue-600"
                                                                    onClick={() => handleRemoveView(view.id)}
                                                                />
                                                            )}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Add View Button */}
                                            <Popover open={isViewPopoverOpen} onOpenChange={setIsViewPopoverOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="w-full justify-start text-left font-normal"
                                                        disabled={isAddingView}
                                                    >
                                                        {isAddingView ? (
                                                            <>
                                                                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                                                                Adding View...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Plus className="mr-2 h-4 w-4" />
                                                                Add View
                                                            </>
                                                        )}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[300px] p-0" align="start">
                                                    <div className="p-4">
                                                        <div className="mb-3">
                                                            <Input
                                                                placeholder="Search views..."
                                                                value={viewSearchTerm}
                                                                onChange={(e) => setViewSearchTerm(e.target.value)}
                                                                className="w-full"
                                                                disabled={isAddingView}
                                                            />
                                                        </div>
                                                        <div className="max-h-[200px] overflow-y-auto">
                                                            {filteredViewOptions.length === 0 ? (
                                                                <div className="text-center text-sm text-muted-foreground py-4">
                                                                    No views found.
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    {filteredViewOptions.map((view) => (
                                                                        <div
                                                                            key={view.id}
                                                                            className="flex items-center px-2 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                            onClick={() => {
                                                                                if (!isAddingView) {
                                                                                    handleAddView(view);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <div>
                                                                                <div className="font-medium">{view.name}</div>
                                                                                {view.description && (
                                                                                    <div className="text-xs text-muted-foreground">{view.description}</div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    </FormItem>

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
                                            Save
                                        </Button>
                                    </div>
                                </form>
                            </Form>)}
                    </CardContent>
                </Card>
            </div>

            {/* View Removal Confirmation Dialog */}
            <AlertDialog open={showRemoveViewConfirmation} onOpenChange={setShowRemoveViewConfirmation}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove View</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove the view{" "}
                            {viewToRemove && <strong>"{viewToRemove.name}"</strong>} from this role?
                            {id && " This action will immediately remove the view mapping from the role."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmRemoveView}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isRemovingView}
                        >
                            {isRemovingView ? 'Removing...' : 'Remove View'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};