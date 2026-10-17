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
import { cn } from '@/lib/utils';
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

import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from 'dayjs';
import { constructObject } from '@/components/utils/helper';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';

const userMasterSchema = z.object({
    name: z.string().optional(),
    email: z.string().email({ message: 'Valid email is required' }),
    manager_id: z.string().nullable().optional(),
});

type UserMasterValues = z.infer<typeof userMasterSchema>;

interface UserMasterFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
}

interface Role {
    id: string;
    name: string;
}

interface ApiResponse {
    data: Role[];
    success?: boolean;
    message?: string;
}

export const UserMasterForm: React.FC<UserMasterFormProps> = () => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [roleOptions, setRoleOptions] = useState<Role[]>([]);
    const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
    const [isRolePopoverOpen, setIsRolePopoverOpen] = useState(false);
    const [roleSearchTerm, setRoleSearchTerm] = useState('');
    const [isAddingRole, setIsAddingRole] = useState(false);
    const [isRemovingRole, setIsRemovingRole] = useState(false);
    const [removingRoleId, setRemovingRoleId] = useState<string | null>(null);
    const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
    const [roleToRemove, setRoleToRemove] = useState<Role | null>(null);

    const form = useForm<UserMasterValues>({
        resolver: zodResolver(userMasterSchema),
        defaultValues: {
            name: '',
            email: '',
            manager_id: undefined,
        },
    });

    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
        fetchRoleOptions();
    }, [id]);

    const fetchRoleOptions = async () => {
        try {
            const response = await viewAPI.getAll("role", "role_view", 1, 100, "", "name") as ApiResponse;
            setRoleOptions(response.data || []);
        } catch (error) {
            console.error("Error fetching roles:", error);
            toast({
                title: "Error",
                description: "Failed to fetch roles",
                variant: "destructive",
            });
        }
    };

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("user", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    name: res.data.name || '',
                    email: res.data.email || '',
                    manager_id: res.data.manager_id || undefined,
                });

                // Set selected roles if they exist - extract from role_users array
                if (res.data.role_users && Array.isArray(res.data.role_users)) {
                    const roles = res.data.role_users.map((roleUser: any) => roleUser.role);
                    setSelectedRoles(roles);
                }

                setIsLoading(false);
            }).catch((err) => {
                setIsLoading(false);
                console.log(err);
            });
    };

    const handleAddRole = async (role: Role) => {
        if (selectedRoles.find(r => r.id === role.id)) {
            toast({
                title: "Role already added",
                description: "This role is already assigned to the user",
                variant: "destructive",
            });
            return;
        }

        if (!id) {
            // For new users, just add to local state
            setSelectedRoles(prev => [...prev, role]);
            toast({
                title: "Role added",
                description: "Role will be assigned when user is created",
            });
        } else {
            // For existing users, call API to add role
            setIsAddingRole(true);
            try {
                await viewAPI.addChild("user", id, viewId, "role_users", { role_id: role.id });
                setSelectedRoles(prev => [...prev, role]);
                toast({
                    title: "Role added",
                    description: "Role assigned successfully",
                });
            } catch (error: any) {
                toast({
                    title: "Error",
                    description: error.message || "Failed to add role",
                    variant: "destructive",
                });
            } finally {
                setIsAddingRole(false);
            }
        }
        setIsRolePopoverOpen(false);
    };

    const handleRemoveRole = async (roleId: string) => {
        const role = selectedRoles.find(r => r.id === roleId);
        if (role) {
            setRoleToRemove(role);
            setShowRemoveConfirmation(true);
        }
    };

    const confirmRemoveRole = async () => {
        if (!roleToRemove) return;

        if (!id) {
            // For new users, just remove from local state
            setSelectedRoles(prev => prev.filter(r => r.id !== roleToRemove.id));
            toast({
                title: "Role removed",
                description: "Role will be removed when user is created",
            });
        } else {
            // For existing users, call API to remove role
            setIsRemovingRole(true);
            setRemovingRoleId(roleToRemove.id);
            try {
                // Find the role_users entry that contains this role
                const roleUser = initialValues?.role_users?.find((ru: any) => ru.role.id === roleToRemove.id);
                if (!roleUser) {
                    toast({
                        title: "Error",
                        description: "Role not found in user's roles",
                        variant: "destructive",
                    });
                    return;
                }

                await viewAPI.deleteChild("user", id, viewId, "role_users", roleUser.id);
                setSelectedRoles(prev => prev.filter(r => r.id !== roleToRemove.id));
                toast({
                    title: "Role removed",
                    description: "Role removed successfully",
                });
            } catch (error: any) {
                toast({
                    title: "Error",
                    description: error.message || "Failed to remove role",
                    variant: "destructive",
                });
            } finally {
                setIsRemovingRole(false);
                setRemovingRoleId(null);
            }
        }

        setShowRemoveConfirmation(false);
        setRoleToRemove(null);
    };

    const handleSubmit = async (data: UserMasterValues) => {
        try {
            setIsSubmitting(true);

            // Convert empty strings to null for foreign key fields to avoid FK violations
            const submissionData = {
                ...data,
                manager_id: data.manager_id === '' || !data.manager_id ? null : data.manager_id,
            };

            if (!id) {
                await viewAPI.create(
                    "user",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "User Master created successfully",
                });
                navigate('/settings/users');
            } else {
                await viewAPI.update(
                    "user",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "User Master updated successfully",
                });
            }
            navigate('/settings/users');
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
        form.setValue(sourceKey, value[key]);
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, undefined);
    };

    const handleCancel = () => {
        navigate('/settings/users');
    };

    const filteredRoleOptions = roleOptions.filter(role =>
        role.name.toLowerCase().includes(roleSearchTerm.toLowerCase()) &&
        !selectedRoles.find(r => r.id === role.id)
    );

    return (
        <>
            <div className="mx-auto w-[70%]">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">User</h1>
                        <p className="text-sm text-gray-600 mt-1">
                            {initialValues ? 'Edit User' : 'Create New User'}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        className="flex items-center gap-2 text-muted-foreground"
                        onClick={handleCancel}
                    >
                        <ArrowLeft size={16} />
                        Back to list
                    </Button>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {/* {initialValues ? 'Edit User' : 'Create User'} */}
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
                                    <Skeleton className="h-4 w-[140px] mb-2" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                                <div>
                                    <Skeleton className="h-4 w-[160px] mb-2" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                                <div>
                                    <Skeleton className="h-4 w-[180px] mb-2" />
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Name</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter name" {...field} />
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
                                                        <Input placeholder="Enter email" type="email" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="manager_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Manager</FormLabel>
                                                    <FormControl>
                                                        <SearchDropDown
                                                            instanceType="user"
                                                            instanceKey="id"
                                                            instanceSourceKey="manager_id"
                                                            instanceLabel="name"
                                                            instanceValue={initialValues?.manager}
                                                            onSelectItem={handleSelectChange}
                                                            onClear={handleSelectClear}
                                                            limit={10}
                                                            searchParams=""
                                                            type="user"
                                                            isShowSearch={true}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                    </div>

                                    <FormItem>
                                        <FormLabel>Roles</FormLabel>
                                        <div className="space-y-3">
                                            {/* Selected Roles Display */}
                                            {selectedRoles.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedRoles.map((role) => (
                                                        <Badge
                                                            key={role.id}
                                                            variant="secondary"
                                                            className="px-3 py-1 flex items-center gap-2 bg-blue-100 text-blue-800 hover:bg-blue-200"
                                                        >
                                                            {role.name}
                                                            {isRemovingRole && removingRoleId === role.id ? (
                                                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                                                            ) : (
                                                                <X
                                                                    className="h-3 w-3 cursor-pointer hover:text-blue-600"
                                                                    onClick={() => handleRemoveRole(role.id)}
                                                                />
                                                            )}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Add Role Button */}
                                            <Popover open={isRolePopoverOpen} onOpenChange={setIsRolePopoverOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="w-full justify-start text-left font-normal"
                                                        disabled={isAddingRole}
                                                    >
                                                        {isAddingRole ? (
                                                            <>
                                                                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                                                                Adding Role...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Plus className="mr-2 h-4 w-4" />
                                                                Add Role
                                                            </>
                                                        )}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[300px] p-0" align="start">
                                                    <div className="p-4">
                                                        <div className="mb-3">
                                                            <Input
                                                                placeholder="Search roles..."
                                                                value={roleSearchTerm}
                                                                onChange={(e) => setRoleSearchTerm(e.target.value)}
                                                                className="w-full"
                                                                disabled={isAddingRole}
                                                            />
                                                        </div>
                                                        <div className="max-h-[200px] overflow-y-auto">
                                                            {filteredRoleOptions.length === 0 ? (
                                                                <div className="text-center text-sm text-muted-foreground py-4">
                                                                    No roles found.
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    {filteredRoleOptions.map((role) => (
                                                                        <div
                                                                            key={role.id}
                                                                            className="flex items-center px-2 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                            onClick={() => {
                                                                                if (!isAddingRole) {
                                                                                    handleAddRole(role);
                                                                                }
                                                                            }}
                                                                        >
                                                                            {role.name}
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
                                            {isSubmitting ? 'Saving...' : 'Save'}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Role Removal Confirmation Dialog */}
            <AlertDialog open={showRemoveConfirmation} onOpenChange={setShowRemoveConfirmation}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Role</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove the role{" "}
                            {roleToRemove && <strong>"{roleToRemove.name}"</strong>} from this user?
                            {id && " This action will immediately remove the role from the user."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmRemoveRole}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isRemovingRole}
                        >
                            {isRemovingRole ? 'Removing...' : 'Remove Role'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};