
import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Save, X } from 'lucide-react';
import { FlowTransition, FlowTransitionFormData } from '@/models/FlowTransition';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Define form validation schema
const formSchema = z.object({
  flow_id: z.string().uuid(),
  from_state: z.string().min(1, { message: 'From state is required' }),
  to_state: z.string().min(1, { message: 'To state is required' }),
  label_name: z.string().min(1, { message: 'Label name is required' }),
});

interface FlowTransitionFormProps {
  initialValues: FlowTransition | null;
  flowId: string;
  onSubmit: (data: FlowTransitionFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

const FlowTransitionForm: React.FC<FlowTransitionFormProps> = ({
  initialValues,
  flowId,
  onSubmit,
  onCancel,
  isSubmitting,
}) => {
  const defaultValues: FlowTransitionFormData = {
    flow_id: flowId,
    from_state: initialValues?.from_state || '',
    to_state: initialValues?.to_state || '',
    label_name: initialValues?.label_name || '',
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    await onSubmit(data as FlowTransitionFormData);
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>{initialValues ? 'Edit Transition' : 'Add Transition'}</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="from_state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From State</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter from state" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="to_state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To State</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter to state" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="label_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transition Label</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter label name" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-2" />
              {initialValues ? 'Update' : 'Save'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

export default FlowTransitionForm;
