import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchDropDown } from '../../search_dropdown/dropdown';
import { constructObject } from '../../utils/helper';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
const itemMasterSchema = z.object({
    first_name: z.string().min(1, { message: 'First Name is required' }),
    last_name: z.string().optional(),
    email: z.string().email({ message: 'Valid email is required' }),
    legal_entity_id: z.string().min(1, { message: 'Legal Entity is required' }),
    business_unit_id: z.string().optional(),
    user_id: z.string().min(1, { message: 'User ID is required' }),
    user_role_id: z.string().min(1, { message: 'User Role is required' }),
    location_id: z.string().min(1, { message: 'Location is required' }),
    cost_center_id: z.string().min(1, { message: 'Cost Center is required' }),
    department_id: z.string().min(1, { message: 'Department is required' }),
    manager: z.string().min(1, { message: 'Manager Email is required' }),
});

type ItemMasterValues = z.infer<typeof itemMasterSchema>;

interface ItemMasterFormProps {
    initialValues?: any;
    onSubmit?: (data: any) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
    uomOptions?: any[];
    itemCategoryOptions?: any[];
    supplierOptions?: any[];
}

export const EmployeeMasterForm: React.FC<ItemMasterFormProps> = (
) => {
    const { id, viewId } = useParams<{ id: string, viewId: string }>();
    const [initialValues, setInitialValues] = useState<any>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const form = useForm<ItemMasterValues>({
        resolver: zodResolver(itemMasterSchema),
        defaultValues: initialValues || {
            first_name: '',
            last_name: '',
            email: '',
            legal_entity_id: '',
            business_unit_id: '',
            user_id: '',
            user_role_id: '',
            location_id: '',
            cost_center_id: '',
            department_id: '',
            manager: '',
        },
    });
    useEffect(() => {
        if (id) {
            fetchingDetails(id);
        }
    }, [id])

    const fetchingDetails = (id: any) => {
        setIsLoading(true);
        viewAPI.getById("employee_master", id, viewId)
            .then((res: any) => {
                setInitialValues(res.data);
                form.reset({
                    first_name: res.data.first_name || '',
                    last_name: res.data.last_name || '',
                    email: res.data.email || '',
                    legal_entity_id: res.data.legal_entity_id?.toString() || '',
                    business_unit_id: res.data.business_unit_id?.toString() || '',
                    user_id: res.data.user_id?.toString() || '',
                    user_role_id: res.data.user_role_id?.toString() || '',
                    location_id: res.data.location_id?.toString() || '',
                    cost_center_id: res.data.cost_center_id?.toString() || '',
                    department_id: res.data.department_id?.toString() || '',
                    manager: res.data.manager?.toString() || '',
                });
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
                legal_entity_id: data?.legal_entity_id,
                business_unit_id: data.business_unit_id || undefined,

            };

            if (!id) {
                await viewAPI.create(
                    "employee_master",
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Employee Master created successfully",
                });
                navigate('/settings/employees');
            } else {
                await viewAPI.update(
                    "employee_master",
                    id,
                    viewId,
                    submissionData
                );
                toast({
                    title: "Success",
                    description: "Employee Master updated successfully",
                });
            }
            navigate('/settings/employees');
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

    // const handleSelectChange = (
    //     sourceKey: any,
    //     key: string,
    //     value: any,
    //     fields: any
    // ) => {
    //     const lookupData = constructObject(value.item, fields);
    //     form.setValue(sourceKey, value[key]);
    // };

    // const handleSelectClear = (sourceKey: any) => {
    //     form.setValue(sourceKey, '');
    // };

    const handleSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
        const lookupData = constructObject(value.item, fields);
        form.setValue(sourceKey, value[key], { shouldValidate: true }); // ✅ trigger validation
    };

    const handleSelectClear = (sourceKey: any) => {
        form.setValue(sourceKey, '', { shouldValidate: true }); // ✅ trigger validation
    };


    const handleCancel = () => {
        navigate('/settings/employees');
    };

    return (

        <div className="mx-auto w-[70%]">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Employee Master</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {initialValues ? 'Edit Employee' : 'Create New Employee'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-muted-foreground"
                    onClick={() => navigate('/settings/employees')}
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="first_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>First Name <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter First name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="last_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Last Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Last Name" {...field} />
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
                                                <FormLabel>Email <span className="text-red-500">*</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter Email" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="legal_entity_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Legal Entity <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="organization"
                                                    instanceSourceKey="legal_entity_id"
                                                    instanceKey="id"
                                                    instanceLabel="legal_name"
                                                    instanceValue={
                                                        initialValues?.organization
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="legal_name"
                                                    type="employee_master"
                                                />

                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    <FormField
                                        control={form.control}
                                        name="manager"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Manager Email<span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="user"
                                                    instanceSourceKey="manager"
                                                    instanceKey="id"
                                                    instanceLabel="email"
                                                    instanceValue={
                                                        initialValues?.manager_user
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={handleSelectClear}
                                                    limit="10"
                                                    searchParams="email"
                                                    type="employee_master"
                                                />

                                                <FormMessage />
                                            </FormItem>
                                        )} />

                                    <FormField
                                        control={form.control}
                                        name="business_unit_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Business Unit</FormLabel>

                                                <SearchDropDown
                                                    instanceType="business_unit"
                                                    instanceSourceKey="business_unit_id"
                                                    instanceKey="id"
                                                    instanceLabel="business_unit"
                                                    instanceValue={
                                                        initialValues?.business_unit
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('business_unit_id')}
                                                    limit="10"
                                                    searchParams="business_unit"
                                                    type="employee_master"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )} />

                                    <FormField
                                        control={form.control}
                                        name="user_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>User<span className="text-red-500">*</span></FormLabel>

                                                <SearchDropDown
                                                    instanceType="user"
                                                    instanceSourceKey="user_id"
                                                    instanceKey="id"
                                                    instanceLabel="name"
                                                    instanceValue={
                                                        initialValues?.user
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('user_id')}
                                                    limit="10"
                                                    searchParams="name"
                                                    type="employee_master"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="user_role_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>User Role <span className="text-red-500">*</span></FormLabel>

                                                <SearchDropDown
                                                    instanceType="role"
                                                    instanceSourceKey="user_role_id"
                                                    instanceKey="id"
                                                    instanceLabel="name"
                                                    instanceValue={
                                                        initialValues?.user_role
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('user_role_id')}
                                                    limit="10"
                                                    searchParams="name"
                                                    type="employee_master"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="department_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Department <span className="text-red-500">*</span></FormLabel>

                                                <SearchDropDown
                                                    instanceType="department"
                                                    instanceSourceKey="department_id"
                                                    instanceKey="id"
                                                    instanceLabel="name"
                                                    instanceValue={
                                                        initialValues?.department
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('department_id')}
                                                    limit="10"
                                                    searchParams="name"
                                                    type="employee_master"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="location_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Location <span className="text-red-500">*</span></FormLabel>
                                                <SearchDropDown
                                                    instanceType="location"
                                                    instanceSourceKey="location_id"
                                                    instanceKey="id"
                                                    instanceLabel="location"
                                                    instanceValue={initialValues?.location}
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('location_id')}
                                                    searchParams="location"
                                                    type="employee_master"
                                                ></SearchDropDown>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="cost_center_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Cost Center <span className="text-red-500">*</span></FormLabel>

                                                <SearchDropDown
                                                    instanceType="cost_center"
                                                    instanceSourceKey="cost_center_id"
                                                    instanceKey="id"
                                                    instanceLabel="cost_center"
                                                    instanceValue={
                                                        initialValues?.cost_center
                                                    }
                                                    onSelectItem={handleSelectChange}
                                                    onClear={() => handleSelectClear('cost_center_id')}
                                                    limit="10"
                                                    searchParams="cost_center"
                                                    type="employee_master"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

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

    );
};