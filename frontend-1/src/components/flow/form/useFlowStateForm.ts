
import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FlowState, FlowStateFormData } from '@/models/FlowState';
import { Role } from '@/models/Role';
import { User } from '@/models/User';
import { getRoles } from '@/services/roleService';
import { getUsers } from '@/services/userService';
import { v4 as uuidv4 } from 'uuid';

// Define form validation schema
export const flowStateFormSchema = z.object({
  flow_id: z.string().uuid().optional().or(z.string()),
  process_name: z.string().min(1, { message: 'Process name is required' }),
  state: z.string().min(1, { message: 'State name is required' }),
  assigned_role: z.string().nullable(),
  visible_to: z.array(z.string()).nullable(),
});

export type FlowStateFormValues = z.infer<typeof flowStateFormSchema>;

export const useFlowStateForm = (
  initialValues: FlowState | null,
  onSubmit: (data: FlowStateFormData) => Promise<void>
) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchRoles = async () => {
      const rolesData = await getRoles();
      setRoles(rolesData);
    };

    const fetchUsers = async () => {
      const usersData = await getUsers();
      setUsers(usersData);
    };

    fetchRoles();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (initialValues?.visible_to) {
      setSelectedUsers(initialValues.visible_to);
    }
  }, [initialValues]);

  const defaultValues: FlowStateFormData = {
    flow_id: initialValues?.flow_id || uuidv4(),
    process_name: initialValues?.process_name || '',
    state: initialValues?.state || '',
    assigned_role: initialValues?.assigned_role || null,
    visible_to: initialValues?.visible_to || null,
  };

  const form = useForm<FlowStateFormValues>({
    resolver: zodResolver(flowStateFormSchema),
    defaultValues,
  });

  const handleSubmit = async (data: FlowStateFormValues) => {
    setIsSubmitting(true);
    try {
      // Ensure visible_to is properly set with the selected users
      data.visible_to = selectedUsers.length > 0 ? selectedUsers : null;
      await onSubmit(data as FlowStateFormData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUser = (email: string) => {
    setSelectedUsers(current => 
      current.includes(email)
        ? current.filter(e => e !== email)
        : [...current, email]
    );
  };

  return {
    form,
    roles,
    users,
    selectedUsers,
    isSubmitting,
    handleSubmit,
    toggleUser
  };
};
