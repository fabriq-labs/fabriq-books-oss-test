
import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Role } from '@/models/Role';
import { UseFormReturn } from 'react-hook-form';
import { FlowStateFormValues } from './useFlowStateForm';

interface RoleSelectorProps {
  form: UseFormReturn<FlowStateFormValues>;
  roles: Role[];
}

const RoleSelector: React.FC<RoleSelectorProps> = ({ form, roles }) => {
  return (
    <FormField
      control={form.control}
      name="assigned_role"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Assigned Role</FormLabel>
          <Select
            onValueChange={field.onChange}
            defaultValue={field.value || undefined}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.role_name}>
                  {role.role_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default RoleSelector;
