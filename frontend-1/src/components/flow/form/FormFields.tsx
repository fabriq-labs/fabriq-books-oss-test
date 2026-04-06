
import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { UseFormReturn } from 'react-hook-form';
import { FlowStateFormValues } from './useFlowStateForm';

interface FormFieldsProps {
  form: UseFormReturn<FlowStateFormValues>;
}

const FormFields: React.FC<FormFieldsProps> = ({ form }) => {
  return (
    <>
      <FormField
        control={form.control}
        name="process_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Process Name</FormLabel>
            <FormControl>
              <Input 
                placeholder="Enter process name" 
                {...field} 
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="state"
        render={({ field }) => (
          <FormItem>
            <FormLabel>State Name</FormLabel>
            <FormControl>
              <Input 
                placeholder="Enter state name" 
                {...field} 
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};

export default FormFields;
