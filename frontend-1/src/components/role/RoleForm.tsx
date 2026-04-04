
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RoleFormData } from '@/models/Role';
import { User } from '@/models/User';
import { getUsers } from '@/services/userService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const roleSchema = z.object({
  user_id: z.string().min(1, { message: 'User is required' }),
  email: z.string().email({ message: 'Valid email is required' }),
  role_name: z.string().min(1, { message: 'Role name is required' }),
});

type RoleFormValues = z.infer<typeof roleSchema>;

interface RoleFormProps {
  initialValues?: Partial<RoleFormData> & { id?: string };
  onSubmit: (data: RoleFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

const RoleForm: React.FC<RoleFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      user_id: initialValues?.user_id || '',
      email: initialValues?.email || '',
      role_name: initialValues?.role_name || '',
    },
  });

  useEffect(() => {
    const fetchUsers = async () => {
      const userData = await getUsers();
      setUsers(userData);
      setLoading(false);
    };

    fetchUsers();
  }, []);

  // Update email when user changes
  const watchUserId = form.watch('user_id');

  useEffect(() => {
    if (watchUserId) {
      const selectedUser = users.find(user => user.id === watchUserId);
      if (selectedUser) {
        form.setValue('email', selectedUser.email);
      }
    }
  }, [watchUserId, users, form]);

  const handleSubmit = async (data: RoleFormValues) => {
    const formData: RoleFormData = {
      user_id: data.user_id,
      email: data.email,
      role_name: data.role_name,
    };
    await onSubmit(formData);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initialValues?.id ? 'Edit Role' : 'Create Role'}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.username} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <Input placeholder="Email is auto-filled" readOnly {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter role name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default RoleForm;
